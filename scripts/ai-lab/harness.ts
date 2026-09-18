import Anthropic from '@anthropic-ai/sdk'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RUNS_DIR, SETS_DIR, DAMAGE_GROUPS, type DamageGroup, type DamageItem, type Manifest } from './config'
import { AI_MODEL, costOf } from '../../lib/ai/pricing'

// B2 · One way to measure every technique.
//
// A technique turns a photo into a request. The harness sends a whole set
// through the Batch API (half price), keeps every answer on disk keyed by a
// hash of the exact request (so an unchanged input is never paid for twice),
// scores the answers against the labels, and writes a results file.
//
// Spending is capped: the lab keeps a running total, and a batch whose worst
// case would take it past LAB_BUDGET_USD is refused before anything is sent.

export const LAB_BUDGET_USD = Number(process.env.LAB_BUDGET_USD ?? 7)
const BATCH_DISCOUNT = 0.5
const CACHE_DIR = join(RUNS_DIR, 'cache')
const SPEND_FILE = join(RUNS_DIR, 'spend.json')

export interface Technique {
  name: string
  promptVersion: string
  /** Output allowance per photo; also what the worst case is priced at. */
  maxTokens: number
  /** Defaults to the app's model. */
  model?: string
  /** Longest edge of the photo sent: 1024 (the sets) or 2048 (the high-res copies). */
  imageEdge?: 1024 | 2048
  build(item: DamageItem, image: string): Omit<Anthropic.MessageCreateParamsNonStreaming, 'model' | 'max_tokens'>
}

export interface Finding { group: DamageGroup; confidence: number; where?: string }

export interface ItemResult {
  id: string
  truth: DamageGroup[]
  found: Finding[]
  raw: string
  costUsd: number
  error?: string
  /** Photos of the same inspection share this, for agreement across photos. */
  inspectionId?: string
}

export interface Metrics {
  technique: string
  set: string
  photos: number
  damagedPhotos: number
  cleanPhotos: number
  /** Damaged photos where at least one real damage group was found. */
  photoRecall: number
  /** Of all true (photo, group) pairs, the share found. */
  groupRecall: number
  /** Found groups on damaged photos that the labels do not have. */
  extraGroupRate: number
  /** Clean photos with any damage reported. */
  falseAlarmRate: number
  /** Damaged photos where any damage at all was reported: what the inspector sees flagged. */
  flaggedRate: number
  /** photoRecall, counting look-alike groups as a match (puncture/tear, lamp/glass). */
  lenientPhotoRecall: number
  costPerPhotoUsd: number
  /** At six photos checked per inspection. */
  costPerInspectionUsd: number
  failed: number
  threshold: number
}

export function readManifest(): Manifest {
  return JSON.parse(readFileSync(join(SETS_DIR, 'manifest.json'), 'utf8'))
}

export function imageData(item: { file: string }, edge: 1024 | 2048 = 1024): string {
  return readFileSync(join(SETS_DIR, edge === 2048 ? `hires/${item.file}` : item.file)).toString('base64')
}

// Groups a person would accept for each other when naming the same damage: a
// hole with torn edges, and a broken lamp lens (which is glass).
const LOOKALIKE: Partial<Record<DamageGroup, DamageGroup[]>> = { puncture: ['tear'], tear: ['puncture'], lamp: ['glass'], glass: ['lamp'] }

function spent(): number {
  return existsSync(SPEND_FILE) ? JSON.parse(readFileSync(SPEND_FILE, 'utf8')).total : 0
}
function addSpend(usd: number) {
  mkdirSync(RUNS_DIR, { recursive: true })
  const prior = existsSync(SPEND_FILE) ? JSON.parse(readFileSync(SPEND_FILE, 'utf8')) : {}
  writeFileSync(SPEND_FILE, JSON.stringify({ ...prior, total: spent() + usd, updated: new Date().toISOString() }))
}

const hashOf = (params: unknown) => createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 32)

/** Reads the model's JSON answer; anything unreadable counts as no findings. */
export function parseFindings(text: string): Finding[] {
  const json = text.match(/\{[\s\S]*\}/)?.[0]
  if (!json) return []
  try {
    const list = JSON.parse(json).damage
    if (!Array.isArray(list)) return []
    return list
      .filter((d: any) => d && d.group in DAMAGE_GROUPS)
      .map((d: any) => ({ group: d.group, confidence: Math.max(0, Math.min(1, Number(d.confidence ?? 1))), where: typeof d.where === 'string' ? d.where : undefined }))
  } catch {
    return []
  }
}

/**
 * Agreement across photos: on an inspection with several photos, a damage
 * group counts only when two or more of its photos report it, or one does with
 * high confidence. Photos with no inspection (single shots) are unchanged.
 */
export function withAgreement(results: ItemResult[], strong = 0.85, threshold = 0.5): ItemResult[] {
  const seen = new Map<string, Map<string, number>>()
  for (const r of results) {
    if (!r.inspectionId) continue
    const groups = seen.get(r.inspectionId) ?? new Map<string, number>()
    for (const g of Array.from(new Set(r.found.filter(f => f.confidence >= threshold).map(f => f.group)))) groups.set(g, (groups.get(g) ?? 0) + 1)
    seen.set(r.inspectionId, groups)
  }
  return results.map(r => r.inspectionId
    ? { ...r, found: r.found.filter(f => f.confidence >= strong || (seen.get(r.inspectionId!)?.get(f.group) ?? 0) >= 2) }
    : r)
}

export function score(results: ItemResult[], technique: string, set: string, threshold = 0.5): Metrics {
  const ok = results.filter(r => !r.error)
  const damaged = ok.filter(r => r.truth.length)
  const clean = ok.filter(r => !r.truth.length)
  const kept = (r: ItemResult) => new Set(r.found.filter(f => f.confidence >= threshold).map(f => f.group))
  let pairs = 0, foundPairs = 0, extra = 0, predicted = 0
  for (const r of damaged) {
    const got = kept(r)
    pairs += r.truth.length
    foundPairs += r.truth.filter(g => got.has(g)).length
    predicted += got.size
    extra += Array.from(got).filter(g => !r.truth.includes(g)).length
  }
  const cost = results.reduce((s, r) => s + r.costUsd, 0)
  const perPhoto = results.length ? cost / results.length : 0
  return {
    technique,
    set,
    photos: results.length,
    damagedPhotos: damaged.length,
    cleanPhotos: clean.length,
    photoRecall: damaged.length ? damaged.filter(r => r.truth.some(g => kept(r).has(g))).length / damaged.length : 0,
    groupRecall: pairs ? foundPairs / pairs : 0,
    extraGroupRate: predicted ? extra / predicted : 0,
    falseAlarmRate: clean.length ? clean.filter(r => kept(r).size > 0).length / clean.length : 0,
    flaggedRate: damaged.length ? damaged.filter(r => kept(r).size > 0).length / damaged.length : 0,
    lenientPhotoRecall: damaged.length ? damaged.filter(r => { const got = kept(r); return r.truth.some(g => got.has(g) || (LOOKALIKE[g] ?? []).some(l => got.has(l))) }).length / damaged.length : 0,
    costPerPhotoUsd: perPhoto,
    // Sent live (not batched) in the app, so the in-app cost is twice the lab's.
    costPerInspectionUsd: (perPhoto / BATCH_DISCOUNT) * 6,
    failed: results.length - ok.length,
    threshold,
  }
}

/** Runs a technique over a set and returns per-photo results. Cached answers are reused. */
export async function run(technique: Technique, setName: string, items: DamageItem[]): Promise<ItemResult[]> {
  const client = new Anthropic()
  mkdirSync(CACHE_DIR, { recursive: true })
  const requests = items.map(item => {
    const params = { model: technique.model ?? AI_MODEL, max_tokens: technique.maxTokens, ...technique.build(item, imageData(item, technique.imageEdge)) } as Anthropic.MessageCreateParamsNonStreaming
    return { item, params, key: hashOf(params) }
  })
  const todo = requests.filter(r => !existsSync(join(CACHE_DIR, `${r.key}.json`)))

  if (todo.length) {
    // Worst case: every input token plus every allowed output token, at batch price.
    const model = technique.model ?? AI_MODEL
    const sample = await client.messages.countTokens({ model, system: todo[0].params.system, messages: todo[0].params.messages })
    const worst = todo.length * costOf(model, { inputTokens: sample.input_tokens * 1.15, outputTokens: technique.maxTokens }) * BATCH_DISCOUNT
    console.log(`${technique.name} on ${setName}: ${todo.length} to send (${requests.length - todo.length} cached), ~${sample.input_tokens} input tokens each, worst case $${worst.toFixed(2)}; spent so far $${spent().toFixed(2)} of $${LAB_BUDGET_USD}`)
    if (spent() + worst > LAB_BUDGET_USD) throw new Error(`Refused: would pass the lab budget of $${LAB_BUDGET_USD}`)

    const batch = await client.messages.batches.create({
      requests: todo.map(r => ({ custom_id: r.key, params: r.params })),
    })
    process.stdout.write(`batch ${batch.id} `)
    let status = batch
    while (status.processing_status !== 'ended') {
      await new Promise(r => setTimeout(r, 20_000))
      status = await client.messages.batches.retrieve(batch.id)
      process.stdout.write('.')
    }
    console.log(` done: ${status.request_counts.succeeded} ok, ${status.request_counts.errored} errored`)
    let batchCost = 0
    for await (const result of await client.messages.batches.results(batch.id)) {
      const entry: Record<string, unknown> = { custom_id: result.custom_id, type: result.result.type }
      if (result.result.type === 'succeeded') {
        const m = result.result.message
        const usd = costOf(technique.model ?? AI_MODEL, { inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens, cacheReadTokens: m.usage.cache_read_input_tokens ?? 0 }) * BATCH_DISCOUNT
        batchCost += usd
        entry.text = m.content.map(b => (b.type === 'text' ? b.text : '')).join('')
        entry.usage = m.usage
        entry.costUsd = usd
        entry.stop = m.stop_reason
        writeFileSync(join(CACHE_DIR, `${result.custom_id}.json`), JSON.stringify(entry))
      } else {
        // Errors are not cached, so the next run retries them.
        entry.error = JSON.stringify(result.result).slice(0, 300)
        console.log('failed', result.custom_id, entry.error)
      }
    }
    addSpend(batchCost)
    console.log(`batch cost $${batchCost.toFixed(4)}; lab total $${spent().toFixed(4)}`)
  }

  return requests.map(r => {
    const path = join(CACHE_DIR, `${r.key}.json`)
    if (!existsSync(path)) return { id: r.item.id, truth: r.item.groups, found: [], raw: '', costUsd: 0, error: 'no result', inspectionId: r.item.inspectionId }
    const entry = JSON.parse(readFileSync(path, 'utf8'))
    return { id: r.item.id, truth: r.item.groups, found: parseFindings(entry.text ?? ''), raw: entry.text ?? '', costUsd: entry.costUsd ?? 0, inspectionId: r.item.inspectionId }
  })
}

export function saveRun(metrics: Metrics, results: ItemResult[]) {
  mkdirSync(RUNS_DIR, { recursive: true })
  writeFileSync(join(RUNS_DIR, `${metrics.technique}--${metrics.set}.json`), JSON.stringify({ metrics, results }, null, 1))
}

export function printTable(rows: Metrics[]) {
  const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(5)
  // flagged: damaged photos with any damage reported · found: with a right group ·
  // lenient: counting look-alike groups (puncture/tear, lamp/glass) as right
  console.log('\ntechnique                      set    flagged  found  lenient groups  extra  false-alarm  $/photo  $/insp(live)')
  for (const m of rows) {
    console.log(`${m.technique.padEnd(30)} ${m.set.padEnd(6)} ${pct(m.flaggedRate ?? 0)}  ${pct(m.photoRecall)}  ${pct(m.lenientPhotoRecall ?? 0)}  ${pct(m.groupRecall)}  ${pct(m.extraGroupRate)}  ${pct(m.falseAlarmRate).padStart(11)}  ${m.costPerPhotoUsd.toFixed(4)}  ${m.costPerInspectionUsd.toFixed(3).padStart(8)}${m.failed ? `  (${m.failed} failed)` : ''}`)
  }
}

// B1 · Builds the lab's datasets.
//
//   npx tsx scripts/ai-lab/build-sets.ts
//
// Writes resized images and manifest.json to the private sets folder. The
// same inputs always give the same sets (seeded), and nothing is ever in two
// sets, so the model is never tested on its own example photos:
//
//   damage.examples  VehiDE photos kept for showing the model what each damage looks like
//   damage.tuning    VehiDE photos plus customer photos with no recorded damage,
//                    used to compare techniques
//   damage.test      the same mix, used once, at the end, to score the winner
//   realDamage       customer damage close-ups (lot damage, not collisions)
//   quality          customer photos degraded in code: blurry, dark, badly framed
//   gauges           odometer close-ups with the reading that was typed
//   recommendations  completed customer inspections, for the rulebook
//
// Customer photos come only from paying customers' accounts, and a customer
// inspection's photos all land in the same set.

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { SETS_DIR, VEHIDE_DIR, IMAGE_EDGE, VEHIDE_CLASS, loadEnv, shuffle, type DamageItem, type DamageGroup, type Manifest, type QualityItem } from './config'

loadEnv()

const PAYING = ['Big Rig Parking', 'Park My Tractor', 'Anew Transport']
const EXTERIOR = ['exteriorFrontPhoto', 'exteriorRearPhoto', 'exteriorDriverPhoto', 'exteriorPassengerPhoto']
const PER_GROUP = { examples: 2, tuning: 12, test: 12 }
const CLEAN_INSPECTIONS = { tuning: 20, test: 20 }

async function main() {
  const { createAdminClient } = await import('../../lib/supabase/admin')
  const db = createAdminClient()
  for (const dir of ['damage', 'customer', 'quality', 'gauges']) mkdirSync(join(SETS_DIR, dir), { recursive: true })

  const save = async (buffer: Buffer, rel: string) => {
    const out = await sharp(buffer).rotate().resize({ width: IMAGE_EDGE, height: IMAGE_EDGE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    writeFileSync(join(SETS_DIR, rel), out)
    return out
  }
  const download = async (url: string): Promise<Buffer | null> => {
    if (typeof url !== 'string') return null
    if (url.startsWith('data:image')) return Buffer.from(url.split(',')[1], 'base64')
    const res = await fetch(url).catch(() => null)
    if (res?.ok) return Buffer.from(await res.arrayBuffer())
    const path = decodeURIComponent(url.split('/inspection-photos/')[1]?.split('?')[0] ?? '')
    if (!path) return null
    const { data } = await db.storage.from('inspection-photos').download(path)
    return data ? Buffer.from(await data.arrayBuffer()) : null
  }

  // ── VehiDE ───────────────────────────────────────────────────────────────
  const annos: Record<string, { name: string; regions: Array<{ all_x: number[]; all_y: number[]; class: string }> }> =
    JSON.parse(readFileSync(join(VEHIDE_DIR, '0Val_via_annos.json'), 'utf8'))
  const byGroup = new Map<DamageGroup, typeof annos[string][]>()
  for (const img of Object.values(annos)) {
    const regions = (img.regions ?? []).filter(r => VEHIDE_CLASS[r.class])
    if (regions.length < 1 || regions.length > 4) continue
    // The photo's main damage is its largest labelled region.
    const area = (r: typeof regions[number]) => (Math.max(...r.all_x) - Math.min(...r.all_x)) * (Math.max(...r.all_y) - Math.min(...r.all_y))
    const main = VEHIDE_CLASS[[...regions].sort((a, b) => area(b) - area(a))[0].class]
    byGroup.set(main, [...(byGroup.get(main) ?? []), { ...img, regions }])
  }
  const damage: Manifest['damage'] = { examples: [], tuning: [], test: [] }
  for (const [group, images] of byGroup) {
    const picked = shuffle(images, 11)
    let at = 0
    for (const split of ['examples', 'tuning', 'test'] as const) {
      for (const img of picked.slice(at, at + PER_GROUP[split])) {
        const rel = `damage/${img.name}`
        // The boxes are in the original's pixels, so its size is read before resizing.
        const raw = execFileSync('unzip', ['-p', join(VEHIDE_DIR, 'vehide.zip'), `validation/validation/${img.name}`], { maxBuffer: 64 * 1024 * 1024 })
        const { width: w = 1, height: h = 1 } = await sharp(raw).metadata()
        if (!existsSync(join(SETS_DIR, rel))) await save(raw, rel)
        damage[split].push({
          id: `v-${img.name.replace(/\.jpg$/i, '')}`,
          file: rel,
          source: 'vehide',
          groups: [...new Set(img.regions.map(r => VEHIDE_CLASS[r.class]))],
          boxes: img.regions.map(r => ({
            group: VEHIDE_CLASS[r.class],
            x: Math.min(...r.all_x) / w, y: Math.min(...r.all_y) / h,
            w: (Math.max(...r.all_x) - Math.min(...r.all_x)) / w, h: (Math.max(...r.all_y) - Math.min(...r.all_y)) / h,
          })),
        })
      }
      at += PER_GROUP[split]
    }
    console.log(`vehide ${group}: ${images.length} candidates`)
  }

  // ── Customer photos ──────────────────────────────────────────────────────
  const { data: companies } = await db.from('companies').select('id, name').in('name', PAYING)
  const companyIds = (companies ?? []).map(c => c.id)
  const { data: inspections } = await db.from('vehicle_inspections')
    .select('id, company_id, status, odometer, exterior_data, interior_data')
    .in('company_id', companyIds).eq('status', 'completed').order('created_at')
  const { data: pinned } = await db.from('damage_markers').select('inspection_id').not('inspection_id', 'is', null)
  const hasPins = new Set((pinned ?? []).map(p => p.inspection_id))
  const listDamage = (i: any) => (Array.isArray(i.exterior_data?.damages) ? i.exterior_data.damages : [])

  // No recorded damage: no pins and no list damage. Recorded is not the same as
  // none, so a false alarm on these is reviewed by eye before it counts.
  const clean = shuffle((inspections ?? []).filter(i => !hasPins.has(i.id) && listDamage(i).length === 0 && EXTERIOR.some(k => i.exterior_data?.[k])), 23)
  const addClean = async (split: 'tuning' | 'test', list: any[]) => {
    for (const insp of list) {
      const keys = shuffle(EXTERIOR.filter(k => insp.exterior_data?.[k]), insp.id.charCodeAt(0)).slice(0, 2)
      for (const key of keys) {
        const rel = `customer/${insp.id.slice(0, 8)}-${key}.jpg`
        if (!existsSync(join(SETS_DIR, rel))) {
          const raw = await download(insp.exterior_data[key]); if (!raw) continue
          await save(raw, rel)
        }
        damage[split].push({ id: `c-${insp.id.slice(0, 8)}-${key}`, file: rel, source: 'customer', groups: [], inspectionId: insp.id })
      }
    }
  }
  await addClean('tuning', clean.slice(0, CLEAN_INSPECTIONS.tuning))
  await addClean('test', clean.slice(CLEAN_INSPECTIONS.tuning, CLEAN_INSPECTIONS.tuning + CLEAN_INSPECTIONS.test))
  const spare = clean.slice(CLEAN_INSPECTIONS.tuning + CLEAN_INSPECTIONS.test)

  // Real lot damage: list-form damage with its close-up.
  const realDamage: DamageItem[] = []
  for (const insp of inspections ?? []) {
    for (const d of listDamage(insp)) {
      const url = insp.exterior_data?.[`damage_photo_${d.id}`]
      if (!url) continue
      const rel = `customer/${insp.id.slice(0, 8)}-damage-${d.id}.jpg`
      if (!existsSync(join(SETS_DIR, rel))) { const raw = await download(url); if (!raw) continue; await save(raw, rel) }
      const group: DamageGroup = d.type === 'dent' ? 'dent' : d.type === 'glass_damage' ? 'glass' : d.type === 'missing_part' ? 'missing' : 'scratch'
      realDamage.push({ id: `r-${d.id}`, file: rel, source: 'customer', groups: [group], inspectionId: insp.id })
    }
  }

  // ── Photo quality: good originals and three kinds of bad copy ────────────
  const quality: QualityItem[] = []
  for (const insp of spare) {
    for (const key of EXTERIOR.filter(k => insp.exterior_data?.[k]).slice(0, 3)) {
      const base = `${insp.id.slice(0, 8)}-${key}`
      const orig = join(SETS_DIR, `quality/${base}-none.jpg`)
      let img: Buffer
      if (existsSync(orig)) img = readFileSync(orig)
      else { const raw = await download(insp.exterior_data[key]); if (!raw) continue; img = await save(raw, `quality/${base}-none.jpg`) }
      const meta = await sharp(img).metadata()
      const variants: Record<QualityItem['problem'], () => Promise<Buffer>> = {
        none: async () => img,
        blurry: () => sharp(img).blur(9).jpeg({ quality: 85 }).toBuffer(),
        dark: () => sharp(img).modulate({ brightness: 0.18 }).jpeg({ quality: 85 }).toBuffer(),
        // Only a corner of the vehicle in frame: the top-left 40%.
        framing: () => sharp(img).extract({ left: 0, top: 0, width: Math.round(meta.width! * 0.4), height: Math.round(meta.height! * 0.4) }).resize({ width: IMAGE_EDGE, height: IMAGE_EDGE, fit: 'inside' }).jpeg({ quality: 85 }).toBuffer(),
      }
      for (const problem of Object.keys(variants) as QualityItem['problem'][]) {
        const rel = `quality/${base}-${problem}.jpg`
        if (!existsSync(join(SETS_DIR, rel))) writeFileSync(join(SETS_DIR, rel), await variants[problem]())
        quality.push({ id: `q-${base}-${problem}`, file: rel, original: `quality/${base}-none.jpg`, problem })
      }
    }
  }

  // ── Gauges: odometer close-ups with a typed reading ──────────────────────
  const { data: allInspections } = await db.from('vehicle_inspections').select('id, odometer, interior_data').not('odometer', 'is', null)
  const gauges: Manifest['gauges'] = []
  for (const insp of allInspections ?? []) {
    const url = insp.interior_data?.odometerPhoto
    if (!url || !(insp.odometer > 0)) continue
    const rel = `gauges/${insp.id.slice(0, 8)}.jpg`
    if (!existsSync(join(SETS_DIR, rel))) { const raw = await download(url); if (!raw) continue; await save(raw, rel) }
    gauges.push({ id: `g-${insp.id.slice(0, 8)}`, file: rel, odometer: insp.odometer })
  }

  const manifest: Manifest = {
    version: 1,
    created: new Date().toISOString(),
    damage,
    realDamage,
    quality,
    gauges,
    recommendations: (inspections ?? []).map(i => i.id),
  }
  writeFileSync(join(SETS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 1))

  // No photo may appear in two sets.
  const seen = new Map<string, string>()
  for (const [split, items] of Object.entries(damage)) for (const item of items) {
    if (seen.has(item.file)) throw new Error(`${item.file} is in both ${seen.get(item.file)} and ${split}`)
    seen.set(item.file, split)
  }
  const count = (items: DamageItem[]) => `${items.length} (${items.filter(i => i.groups.length).length} damaged, ${items.filter(i => !i.groups.length).length} clean)`
  console.log(`\nexamples ${count(damage.examples)}\ntuning   ${count(damage.tuning)}\ntest     ${count(damage.test)}`)
  console.log(`real lot damage ${realDamage.length} · quality ${quality.length} · gauges ${gauges.length} · inspections for rules ${manifest.recommendations.length}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })

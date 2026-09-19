// Collects a lab batch whose runner stopped before it finished, into the lab
// cache (the custom ids are the cache keys), and adds its cost to the spend.
//
//   npx tsx scripts/ai-lab/collect-batch.ts <batch id> <model>
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RUNS_DIR, loadEnv } from './config'
import { costOf } from '../../lib/ai/pricing'
loadEnv()

async function main() {
  const [id, model] = process.argv.slice(2)
  const client = new Anthropic()
  let b = await client.messages.batches.retrieve(id)
  while (b.processing_status !== 'ended') { await new Promise(r => setTimeout(r, 30_000)); b = await client.messages.batches.retrieve(id) }
  const cache = join(RUNS_DIR, 'cache'); mkdirSync(cache, { recursive: true })
  let cost = 0, n = 0
  for await (const r of await client.messages.batches.results(id)) {
    if (r.result.type !== 'succeeded') continue
    const m = r.result.message
    const usd = costOf(model, { inputTokens: m.usage.input_tokens, outputTokens: m.usage.output_tokens, cacheReadTokens: m.usage.cache_read_input_tokens ?? 0 }) * 0.5
    cost += usd; n++
    writeFileSync(join(cache, `${r.custom_id}.json`), JSON.stringify({ text: m.content.map(x => (x.type === 'text' ? x.text : '')).join(''), costUsd: usd }))
  }
  const spend = join(RUNS_DIR, 'spend.json')
  const prior = existsSync(spend) ? JSON.parse(readFileSync(spend, 'utf8')) : { total: 0 }
  writeFileSync(spend, JSON.stringify({ ...prior, total: prior.total + cost, updated: new Date().toISOString() }))
  console.log(`collected ${n} results, $${cost.toFixed(4)}`)
}
main().catch(e => { console.error(e); process.exit(1) })

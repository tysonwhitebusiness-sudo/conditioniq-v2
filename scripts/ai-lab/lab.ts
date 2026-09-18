// B · Runs one technique over one set and prints its scores.
//
//   npx tsx scripts/ai-lab/lab.ts <technique>[+agree] <tuning|test|real> [limit]
//
// +agree scores the same answers with agreement across an inspection's photos,
// so it costs nothing beyond the technique itself.
// Answers are cached, so re-running a technique only pays for what changed.

import { loadEnv } from './config'
loadEnv()

async function main() {
  const { run, score, saveRun, printTable, readManifest, withAgreement } = await import('./harness')
  const { TECHNIQUES } = await import('./techniques')
  const [arg, setName = 'tuning', limit] = process.argv.slice(2)
  const agree = arg.endsWith('+agree')
  const name = arg.replace(/\+agree$/, '')
  const technique = TECHNIQUES[name]
  if (!technique) throw new Error(`Unknown technique "${name}". Known: ${Object.keys(TECHNIQUES).join(', ')}`)
  const manifest = readManifest()
  let items = setName === 'real' ? manifest.realDamage : manifest.damage[setName as 'tuning' | 'test']
  if (!items) throw new Error(`Unknown set "${setName}"`)
  if (limit) items = items.filter((_, i) => i % Math.ceil(items.length / Number(limit)) === 0).slice(0, Number(limit))
  const raw = await run(technique, setName, items)
  const results = agree ? withAgreement(raw) : raw
  const metrics = score(results, arg, limit ? `${setName}:${limit}` : setName)
  saveRun(metrics, results)
  printTable([metrics])
  process.exit(0)
}

main().catch(e => { console.error(e.message ?? e); process.exit(1) })

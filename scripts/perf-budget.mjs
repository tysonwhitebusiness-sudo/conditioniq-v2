// L5 · Keep it fast.
//
// Runs a production build, reads how much JavaScript each route ships, and
// compares it with scripts/perf-budgets.json. A change that pushes a route past
// its budget fails here instead of on someone's phone at a lot.
//
//   npm run perf            check against the budgets
//   npm run perf -- --save  record today's sizes as the new budgets
//
// Budgets are in kilobytes of "first load JS" — everything the browser must
// download before that route can show real content.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUDGET_FILE = join(HERE, 'perf-budgets.json')
const SAVE = process.argv.includes('--save')
// How much a route may grow before the check fails.
const TOLERANCE = 1.05

console.log('Building…')
const out = execSync('npx next build', { cwd: join(HERE, '..'), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .replace(/\x1b\[[0-9;]*m/g, '')

// Route lines look like:  ├ ○ /inspections    4.94 kB    279 kB
const sizes = {}
for (const line of out.split('\n')) {
  const m = line.match(/[○ƒ●λ]\s+(\S+)\s+[\d.]+\s*[kM]?B\s+([\d.]+)\s*(kB|MB)/)
  if (!m) continue
  const [, route, value, unit] = m
  sizes[route] = Math.round(unit === 'MB' ? Number(value) * 1024 : Number(value))
}
const shared = out.match(/First Load JS shared by all\s+([\d.]+)\s*kB/)
if (shared) sizes['(shared)'] = Math.round(Number(shared[1]))

if (Object.keys(sizes).length === 0) {
  console.error('Could not read route sizes from the build output.')
  process.exit(1)
}

if (SAVE || !existsSync(BUDGET_FILE)) {
  writeFileSync(BUDGET_FILE, JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), tolerance: TOLERANCE, routes: sizes }, null, 2) + '\n')
  console.log(`Recorded ${Object.keys(sizes).length} routes as the budget.`)
  process.exit(0)
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, 'utf8'))
const over = []
const newRoutes = []
for (const [route, kb] of Object.entries(sizes)) {
  const allowed = budget.routes[route]
  if (allowed === undefined) { newRoutes.push([route, kb]); continue }
  if (kb > allowed * (budget.tolerance ?? TOLERANCE)) over.push([route, kb, allowed])
}

for (const [route, kb, allowed] of over) console.log(`OVER  ${route}  ${kb} kB (budget ${allowed} kB)`)
for (const [route, kb] of newRoutes) console.log(`NEW   ${route}  ${kb} kB — run with --save to record it`)

if (over.length) {
  console.error(`\n${over.length} route(s) over budget. Trim the route, or run with --save if the growth is intended.`)
  process.exit(1)
}
console.log(`\nAll ${Object.keys(sizes).length} routes within budget.`)

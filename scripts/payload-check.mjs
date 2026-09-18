// L5 · Keep it fast.
//
// The other half of the check: how much data a screen pulls out of the
// database. Bundle size is what the browser downloads once; this is what it
// downloads every single time the screen is opened, and it was the thing that
// made the app feel slow (53 MB for one dashboard load in September 2026).
//
//   node scripts/payload-check.mjs            check every company
//   node scripts/payload-check.mjs --json     machine-readable output
//
// Needs SUPABASE_SERVICE_ROLE_KEY in .env.local. Run it after any change to a
// list query.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { INSPECTION_LIST_COLUMNS } from '../lib/inspection-columns.ts'

// What a single screen load may pull, in kilobytes.
const LIMITS = {
  'inspections list': 400,
  dashboard: 400,
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('=')
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
  }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const kb = rows => Math.round(JSON.stringify(rows ?? []).length / 1024)

const { data: companies } = await sb.from('companies').select('id, name').order('name')
const results = []

for (const company of companies ?? []) {
  const [completed, inProgress] = await Promise.all([
    sb.from('vehicle_inspections').select(INSPECTION_LIST_COLUMNS).eq('company_id', company.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(50),
    sb.from('vehicle_inspections').select(INSPECTION_LIST_COLUMNS).eq('company_id', company.id).eq('status', 'in_progress'),
  ])
  const size = kb(completed.data) + kb(inProgress.data)
  results.push({ company: company.name, screen: 'inspections list', kb: size, limit: LIMITS['inspections list'] })
}

const failures = results.filter(r => r.kb > r.limit)

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ results, failures }, null, 2))
} else {
  for (const r of results.sort((a, b) => b.kb - a.kb)) {
    console.log(`${r.kb > r.limit ? 'OVER ' : '     '} ${String(r.kb).padStart(5)} kB  ${r.screen}  ·  ${r.company}`)
  }
  console.log(failures.length ? `\n${failures.length} over the limit.` : `\nAll ${results.length} within limit.`)
}

process.exit(failures.length ? 1 : 0)

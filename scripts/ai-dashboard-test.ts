// H · Checks the numbers on the admin AI dashboard.
//
//   npx tsx scripts/ai-dashboard-test.ts

import { acceptance, photoCheckSummary, scanSummary, spendSummary } from '../lib/ai/dashboard'

const failures: string[] = []
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`)
  if (!ok) failures.push(name)
}

const now = new Date('2026-09-19T12:00:00Z')
const call = (inspection: string | null, feature: string, status: string, cost: number, day = '2026-09-19', ms: number | null = 1000) =>
  ({ created_at: `${day}T10:00:00Z`, inspection_id: inspection, feature, status, cost_usd: String(cost), duration_ms: ms })
const s = spendSummary([
  call('a', 'damage', 'ok', 0.03), call('a', 'damage', 'ok', 0.03), call('a', 'summary', 'ok', 0.02),
  call('b', 'damage', 'ok', 0.11, '2026-09-18'), call('b', 'compare', 'skipped_ceiling', 0, '2026-09-18', null),
  call('c', 'damage', 'ok', 0.13, '2026-09-17'),
  call('d', 'damage', 'skipped_account_off', 0), call('e', 'damage', 'error', 0), call('f', 'photo_check', 'pending', 0.01),
], 0.12, 3, now)
check('total spend', Math.round(s.totalUsd * 1000) / 1000, 0.33)
check('inspections that spent anything', s.perInspection.inspections, 4)
check('average per inspection', Math.round(s.perInspection.avgUsd * 10000) / 10000, 0.0825)
check('near the ceiling (80-100%)', s.perInspection.nearCeiling, 1)
check('over the ceiling', s.perInspection.overCeiling, 1)
check('highest', s.perInspection.maxUsd, 0.13)
check('skip reasons', s.skipped, { killSwitch: 0, accountOff: 1, ceiling: 1, notConfigured: 0 })
check('unsettled reservations are counted', s.unsettled, 1)
check('costliest feature first', s.byFeature[0].feature, 'damage')
check('damage: calls, answered, skipped, errors', [s.byFeature[0].calls, s.byFeature[0].ok, s.byFeature[0].skipped, s.byFeature[0].errors], [6, 4, 1, 1])
check('a day per bar, oldest first, empty days kept', s.daily.map(d => d.day), ['2026-09-17', '2026-09-18', '2026-09-19'])

const a = acceptance([
  { kind: 'photo', damage_group: 'dent', status: 'accepted' },
  { kind: 'photo', damage_group: 'dent', status: 'edited' },
  { kind: 'photo', damage_group: 'scratch', status: 'rejected' },
  { kind: null, damage_group: 'scratch', status: 'pending' },
  { kind: 'new_since_checkin', damage_group: 'dent', status: 'rejected' },
])
check('photo suggestions: agreed is added or changed over decided', a.byKind[0], { key: 'photo', accepted: 1, edited: 1, rejected: 1, pending: 1, rate: 2 / 3 })
check('new since check-in kept apart', a.byKind[1].rate, 0)
check('by damage type, both kinds together', a.byGroup.map(g => [g.key, g.rate]), [['dent', 2 / 3], ['scratch', 0]])
check('nothing decided has no rate', acceptance([{ kind: 'photo', damage_group: 'dent', status: 'pending' }]).byKind[0].rate, null)

const p = photoCheckSummary([
  { problems: ['blurry'], right_subject: true, framed: true, odometer_status: null },
  { problems: [], right_subject: false, framed: true, odometer_status: 'mismatch' },
  { problems: null, right_subject: null, framed: null, odometer_status: 'verified' },
])
check('photo checks', [p.photos, p.phoneFlagged, p.aiChecked, p.wrongSubject, p.odometer.verified, p.odometer.mismatch], [3, 1, 2, 1, 1, 1])

const sc = scanSummary([
  { kind: 'vin', source: 'barcode', read_value: '1HGCM82633A123456', saved_value: '1HGCM82633A123456' },
  { kind: 'vin', source: 'ai', read_value: '1HGCM82633A123456', saved_value: '1HGCM82633A123457' },
  { kind: 'plate', source: 'reader', read_value: 'abc123', saved_value: 'ABC123' },
  { kind: 'plate', source: null, read_value: null, saved_value: null },
])
check('scans kept as read, case aside', sc.map(x => [x.kind, x.reads, x.saved, x.keptAsRead]), [['vin', 2, 2, 1], ['plate', 2, 1, 1]])

if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1) }
console.log('\nAll AI dashboard checks passed.')

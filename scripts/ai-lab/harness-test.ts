// B2 · Checks the harness's scoring without calling the model.
//
//   npx tsx scripts/ai-lab/harness-test.ts

import { parseFindings, score, withAgreement, type ItemResult } from './harness'

const failures: string[] = []
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); if (!ok) failures.push(name) }
const r = (truth: any[], found: any[]): ItemResult => ({ id: Math.random().toString(), truth, found, raw: '', costUsd: 0.01 })

check('reads a JSON answer', parseFindings('{"damage":[{"group":"dent","where":"door","confidence":0.8}]}').length === 1)
check('reads JSON inside prose', parseFindings('Here: {"damage":[{"group":"scratch","confidence":0.9}]} done').length === 1)
check('drops unknown groups', parseFindings('{"damage":[{"group":"rust","confidence":0.9}]}').length === 0)
check('garbage is no findings', parseFindings('not json').length === 0)
check('empty list is no findings', parseFindings('{"damage":[]}').length === 0)

const m = score([
  r(['dent'], [{ group: 'dent', confidence: 0.9 }]),                        // found
  r(['dent', 'scratch'], [{ group: 'scratch', confidence: 0.7 }, { group: 'glass', confidence: 0.6 }]), // 1 of 2, 1 extra
  r(['glass'], [{ group: 'glass', confidence: 0.3 }]),                      // below threshold: missed
  r([], []),                                                                 // clean, quiet
  r([], [{ group: 'scratch', confidence: 0.8 }]),                           // clean, false alarm
], 't', 's', 0.5)
check('photo recall 2 of 3', Math.abs(m.photoRecall - 2 / 3) < 1e-9)
check('group recall 2 of 4', Math.abs(m.groupRecall - 0.5) < 1e-9)
check('extra groups 1 of 3 kept', Math.abs(m.extraGroupRate - 1 / 3) < 1e-9)
check('false alarms 1 of 2 clean', Math.abs(m.falseAlarmRate - 0.5) < 1e-9)
check('live cost per inspection is 6 photos at twice the batch price', Math.abs(m.costPerInspectionUsd - 0.12) < 1e-9)

const a = withAgreement([
  { ...r([], [{ group: 'scratch', confidence: 0.6 }]), inspectionId: 'i1' },
  { ...r([], []), inspectionId: 'i1' },
  { ...r([], [{ group: 'dent', confidence: 0.6 }]), inspectionId: 'i2' },
  { ...r([], [{ group: 'dent', confidence: 0.7 }]), inspectionId: 'i2' },
  { ...r([], [{ group: 'glass', confidence: 0.9 }]), inspectionId: 'i3' },
  r(['dent'], [{ group: 'dent', confidence: 0.6 }]),
])
check('agreement drops a weak finding seen in one photo', a[0].found.length === 0)
check('agreement keeps a finding seen in two photos', a[2].found.length === 1 && a[3].found.length === 1)
check('agreement keeps a strong single finding', a[4].found.length === 1)
check('agreement leaves single shots alone', a[5].found.length === 1)

if (failures.length) { console.error(`${failures.length} failed`); process.exit(1) }
console.log('All harness checks passed.')

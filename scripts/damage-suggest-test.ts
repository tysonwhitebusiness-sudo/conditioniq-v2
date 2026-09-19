// F · Checks the mapping from the damage model's words to AIAG areas, and
// which suggestions are shown.
//
//   npx tsx scripts/damage-suggest-test.ts

import { mapArea, mapType, parseDamageFindings, suggestionsToShow, suggestionsToShowAll, GROUP_AIAG_TYPE } from '../lib/ai/damage-suggest'
import { parseCompare, storagePathFromPhotoUrl } from '../lib/ai/checkin-compare'

const failures: string[] = []
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`)
  if (!ok) failures.push(name)
}

// Areas: the words decide, the photo fills in the side or end.
check('front bumper from the front photo', mapArea('front bumper, lower left', 'exteriorFrontPhoto'), 3)
check('bumper in the rear photo is the rear bumper', mapArea('bumper corner', 'exteriorRearPhoto'), 4)
check('driver photo, front door is left front', mapArea('front door lower area', 'exteriorDriverPhoto'), 10)
check('passenger photo, rear door is right rear', mapArea('rear door', 'exteriorPassengerPhoto'), 13)
check('words beat the photo: left fender seen from the front', mapArea('left front fender', 'exteriorFrontPhoto'), 14)
check('rear fender on the passenger side', mapArea('rear fender', 'exteriorPassengerPhoto'), 83)
check('quarter panel on the driver side', mapArea('rear quarter panel', 'exteriorDriverPhoto'), 15)
check('hood', mapArea('hood near the windshield base', 'exteriorFrontPhoto'), 20) // windshield named first wins
check('hood alone', mapArea('center of the hood', 'exteriorFrontPhoto'), 27)
check('headlight', mapArea('left headlight lens', 'exteriorFrontPhoto'), 24)
check('tail light', mapArea('right tail light', 'exteriorRearPhoto'), 45)
check('driver mirror', mapArea('side mirror housing', 'exteriorDriverPhoto'), 30)
check('front wheel on the passenger side', mapArea('front wheel rim', 'exteriorPassengerPhoto'), 79)
check('trunk lid', mapArea('trunk lid edge', 'exteriorRearPhoto'), 52)
check('a door with no end is left for the inspector', mapArea('door', 'exteriorDriverPhoto'), null)
check('unplaceable text is left for the inspector', mapArea('lower panel', 'exteriorDriverPhoto'), null)
check('a broken lamp with no words uses the photo end', mapArea('lens', 'exteriorRearPhoto', 'lamp'), 45)
check('each group has a starting AIAG type', Object.keys(GROUP_AIAG_TYPE).length, 7)
check('a scratch on the windshield uses the glass code', mapType('scratch', 20), 23)
check('a scratch on a door uses the paint code', mapType('scratch', 10), 12)
check('a crack in the rear glass is glass cracked', mapType('tear', 21), 20)

// Parsing
check('parses the damage answer', parseDamageFindings('{"damage":[{"group":"dent","where":"rear door","confidence":0.7}]}'), [{ group: 'dent', where: 'rear door', confidence: 0.7 }])
check('drops unknown groups', parseDamageFindings('{"damage":[{"group":"rust","where":"x","confidence":0.9}]}'), [])

// What is shown (0.5 cutoff; a single photo needs 0.85 or another photo agreeing)
const s = (id: string, slot: string, group: string, confidence: number, status = 'pending') => ({ id, slot, damage_group: group, confidence, status })
const shown = suggestionsToShow([
  s('a', 'exteriorFrontPhoto', 'scratch', 0.9),   // strong alone: shown
  s('b', 'exteriorFrontPhoto', 'dent', 0.6),      // weak, only one photo: hidden
  s('c', 'exteriorDriverPhoto', 'tear', 0.6),     // weak but seen in two photos: both shown
  s('d', 'exteriorRearPhoto', 'tear', 0.55),
  s('e', 'exteriorRearPhoto', 'scratch', 0.4),    // below the cutoff: hidden
  s('f', 'exteriorRearPhoto', 'glass', 0.95, 'rejected'), // decided: hidden
]).map(x => x.id)
check('shows strong or agreeing suggestions only', shown, ['a', 'c', 'd'])

// G · Check-out against check-in
check('reads a comparison', parseCompare('{"comparable":true,"newDamage":[{"group":"dent","where":"rear door","confidence":0.8}]}')?.newDamage.length, 1)
check('not comparable drops anything reported', parseCompare('{"comparable":false,"newDamage":[{"group":"dent","where":"x","confidence":0.9}]}')?.newDamage.length, 0)
check('v2: only damage clearly absent at check-in is new', parseCompare('{"comparable":true,"damage":[{"group":"dent","where":"a","atCheckin":"visible","confidence":0.9},{"group":"glass","where":"b","atCheckin":"not_there","confidence":0.9},{"group":"scratch","where":"c","atCheckin":"cant_see","confidence":0.9}]}')?.newDamage.map(d => d.group), ['glass'])
check('an unreadable answer is not new damage', parseCompare('sorry'), null)
check('a public photo link names its path', storagePathFromPhotoUrl('https://x.supabase.co/storage/v1/object/public/inspection-photos/co/insp/exteriorFrontPhoto.jpg'), 'co/insp/exteriorFrontPhoto.jpg')
check('a signed photo link names its path', storagePathFromPhotoUrl('https://x.supabase.co/storage/v1/object/sign/inspection-photos/co/a%20b.jpg?token=t'), 'co/a b.jpg')
check('a blob link has no stored photo', storagePathFromPhotoUrl('blob:http://localhost:3000/abc'), null)
const k = (id: string, slot: string, group: string, confidence: number, kind: string) => ({ ...s(id, slot, group, confidence), kind })
const all = suggestionsToShowAll([
  k('p1', 'exteriorFrontPhoto', 'dent', 0.9, 'photo'),              // covered by the comparison card: hidden
  k('p2', 'exteriorFrontPhoto', 'scratch', 0.9, 'photo'),           // shown
  k('c1', 'exteriorFrontPhoto', 'dent', 0.8, 'new_since_checkin'),  // shown, first
  k('c2', 'exteriorRearPhoto', 'scratch', 0.6, 'new_since_checkin'),// below the comparison cutoff: hidden
], 0.7).map(x => x.id)
check('new-since-check-in first, and it replaces the same photo suggestion', all, ['c1', 'p2'])

import('../lib/ai/checkin-compare-server').then(({ checkinPhotoPath }) => {
  const ref = (url: string) => ({ id: 'ci', createdAt: '', exteriorData: { exteriorFrontPhoto: url } })
  const base = 'https://x.supabase.co/storage/v1/object/public/inspection-photos/'
  check('follows a check-in photo link inside the company', checkinPhotoPath(ref(base + 'co/old/front.jpg'), 'co', 'exteriorFrontPhoto'), 'co/old/front.jpg')
  check('never follows a link into another company', checkinPhotoPath(ref(base + 'other/x/front.jpg'), 'co', 'exteriorFrontPhoto'), 'co/ci/exteriorFrontPhoto.jpg')
  check('never follows a link that climbs out of the folder', checkinPhotoPath(ref(base + 'co/../other/front.jpg'), 'co', 'exteriorFrontPhoto'), 'co/ci/exteriorFrontPhoto.jpg')
  finish()
})

function finish() {
if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1) }
console.log('\nAll damage suggestion checks passed.')
process.exit(0)
}

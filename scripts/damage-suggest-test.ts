// F · Checks the mapping from the damage model's words to AIAG areas, and
// which suggestions are shown.
//
//   npx tsx scripts/damage-suggest-test.ts

import { mapArea, mapType, parseDamageFindings, suggestionsToShow, GROUP_AIAG_TYPE } from '../lib/ai/damage-suggest'

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

if (failures.length) { console.error(`\n${failures.length} failed`); process.exit(1) }
console.log('\nAll damage suggestion checks passed.')

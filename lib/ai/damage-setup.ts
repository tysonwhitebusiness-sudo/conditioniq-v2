// B5 · The damage setup chosen by the lab, for phase F to use as is.
//
// Chosen 18 Sep 2026 after two rounds on the same held-out test set (84
// damaged VehiDE photos, 40 clean customer photos), with agreement across an
// inspection's photos:
//
//   Opus 5, v2 prompt, 0.5 cutoff (this setup):
//     99% of damaged photos flagged, 92% with the right damage type,
//     0% false alarms on clean photos, about $0.052 per inspection (six photos)
//   Sonnet 5, tuned prompt, 0.3 cutoff (the round-1 winner):
//     95% flagged, 85% right type, 0% false alarms, about $0.019
//
// Opus finds far more dents (21/23 vs 16/23) and punctures (11/14 vs 6/14).
// Lower cutoffs give Opus 94% but bring false alarms back, mostly "missing
// license plate" on new lot vehicles. Full-size photos gave no gain for 40%
// more cost (stored photos are at most 1280 px). The long damage guide lost
// every comparison and is not used.

export const DAMAGE_SETUP_VERSION = 'damage-tuned-v2-opus'

/** The lab's pick. More accurate than Sonnet here, at about 2.7 times the cost. */
export const DAMAGE_MODEL = 'claude-opus-5'

export const DAMAGE_GROUP_LABELS = {
  scratch: 'Scratch, scuff or chip in paint',
  dent: 'Dent',
  tear: 'Torn, cracked or broken panel or trim',
  glass: 'Cracked or broken glass',
  missing: 'Missing part',
  puncture: 'Hole or puncture',
  lamp: 'Broken lamp or lens',
} as const

const GROUP_LIST = Object.entries(DAMAGE_GROUP_LABELS).map(([key, label]) => `- ${key}: ${label}`).join('\n')

const RULES = [
  'Report every damage you can see, including small ones. Confidence is how sure you are that it is real damage, not how serious it is.',
  'A hole through a panel, bumper or glass is "puncture" even when its edges are torn; use "tear" only for splits and cracks without a hole.',
  'Panel seams, door gaps, body lines, badges and reflections of trees, buildings or other vehicles are not damage.',
].map(r => `- ${r}`).join('\n')

// Added in round 2 for the mix-ups seen in round 1's misses.
const V2_RULE = '- Scratches, chips and cracks in glass (windshield, windows) are "glass". A broken or cracked headlamp, tail-lamp or marker lens is "lamp".'

const ANSWER_FORMAT = [
  'Reply with JSON only:',
  '{"damage": [{"group": "<one of the group keys>", "where": "<part of the vehicle>", "confidence": <0 to 1>}]}',
  'List each distinct damage once. If you see no damage, reply {"damage": []}.',
].join('\n')

export const DAMAGE_SYSTEM = `You look at a photo of a vehicle and report visible damage.\n\nDamage groups:\n${GROUP_LIST}\n\nRules:\n${RULES}\n${V2_RULE}\n\n${ANSWER_FORMAT}`
/** Round 1's prompt, kept so the lab can reproduce its results. */
export const DAMAGE_SYSTEM_V1 = `You look at a photo of a vehicle and report visible damage.\n\nDamage groups:\n${GROUP_LIST}\n\nRules:\n${RULES}\n\n${ANSWER_FORMAT}`
export const DAMAGE_USER_TEXT = 'Report the damage in this photo.'
export const DAMAGE_MAX_TOKENS = 400

/** Findings below this confidence are not shown. */
export const DAMAGE_THRESHOLD = 0.5
/** A finding seen in only one of an inspection's photos needs this confidence to be shown. */
export const DAMAGE_SINGLE_PHOTO_CONFIDENCE = 0.85

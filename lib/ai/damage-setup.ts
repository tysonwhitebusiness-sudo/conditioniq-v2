// B5 · The damage setup chosen by the lab, for phase F to use as is.
//
// Chosen on 18 Sep 2026 by a rule fixed before the results were seen: most
// damaged photos found, with false alarms at or under 15% and cost at or under
// $0.08 per inspection. Confidence cutoffs from 0.3 to 0.8 were scored from
// the same answers; 0.3 won. Scored once on a held-out test set:
//
//   85% of damaged photos found, 77% of damage groups, 0% false alarms on
//   clean customer photos, about $0.019 per inspection (six photos, live).
//
// Beat, on the tuning set at each one's best cutoff: the plain prompt (82%),
// the full damage guide (81%; it made the model cautious), labelled example
// photos (74% at 0.5), and the tuned prompt with thinking on (77% at 0.5, at
// higher cost). Agreement across photos is what brings false alarms to zero.

export const DAMAGE_SETUP_VERSION = 'damage-tuned-v1'

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

const ANSWER_FORMAT = [
  'Reply with JSON only:',
  '{"damage": [{"group": "<one of the group keys>", "where": "<part of the vehicle>", "confidence": <0 to 1>}]}',
  'List each distinct damage once. If you see no damage, reply {"damage": []}.',
].join('\n')

export const DAMAGE_SYSTEM = `You look at a photo of a vehicle and report visible damage.\n\nDamage groups:\n${GROUP_LIST}\n\nRules:\n${RULES}\n\n${ANSWER_FORMAT}`
export const DAMAGE_USER_TEXT = 'Report the damage in this photo.'
export const DAMAGE_MAX_TOKENS = 400

/** Findings below this confidence are not shown. */
export const DAMAGE_THRESHOLD = 0.3
/** A finding seen in only one of an inspection's photos needs this confidence to be shown. */
export const DAMAGE_SINGLE_PHOTO_CONFIDENCE = 0.85

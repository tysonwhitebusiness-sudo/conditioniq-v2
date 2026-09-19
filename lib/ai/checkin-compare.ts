import type Anthropic from '@anthropic-ai/sdk'
import { DAMAGE_GROUP_LABELS } from './damage-setup'
import type { DamageGroupKey } from './damage-suggest'

// G · Check-out against check-in: damage that shows in a check-out photo and
// was not there in the same photo at check-in.
//
// This is the finding a lot dispute turns on, so a false alarm costs the most:
// anything reported here is only ever a suggestion a person confirms, and the
// model is told to stay quiet whenever the check-in photo cannot show the spot.

export const COMPARE_VERSION = 'compare-v2'

const GROUP_LIST = Object.entries(DAMAGE_GROUP_LABELS).map(([key, label]) => `- ${key}: ${label}`).join('\n')

export const COMPARE_SYSTEM_V1 = `You compare two photos of the same side of the same vehicle. The first was taken at check-in, when the vehicle arrived. The second was taken at check-out, when it leaves.

Report damage that is clearly visible in the check-out photo and was clearly not there at check-in.

Damage groups:
${GROUP_LIST}

Rules:
- For each damage you see in the check-out photo, look at the same spot in the check-in photo. If the damage is visible there too, it is not new: do not report it.
- If that spot cannot be seen well in the check-in photo (a different angle, out of frame, glare, shadow, dirt, too far away), it cannot be shown to be new: do not report it.
- Lighting, reflections, angle, distance, dirt, water, snow and the background changing are not damage.
- If the two photos show different vehicles or different sides of the vehicle, set "comparable" to false and report nothing.
- Confidence is how sure you are that it is real damage and that it is new.

Reply with JSON only:
{"comparable": <true or false>, "newDamage": [{"group": "<one of the group keys>", "where": "<part of the vehicle>", "confidence": <0 to 1>}]}
If nothing is new, reply {"comparable": true, "newDamage": []}.`

export const COMPARE_SCHEMA_V1 = {
  type: 'object',
  properties: {
    comparable: { type: 'boolean' },
    newDamage: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          group: { type: 'string', enum: Object.keys(DAMAGE_GROUP_LABELS) },
          where: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['group', 'where', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['comparable', 'newDamage'],
  additionalProperties: false,
} as const


// v2: first every damage in the check-out photo, then, one by one, what the
// check-in photo shows at that spot. v1 asked only for new damage; on the same
// pairs v2 had no false alarm where v1 had one, and found as much.
export const COMPARE_SYSTEM = `You compare two photos of the same side of the same vehicle. The first was taken at check-in, when the vehicle arrived. The second was taken at check-out, when it leaves.

Damage groups:
${GROUP_LIST}

Step 1: list every damage you can see in the check-out photo, including small ones.
Step 2: for each one, look at the same spot in the check-in photo and say what it shows:
- "visible": the same damage is there at check-in
- "not_there": the spot is clearly visible at check-in and undamaged
- "cant_see": the spot is out of frame, too far away, or hidden by glare, shadow or dirt at check-in

Lighting, reflections, angle, distance, dirt, water and the background are not damage. Panel seams, door gaps and body lines are not damage.
If the two photos show different vehicles or different sides of the vehicle, set "comparable" to false and list nothing.

Reply with JSON only:
{"comparable": <true or false>, "damage": [{"group": "<one of the group keys>", "where": "<part of the vehicle>", "atCheckin": "visible" | "not_there" | "cant_see", "confidence": <0 to 1, how sure you are it is real damage>}]}`

export const COMPARE_SCHEMA = {
  type: 'object',
  properties: {
    comparable: { type: 'boolean' },
    damage: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          group: { type: 'string', enum: Object.keys(DAMAGE_GROUP_LABELS) },
          where: { type: 'string' },
          atCheckin: { type: 'string', enum: ['visible', 'not_there', 'cant_see'] },
          confidence: { type: 'number' },
        },
        required: ['group', 'where', 'atCheckin', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['comparable', 'damage'],
  additionalProperties: false,
} as const

export const COMPARE_MAX_TOKENS = 500

export function compareRequest(checkinJpeg: string, checkoutJpeg: string, system = COMPARE_SYSTEM): { system: string; messages: Anthropic.MessageParam[] } {
  return {
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'Check-in photo:' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: checkinJpeg } },
        { type: 'text', text: 'Check-out photo:' },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: checkoutJpeg } },
        { type: 'text', text: system === COMPARE_SYSTEM ? 'List the damage in the check-out photo and what the check-in photo shows at each spot.' : 'What damage is new since check-in?' },
      ],
    }],
  }
}

export interface CompareFinding { group: DamageGroupKey; where: string; confidence: number }
export interface CompareResult { comparable: boolean; newDamage: CompareFinding[] }

/**
 * New damage is what the check-out photo shows and the check-in photo clearly
 * does not ("not_there"). Reads both answer shapes (v1 listed only new damage).
 * Unreadable answers count as "could not compare", never as new damage.
 */
export function parseCompare(text: string): CompareResult | null {
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '')
    if (typeof j.comparable !== 'boolean') return null
    const list = Array.isArray(j.damage) ? j.damage.filter((d: any) => d?.atCheckin === 'not_there') : Array.isArray(j.newDamage) ? j.newDamage : null
    if (!list) return null
    return {
      comparable: j.comparable,
      newDamage: j.comparable
        ? list
          .filter((d: any) => d && d.group in DAMAGE_GROUP_LABELS)
          .map((d: any) => ({ group: d.group, where: typeof d.where === 'string' ? d.where.slice(0, 120) : '', confidence: Math.max(0, Math.min(1, Number(d.confidence ?? 0))) }))
        : [],
    }
  } catch {
    return null
  }
}

/**
 * The storage path inside inspection-photos for a photo link saved on an
 * inspection. Older inspections saved public links, newer ones signed links;
 * both name the path. Anything else (a blob: link from an unsynced phone) has
 * no stored photo to compare.
 */
export function storagePathFromPhotoUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/inspection-photos\/([^?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

// The lab's pick (scripts/ai-lab/compare-lab.ts), 19 Sep 2026: Sonnet 5, prompt v2, 1024 px, 0.5.
//   20 real same-vehicle pairs (customer inspections, nothing new): 0 reported (v1: 1 at 0.5)
//   30 pairs with the damage present in both photos: 0 reported
//   16 junk and different-vehicle pairs: all 16 "not comparable"
//   20 real pairs with a damage crop pasted onto the check-out photo: 6 found at 0.5, 3 at 0.7
//     (a floor: several crops landed on the ground, not the vehicle)
// About $0.006 a side live, $0.024 a check-out. Painting damage out of VehiDE
// photos was tried as a recall set and dropped: the damage stayed visible.
// Real check-outs with confirmed new damage are the recall set; every "Add"
// and "Not new" is stored and reviewed on the admin AI dashboard for that.
export const COMPARE_MODEL = 'claude-sonnet-5'
export const COMPARE_EDGE = 1024
/** Possible new damage below this confidence is stored but not shown. */
export const COMPARE_THRESHOLD = 0.5

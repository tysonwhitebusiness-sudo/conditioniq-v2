import type { DamageMarkerView } from '@/lib/damage-actions'
import { DAMAGE_GROUP_LABELS, DAMAGE_THRESHOLD, DAMAGE_SINGLE_PHOTO_CONFIDENCE } from './damage-setup'
import type { ExteriorSlot } from './damage-suggest-labels'

export { EXTERIOR_SLOTS, SLOT_LABEL, suggestionTitle, type ExteriorSlot } from './damage-suggest-labels'

// F · Turning what the damage model saw into suggestions an inspector can add.
//
// The model names a damage group and says where in its own words ("front
// bumper, lower left"). Here that becomes an AIAG area and type the picker
// already knows, using the photo's slot for which side or end it is. Anything
// that cannot be placed with confidence is left for the inspector to choose.
// Severity is never suggested: a photo cannot measure inches.

export type DamageGroupKey = keyof typeof DAMAGE_GROUP_LABELS

export interface RawFinding {
  group: DamageGroupKey
  where: string
  confidence: number
}

/** Which diagram view the inspector places the pin on. */
export const SLOT_VIEW: Record<ExteriorSlot, DamageMarkerView> = {
  exteriorFrontPhoto: 'front',
  exteriorRearPhoto: 'rear',
  exteriorDriverPhoto: 'side',
  exteriorPassengerPhoto: 'side',
}

/** The AIAG damage type a group starts as; the inspector can change it. */
export const GROUP_AIAG_TYPE: Record<DamageGroupKey, number> = {
  scratch: 12, // Scratched
  dent: 14, // Dented, paint not damaged (the inspector picks 04 if paint is broken)
  tear: 6, // Cracked
  glass: 20, // Glass cracked
  missing: 8, // Missing
  puncture: 11, // Punctured
  lamp: 6, // Cracked (the lens)
}

const GLASS_AREAS = new Set([20, 21])

/** The starting AIAG type, using the glass codes when the area is glass. */
export function mapType(group: DamageGroupKey, area: number | null): number {
  if (area != null && GLASS_AREAS.has(area)) {
    if (group === 'scratch') return 23 // Glass scratched
    if (group === 'tear' || group === 'glass') return 20 // Glass cracked
  }
  return GROUP_AIAG_TYPE[group]
}

export function parseDamageFindings(text: string): RawFinding[] {
  try {
    const list = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '').damage
    if (!Array.isArray(list)) return []
    return list
      .filter((d: any) => d && d.group in DAMAGE_GROUP_LABELS)
      .map((d: any) => ({
        group: d.group as DamageGroupKey,
        where: typeof d.where === 'string' ? d.where.slice(0, 120) : '',
        confidence: Math.max(0, Math.min(1, Number(d.confidence ?? 0))),
      }))
  } catch {
    return []
  }
}

/**
 * The AIAG area for a finding, from its words and the photo it came from.
 * US convention: the driver's side is the left. Returns null when unsure.
 */
export function mapArea(where: string, slot: ExteriorSlot, group?: DamageGroupKey): number | null {
  const w = ` ${where.toLowerCase()} `
  const has = (...words: string[]) => words.some(x => w.includes(x))

  const end: 'front' | 'rear' | null =
    has('front', 'hood', 'grille', 'headl', 'head lamp', 'windshield') ? 'front'
      : has('rear', 'back', 'tail', 'trunk', 'liftgate', 'tailgate', 'hatch') ? 'rear'
      : slot === 'exteriorFrontPhoto' ? 'front' : slot === 'exteriorRearPhoto' ? 'rear' : null
  const side: 'left' | 'right' | null =
    has('driver', ' left', 'lh ') ? 'left'
      : has('passenger', ' right', 'rh ') ? 'right'
      : slot === 'exteriorDriverPhoto' ? 'left' : slot === 'exteriorPassengerPhoto' ? 'right' : null
  const lr = (left: number, right: number) => (side === 'left' ? left : side === 'right' ? right : null)

  if (has('windshield')) return 20
  if (has('rear glass', 'back glass', 'rear window', 'back window')) return 21
  if (has('bumper')) return end === 'front' ? 3 : end === 'rear' ? 4 : null
  if (has('hood')) return 27
  if (has('roof')) return 37
  if (has('grille', 'grill ')) return 22
  if (has('fog')) return 25
  if (has('headl', 'head lamp', 'head light')) return 24
  if (has('tail light', 'taillight', 'tail lamp', 'taillamp', 'rear light', 'brake light')) return 45
  if (has('trunk', 'deck lid', 'tailgate', 'liftgate', 'hatch')) return 52
  if (has('mirror')) return lr(30, 31)
  if (has('quarter')) return lr(15, 17)
  if (has('fender')) return end === 'rear' ? lr(82, 83) : lr(14, 16)
  if (has('door')) return end === 'rear' ? lr(11, 13) : end === 'front' ? lr(10, 12) : null
  if (has('rocker', 'sill')) return lr(35, 36)
  if (has('running board', 'step')) return lr(38, 39)
  if (has('tire', 'tyre')) {
    if (end === 'front') return lr(72, 78)
    if (end === 'rear') return lr(74, 76)
    return null
  }
  if (has('wheel', 'rim')) {
    if (end === 'front') return lr(73, 79)
    if (end === 'rear') return lr(75, 77)
    return null
  }
  if (has('plate')) return 92
  if (has('antenna')) return 1
  if (has('spoiler')) return 64
  if (group === 'lamp') return end === 'front' ? 24 : end === 'rear' ? 45 : null
  return null
}

export interface StoredSuggestion {
  id: string
  slot: string
  damage_group: string
  confidence: number
  status: string
}

/**
 * Which pending suggestions to show: at or above the lab's cutoff, and either
 * confident on their own or seen in another photo of the same vehicle. This is
 * the setup that had no false alarms on clean vehicles in testing.
 */
export function suggestionsToShow<T extends StoredSuggestion>(all: T[]): T[] {
  const pending = all.filter(s => s.status === 'pending' && Number(s.confidence) >= DAMAGE_THRESHOLD)
  return pending.filter(s =>
    Number(s.confidence) >= DAMAGE_SINGLE_PHOTO_CONFIDENCE ||
    pending.some(o => o.id !== s.id && o.slot !== s.slot && o.damage_group === s.damage_group))
}

/**
 * G · Everything to show on an inspection, both kinds. Possible new damage
 * since check-in comes first and is shown at the comparison's own cutoff; a
 * plain photo suggestion for the same damage in the same photo is then left
 * out, since the comparison card already covers it.
 */
export function suggestionsToShowAll<T extends StoredSuggestion & { kind?: string }>(all: T[], compareThreshold: number): T[] {
  const compare = all.filter(s => s.kind === 'new_since_checkin' && s.status === 'pending' && Number(s.confidence) >= compareThreshold)
  const photo = suggestionsToShow(all.filter(s => (s.kind ?? 'photo') === 'photo'))
    .filter(s => !compare.some(c => c.slot === s.slot && c.damage_group === s.damage_group))
  return [...compare, ...photo]
}

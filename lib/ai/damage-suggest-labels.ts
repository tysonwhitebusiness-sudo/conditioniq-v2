// F · The words the phone shows for damage suggestions. Kept apart from
// damage-suggest.ts so the damage prompt never ships in the phone's JavaScript.

export const EXTERIOR_SLOTS = ['exteriorFrontPhoto', 'exteriorRearPhoto', 'exteriorDriverPhoto', 'exteriorPassengerPhoto'] as const
export type ExteriorSlot = (typeof EXTERIOR_SLOTS)[number]

export const SLOT_LABEL: Record<ExteriorSlot, string> = {
  exteriorFrontPhoto: 'Front photo',
  exteriorRearPhoto: 'Rear photo',
  exteriorDriverPhoto: 'Driver side photo',
  exteriorPassengerPhoto: 'Passenger side photo',
}

/** "Possible dent" — how a suggestion is named to the inspector. */
export function suggestionTitle(group: string): string {
  const titles: Record<string, string> = {
    scratch: 'Possible scratch or chip', dent: 'Possible dent', tear: 'Possible crack or tear',
    glass: 'Possible glass damage', missing: 'Possible missing part', puncture: 'Possible hole', lamp: 'Possible broken lamp',
  }
  return titles[group] ?? 'Possible damage'
}

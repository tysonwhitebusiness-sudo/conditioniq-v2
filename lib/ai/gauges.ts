// E · Reading the odometer and fuel gauge from the dashboard photo, and
// checking the odometer against what the inspector typed.
//
// The reading rides on the photo check's AI call for the dashboard and
// odometer slots (one call, no extra cost). Only the odometer total counts:
// trip meters, range-to-empty, speed and temperature are ignored, and anything
// not clearly legible is null, which the report prints as "not verified from
// photos" rather than guessing.
//
// The fuel level is read and stored but not printed: on the same photos Sonnet
// and Opus disagreed (3/4 vs 3/8), and nothing typed exists to check it against.

export const GAUGE_SLOTS = new Set(['dashboardPhoto', 'odometerPhoto'])

export interface GaugeReading {
  /** Odometer total as shown, digits only; null when not clearly legible. */
  odometer: number | null
  unit: 'mi' | 'km' | null
  /** Fuel gauge from 0 (empty) to 1 (full); null when not visible. */
  fuel: number | null
}

export type OdometerStatus = 'verified' | 'mismatch' | 'unreadable'

export const GAUGE_SCHEMA_PROPERTIES = {
  odometer: { anyOf: [{ type: 'number' }, { type: 'null' }] },
  odometerUnit: { anyOf: [{ type: 'string', enum: ['mi', 'km'] }, { type: 'null' }] },
  fuel: { anyOf: [{ type: 'number' }, { type: 'null' }] },
}

export const GAUGE_INSTRUCTIONS = [
  'Also read the gauges, if the photo shows them:',
  '- odometer: the total distance on the odometer, digits only. Not a trip meter (often marked A, B or TRIP), not range or distance to empty, not speed, temperature or the time. null if the total is not clearly legible.',
  '- odometerUnit: "mi" or "km" as shown, or null.',
  '- fuel: the fuel gauge level from 0 (empty) to 1 (full), to the nearest eighth; null if no fuel gauge is visible.',
].join('\n')

export function parseGauges(answer: any): GaugeReading {
  const odometer = typeof answer?.odometer === 'number' && Number.isFinite(answer.odometer) && answer.odometer >= 0 ? Math.round(answer.odometer) : null
  const unit = answer?.odometerUnit === 'mi' || answer?.odometerUnit === 'km' ? answer.odometerUnit : null
  const fuel = typeof answer?.fuel === 'number' && answer.fuel >= 0 && answer.fuel <= 1 ? Math.round(answer.fuel * 8) / 8 : null
  return { odometer, unit, fuel }
}

/**
 * Checks the odometer read from the photo against the typed reading. A
 * difference of a few miles is allowed (the car may have moved between the
 * photo and the typing); km are converted when the typed value is in miles.
 */
export function compareOdometer(read: GaugeReading, typed: number | null): OdometerStatus {
  if (read.odometer === null || typed === null || !(typed >= 0)) return 'unreadable'
  const readMiles = read.unit === 'km' ? read.odometer * 0.621371 : read.odometer
  const tolerance = read.unit === 'km' ? Math.max(3, typed * 0.002) : Math.max(3, typed * 0.001)
  return Math.abs(readMiles - typed) <= tolerance ? 'verified' : 'mismatch'
}

const FRACTIONS: Record<number, string> = { 0: 'empty', 0.125: '1/8', 0.25: '1/4', 0.375: '3/8', 0.5: '1/2', 0.625: '5/8', 0.75: '3/4', 0.875: '7/8', 1: 'full' }

export function fuelText(fuel: number | null): string | null {
  return fuel === null ? null : FRACTIONS[fuel] ?? `${Math.round(fuel * 100)}%`
}

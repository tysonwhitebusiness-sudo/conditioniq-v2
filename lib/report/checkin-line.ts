// G · What a check-out report says about the check-in it was measured against.
// Always one plain sentence on a check-out, including when there was nothing
// to compare, so a reader never has to guess whether a comparison happened.

import { REPORT_TIME_ZONE } from './layout'

export interface ReportCheckin {
  /** No check-in on record, a check-in whose photos were not compared, or compared. */
  status: 'none' | 'not_compared' | 'compared'
  date?: string | null
  reportNo?: string | null
  /** Pin numbers the inspector confirmed as new since check-in. */
  newPins?: number[]
  /** Possible new damage the inspector never looked at before finishing. */
  unreviewed?: number
  /** Sides whose photos could not be compared, e.g. "rear". */
  notCompared?: string[]
}

const SIDE: Record<string, string> = {
  exteriorFrontPhoto: 'front', exteriorRearPhoto: 'rear', exteriorDriverPhoto: 'driver side', exteriorPassengerPhoto: 'passenger side',
}
export const checkinSide = (slot: string) => SIDE[slot] ?? slot

const list = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

function when(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: REPORT_TIME_ZONE })
}

export function checkinLine(c: ReportCheckin): string {
  if (c.status === 'none') return 'Nothing to compare: no earlier check-in is on record for this vehicle.'
  const ref = `the check-in on ${when(c.date)}${c.reportNo ? ` (report ${c.reportNo})` : ''}`
  if (c.status === 'not_compared') return `Not compared with ${ref}: the photos were not checked against it.`
  const pins = c.newPins ?? []
  const parts = [
    pins.length
      ? `Compared with ${ref}: new damage confirmed by the inspector at ${list(pins.map(n => `pin ${n}`))}.`
      : `Compared with ${ref}: no new damage found.`,
  ]
  if (c.unreviewed) parts.push(`${c.unreviewed} possible new ${c.unreviewed === 1 ? 'damage was' : 'damages were'} not reviewed.`)
  if (c.notCompared?.length) parts.push(`The ${list(c.notCompared)} ${c.notCompared.length === 1 ? 'photo' : 'photos'} could not be compared.`)
  return parts.join(' ')
}

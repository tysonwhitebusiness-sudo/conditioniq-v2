// Pure metering rules. No database access — lib/plan-usage-actions.ts loads the
// rows and calls these.

// ── Billing cycle ─────────────────────────────────────────────────────────────
// Each account is billed on its own day of the month, anchored to
// companies.billing_cycle_start. The current cycle is derived from the anchor's
// day-of-month rather than read directly, so it rolls over with no job to run.
// The column must therefore stay fixed: the old reset-billing-cycles cron, which
// added 30 days nightly and drifted the day, is unscheduled by migration
// 20260916000000. Pay Per Use ignores the anchor and uses the calendar month.
//
// An anchor on the 29th-31st lands on the last day of shorter months.

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function anniversaryIn(year: number, monthIndex: number, anchorDay: number, anchor: Date): Date {
  const day = Math.min(anchorDay, daysInMonth(year, monthIndex))
  return new Date(Date.UTC(
    year, monthIndex, day,
    anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds(),
  ))
}

export interface BillingCycle {
  start: Date
  end: Date
}

// Calendar month containing `now`, offset by whole months (-1 = the month before).
// UTC, matching currentBillingCycle's calendar fallback that Pay Per Use uses.
export function calendarMonth(now: Date, offset = 0): BillingCycle {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1))
  return { start, end }
}

export function currentBillingCycle(anchorIso: string | null | undefined, now: Date = new Date()): BillingCycle {
  // No anchor recorded: fall back to the calendar month.
  if (!anchorIso) return calendarMonth(now)
  const anchor = new Date(anchorIso)
  const anchorDay = anchor.getUTCDate()

  let start = anniversaryIn(now.getUTCFullYear(), now.getUTCMonth(), anchorDay, anchor)
  if (start > now) {
    const prevMonth = now.getUTCMonth() - 1
    const prevYear = prevMonth < 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
    start = anniversaryIn(prevYear, (prevMonth + 12) % 12, anchorDay, anchor)
  }
  const nextMonth = start.getUTCMonth() + 1
  const nextYear = nextMonth > 11 ? start.getUTCFullYear() + 1 : start.getUTCFullYear()
  const end = anniversaryIn(nextYear, nextMonth % 12, anchorDay, anchor)
  return { start, end }
}

// ── Vehicles on lot ───────────────────────────────────────────────────────────
// Brief section 4.1: peak concurrent vehicles on lot during the billing period.
// A vehicle occupies the lot from arrived_at until released_at.
//
// Two data rules keep the count honest:
//
// - A pending_arrival vehicle has not arrived. Its arrived_at is set to its
//   creation time, so it is excluded rather than counted early.
// - A vehicle marked released with no released_at was released before
//   updateWorkOrderStatus recorded the timestamp (49 production rows as of
//   Sep 2026, with no event or date to recover it from). It is excluded rather
//   than counted as occupying the lot forever. All such releases predate
//   metering, so no billing period after deploy is affected.
//
// Because occupancy is reconstructed from intervals rather than read from a live
// count, releasing or deleting a vehicle never lowers a past period's peak.

export interface OccupancyVehicle {
  arrived_at: string | null
  released_at: string | null
  work_order_status: string | null
}

export function isMeteredVehicle(v: OccupancyVehicle): boolean {
  if (!v.arrived_at) return false
  if (v.work_order_status === 'pending_arrival') return false
  if (v.work_order_status === 'released' && !v.released_at) return false
  return true
}

export interface VehicleOccupancy {
  peak: number
  current: number
}

export function vehicleOccupancy(
  vehicles: OccupancyVehicle[],
  cycle: BillingCycle,
  now: Date = new Date(),
): VehicleOccupancy {
  // Occupancy only accrues up to now; the rest of the cycle has not happened.
  const windowEnd = now < cycle.end ? now : cycle.end
  const events: [number, number][] = []
  let current = 0

  for (const v of vehicles) {
    if (!isMeteredVehicle(v)) continue
    const arrived = new Date(v.arrived_at as string).getTime()
    const released = v.released_at ? new Date(v.released_at).getTime() : Infinity

    if (arrived <= now.getTime() && released > now.getTime()) current++

    const s = Math.max(arrived, cycle.start.getTime())
    const e = Math.min(released, windowEnd.getTime())
    if (s < e) {
      events.push([s, 1])
      events.push([e, -1])
    }
  }

  // Departures before arrivals at the same instant, so a same-moment swap is
  // not counted as two vehicles at once.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1])

  let running = 0
  let peak = 0
  for (const [, delta] of events) {
    running += delta
    if (running > peak) peak = running
  }
  return { peak, current }
}

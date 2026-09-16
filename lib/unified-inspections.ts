import { createClient } from '@/lib/supabase/client'

// One status axis for everything an operator thinks of as "an inspection",
// wherever the record physically lives:
//
//   queued       inspection_queue      a vehicle waiting to be inspected in-house
//   sent         inspection_requests   a link sent to a remote inspector, not yet opened into an inspection
//   in_progress  vehicle_inspections   started, not finished
//   completed    vehicle_inspections   finished
//   expired      inspection_requests   a link nobody used before it lapsed
//
// Replaces the separate Inspections and Dispatch pages, which split the answer
// to "where is this inspection" across two screens.
export type InspectionStatus = 'queued' | 'sent' | 'in_progress' | 'completed' | 'expired'

export const INSPECTION_STATUSES: InspectionStatus[] = ['queued', 'sent', 'in_progress', 'completed', 'expired']

export const INSPECTION_STATUS_LABEL: Record<InspectionStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  in_progress: 'In progress',
  completed: 'Completed',
  expired: 'Expired',
}

export type InspectionSource = 'queue' | 'link' | 'inspection'

export interface InspectionRow {
  key: string
  source: InspectionSource
  status: InspectionStatus
  createdAt: string
  vin: string | null
  year: string | null
  make: string | null
  model: string | null
  // True when a remote link produced this inspection.
  viaLink: boolean
  // The underlying record, for the card that renders this row.
  record: any
}

// Completed history is capped, matching the previous History tab. Links are
// capped too: they are only needed recent enough to tag the inspections above.
const COMPLETED_LIMIT = 50
const LINK_LIMIT = 200

// A used link is not listed on its own — the inspection it produced carries it,
// tagged viaLink. Listing both would show the same work twice.
//
// Note on history: links used before report_id was reliably written have no
// recorded inspection, so their inspections appear without the viaLink tag.
// No production link has a report_id as of Sep 2026.
export function linkStatus(
  link: { expires_at: string; used_at: string | null },
  now: number = Date.now(),
): 'sent' | 'expired' | null {
  if (link.used_at) return null
  return new Date(link.expires_at).getTime() < now ? 'expired' : 'sent'
}

function vehicleFields(r: any) {
  return {
    vin: r.vin ?? null,
    year: r.year != null && r.year !== '' ? String(r.year) : null,
    make: r.make || null,
    model: r.model || null,
  }
}

export function buildInspectionRows(
  input: { queue: any[]; links: any[]; inProgress: any[]; completed: any[] },
  now: number = Date.now(),
): InspectionRow[] {
  const linkedInspectionIds = new Set(input.links.map(l => l.report_id).filter(Boolean))
  const rows: InspectionRow[] = []

  for (const q of input.queue) {
    rows.push({ key: `queue:${q.id}`, source: 'queue', status: 'queued', createdAt: q.created_at, viaLink: false, record: q, ...vehicleFields(q) })
  }
  for (const l of input.links) {
    const status = linkStatus(l, now)
    if (!status) continue
    rows.push({ key: `link:${l.id}`, source: 'link', status, createdAt: l.created_at, viaLink: true, record: l, ...vehicleFields(l) })
  }
  for (const i of input.inProgress) {
    rows.push({ key: `inspection:${i.id}`, source: 'inspection', status: 'in_progress', createdAt: i.created_at, viaLink: linkedInspectionIds.has(i.id), record: i, ...vehicleFields(i) })
  }
  for (const i of input.completed) {
    rows.push({ key: `inspection:${i.id}`, source: 'inspection', status: 'completed', createdAt: i.created_at, viaLink: linkedInspectionIds.has(i.id), record: i, ...vehicleFields(i) })
  }

  return rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

export function countByStatus(rows: InspectionRow[]): Record<InspectionStatus, number> {
  const counts: Record<InspectionStatus, number> = { queued: 0, sent: 0, in_progress: 0, completed: 0, expired: 0 }
  for (const r of rows) counts[r.status]++
  return counts
}

export async function loadInspectionRows(companyId: string): Promise<InspectionRow[]> {
  const supabase = createClient()
  const [queue, links, inProgress, completed] = await Promise.all([
    supabase.from('inspection_queue').select('*')
      .eq('company_id', companyId).eq('status', 'queued')
      .order('created_at', { ascending: false }),
    supabase.from('inspection_requests')
      .select('id, vin, year, make, model, notes, token, expires_at, used_at, report_id, created_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }).limit(LINK_LIMIT),
    supabase.from('vehicle_inspections').select('*')
      .eq('company_id', companyId).eq('status', 'in_progress')
      .order('created_at', { ascending: false }),
    supabase.from('vehicle_inspections').select('*')
      .eq('company_id', companyId).eq('status', 'completed')
      .order('created_at', { ascending: false }).limit(COMPLETED_LIMIT),
  ])

  // Surface failures rather than rendering a partial list that looks complete.
  for (const res of [queue, links, inProgress, completed]) {
    if (res.error) throw res.error
  }

  return buildInspectionRows({
    queue: queue.data ?? [],
    links: links.data ?? [],
    inProgress: inProgress.data ?? [],
    completed: completed.data ?? [],
  })
}

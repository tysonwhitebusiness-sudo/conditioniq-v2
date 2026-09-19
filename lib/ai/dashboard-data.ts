import { createAdminClient } from '@/lib/supabase/admin'
import { acceptance, photoCheckSummary, scanSummary, spendSummary } from './dashboard'

if (typeof window !== 'undefined') throw new Error('lib/ai/dashboard-data is server-only')

// H · Reads for the admin AI dashboard. No access check here: only
// dashboard-actions.ts (which checks for a platform admin) and the test
// scripts call these.

const PHOTO_BUCKET = 'inspection-photos'

export async function loadAiDashboard(days = 30) {
  const span = Math.min(365, Math.max(1, Math.round(days)))
  const since = new Date(Date.now() - span * 864e5).toISOString()
  const admin = createAdminClient()
  const [{ data: settings }, { data: calls }, { data: suggestions }, { data: checks }, { data: scans }, { data: compares }] = await Promise.all([
    admin.from('ai_settings').select('kill_switch, per_inspection_ceiling_usd, summary_reserve_usd').maybeSingle(),
    admin.from('ai_calls').select('created_at, inspection_id, feature, status, cost_usd, duration_ms').gte('created_at', since).limit(50000),
    admin.from('damage_suggestions').select('kind, damage_group, status, review_status').gte('created_at', since).neq('status', 'superseded').limit(50000),
    admin.from('photo_checks').select('problems, right_subject, framed, odometer_status').gte('checked_at', since).limit(50000),
    admin.from('scan_reads').select('kind, source, read_value, saved_value').gte('created_at', since).limit(50000),
    admin.from('checkin_compares').select('outcome').gte('checked_at', since).limit(50000),
  ])
  const ceiling = Number(settings?.per_inspection_ceiling_usd ?? 0.12)
  const decided = (suggestions ?? []).filter(s => ['accepted', 'edited', 'rejected'].includes(s.status))
  return {
    days: span,
    settings: { killSwitch: settings?.kill_switch ?? false, ceilingUsd: ceiling, summaryReserveUsd: Number(settings?.summary_reserve_usd ?? 0.02) },
    spend: spendSummary(calls ?? [], ceiling, Math.min(span, 30)),
    acceptance: acceptance(suggestions ?? []),
    photoChecks: photoCheckSummary(checks ?? []),
    scans: scanSummary(scans ?? []),
    compares: {
      compared: (compares ?? []).filter(c => c.outcome === 'compared').length,
      notComparable: (compares ?? []).filter(c => c.outcome === 'not_comparable').length,
      noCheckinPhoto: (compares ?? []).filter(c => c.outcome === 'no_checkin_photo').length,
      skipped: (compares ?? []).filter(c => c.outcome === 'skipped').length,
    },
    review: {
      toReview: decided.filter(s => !s.review_status).length,
      approved: decided.filter(s => s.review_status === 'approved').length,
      excluded: decided.filter(s => s.review_status === 'excluded').length,
    },
  }
}

export type ReviewFilter = 'to_review' | 'approved' | 'excluded'

export interface ReviewItem {
  id: string
  createdAt: string
  kind: 'photo' | 'new_since_checkin'
  slot: string
  damageGroup: string
  whereText: string | null
  confidence: number
  status: 'accepted' | 'edited' | 'rejected'
  /** What the AI proposed, and what the inspector recorded when they changed it. */
  suggested: { area: string | null; type: string | null }
  recorded: { area: string | null; type: string | null; severity: string | null } | null
  photoUrl: string | null
  checkinPhotoUrl: string | null
  companyName: string | null
}

/** Decided suggestions, newest first, with the photo each came from. */
export async function loadReviewQueue(filter: ReviewFilter = 'to_review', limit = 24): Promise<ReviewItem[]> {
  const admin = createAdminClient()
  let query = admin.from('damage_suggestions')
    .select(`id, created_at, kind, slot, damage_group, where_text, confidence, status, inspection_id, checkin_inspection_id,
      area:area_code_id(label), type:type_code_id(label),
      marker:marker_id(area:area_code_id(label), type:type_code_id(label), severity:severity_code_id(label)),
      inspection:inspection_id(company_id, company:company_id(name))`)
    .in('status', ['accepted', 'edited', 'rejected'])
    .order('decided_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)))
  query = filter === 'to_review' ? query.is('review_status', null) : query.eq('review_status', filter === 'approved' ? 'approved' : 'excluded')
  const { data, error } = await query
  if (error) throw error
  const rows = (data ?? []) as any[]

  // Photos: the inspection's own slot photo, and for a comparison the check-in's.
  const { checkinPhotoPath } = await import('./checkin-compare-server')
  const checkinIds = Array.from(new Set(rows.map(r => r.checkin_inspection_id).filter(Boolean)))
  const { data: checkins } = checkinIds.length
    ? await admin.from('vehicle_inspections').select('id, company_id, created_at, exterior_data').in('id', checkinIds)
    : { data: [] as any[] }
  const paths = rows.flatMap(r => {
    const company = r.inspection?.company_id
    const out: string[] = company ? [`${company}/${r.inspection_id}/${r.slot}.jpg`] : []
    const c = (checkins ?? []).find((x: any) => x.id === r.checkin_inspection_id)
    if (c) out.push(checkinPhotoPath({ id: c.id, createdAt: c.created_at, exteriorData: c.exterior_data }, c.company_id, r.slot))
    return out
  })
  const { data: signed } = paths.length ? await admin.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60) : { data: [] as any[] }
  const url = new Map((signed ?? []).filter((s: any) => s.path && s.signedUrl).map((s: any) => [s.path, s.signedUrl]))

  return rows.map(r => {
    const c = (checkins ?? []).find((x: any) => x.id === r.checkin_inspection_id)
    const company = r.inspection?.company_id
    return {
      id: r.id,
      createdAt: r.created_at,
      kind: r.kind === 'new_since_checkin' ? 'new_since_checkin' : 'photo',
      slot: r.slot,
      damageGroup: r.damage_group,
      whereText: r.where_text,
      confidence: Number(r.confidence),
      status: r.status,
      suggested: { area: r.area?.label ?? null, type: r.type?.label ?? null },
      recorded: r.marker ? { area: r.marker.area?.label ?? null, type: r.marker.type?.label ?? null, severity: r.marker.severity?.label ?? null } : null,
      photoUrl: company ? url.get(`${company}/${r.inspection_id}/${r.slot}.jpg`) ?? null : null,
      checkinPhotoUrl: c ? url.get(checkinPhotoPath({ id: c.id, createdAt: c.created_at, exteriorData: c.exterior_data }, c.company_id, r.slot)) ?? null : null,
      companyName: r.inspection?.company?.name ?? null,
    }
  })
}


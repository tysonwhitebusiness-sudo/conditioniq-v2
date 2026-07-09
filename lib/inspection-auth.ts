'use server'

import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import { captureHighSeverityError } from './sentry'

async function isStaffForCompany(companyId: string, userId: string): Promise<boolean> {
  const session = createClient()
  const { data: profile } = await session
    .from('user_profiles')
    .select('company_id')
    .eq('id', userId)
    .maybeSingle()
  return profile?.company_id === companyId
}

async function hasValidGuestToken(companyId: string, inspectionId?: string): Promise<boolean> {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  let mainQuery = admin
    .from('inspection_requests')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .gt('expires_at', now)
  if (inspectionId) mainQuery = mainQuery.eq('report_id', inspectionId)
  const { count: mainCount } = await mainQuery
  if ((mainCount ?? 0) > 0) return true

  let fmcQuery = admin
    .from('fmc_inspection_requests')
    .select('id', { count: 'exact', head: true })
    .eq('fmc_account_id', companyId)
    .gt('link_expires_at', now)
  if (inspectionId) fmcQuery = fmcQuery.eq('report_id', inspectionId)
  const { count: fmcCount } = await fmcQuery
  return (fmcCount ?? 0) > 0
}

async function isPlatformOwnerOrAdmin(): Promise<boolean> {
  const session = createClient()
  const [{ data: isOwner }, { data: isAdmin }] = await Promise.all([
    session.rpc('is_platform_owner'),
    session.rpc('is_admin'),
  ])
  return Boolean(isOwner) || Boolean(isAdmin)
}

/** Inspection-level guard — resolves the row's own company_id itself (admin client), then
 *  applies the same ordering, scoped to this specific inspection for the guest-token check. */
export async function authorizeInspectionAccess(
  inspectionId: string
): Promise<{ ok: boolean; companyId: string | null }> {
  const admin = createAdminClient()
  const { data: inspection } = await admin
    .from('vehicle_inspections')
    .select('company_id')
    .eq('id', inspectionId)
    .maybeSingle()
  if (!inspection) {
    captureHighSeverityError(new Error('authorizeInspectionAccess: inspection not found'), { inspectionId, reason: 'inspection_not_found' })
    return { ok: false, companyId: null }
  }

  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    captureHighSeverityError(new Error('authorizeInspectionAccess: not authenticated'), { inspectionId, companyId: inspection.company_id, reason: 'not_authenticated' })
    return { ok: false, companyId: inspection.company_id }
  }

  if (await isStaffForCompany(inspection.company_id, user.id)) {
    return { ok: true, companyId: inspection.company_id }
  }
  if (await hasValidGuestToken(inspection.company_id, inspectionId)) {
    return { ok: true, companyId: inspection.company_id }
  }
  const ok = await isPlatformOwnerOrAdmin()
  if (!ok) {
    captureHighSeverityError(new Error('authorizeInspectionAccess: not authorized'), { inspectionId, companyId: inspection.company_id, userId: user.id, reason: 'not_authorized' }, user.id)
  }
  return { ok, companyId: inspection.company_id }
}

/** Company-level guard for non-inspection-specific operations — staff of the company, or
 *  a platform owner/admin. No guest-token branch: unlike authorizeInspectionAccess, this is
 *  used only by invoice signed-URL functions, which have no guest/token caller anywhere in
 *  the codebase (confirmed in Step 9's investigation) — invoicing is a staff-only feature. */
export async function authorizeCompanyAccess(companyId: string): Promise<boolean> {
  const session = createClient()
  const { data: { user } } = await session.auth.getUser()
  if (!user) {
    captureHighSeverityError(new Error('authorizeCompanyAccess: not authenticated'), { companyId, reason: 'not_authenticated' })
    return false
  }

  if (await isStaffForCompany(companyId, user.id)) return true
  const ok = await isPlatformOwnerOrAdmin()
  if (!ok) {
    captureHighSeverityError(new Error('authorizeCompanyAccess: not authorized'), { companyId, userId: user.id, reason: 'not_authorized' }, user.id)
  }
  return ok
}

/** The one authorized write path for step-by-step and offline-synced saves — called from the
 *  client (offline-sync.ts) as a server action, since the browser can't hold the admin client. */
export async function updateInspectionSecure(
  inspectionId: string,
  data: Record<string, any>
): Promise<boolean> {
  const { ok } = await authorizeInspectionAccess(inspectionId)
  if (!ok) return false

  const admin = createAdminClient()
  const { error } = await admin
    .from('vehicle_inspections')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', inspectionId)
  return !error
}

/** The one authorized write path for chain-of-custody records — called from the client
 *  (chain-of-custody.ts) as a server action, for the same reason as updateInspectionSecure:
 *  inspection_custody has no company_id column, so correct scoping requires resolving
 *  authorization through the parent vehicle_inspections row, which the browser can't do itself. */
export async function upsertCustodyRecordSecure(
  inspectionId: string,
  data: Record<string, any>
): Promise<boolean> {
  const { ok } = await authorizeInspectionAccess(inspectionId)
  if (!ok) return false

  const admin = createAdminClient()
  const { error } = await admin
    .from('inspection_custody')
    .upsert({ inspection_id: inspectionId, ...data }, { onConflict: 'inspection_id' })
  return !error
}

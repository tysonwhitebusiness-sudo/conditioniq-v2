'use server'

import { createClient } from '@/lib/supabase/server'
import { getPlan } from '@/lib/pricing'
import { captureHighSeverityError } from '@/lib/sentry'

export interface UsageState {
  used: number
  included: number
  remaining: number
  percentUsed: number
  isOverage: boolean
  isNearLimit: boolean
  overageRate: number
  planName: string
  planKey: string
}

export async function checkUsageState(companyId: string): Promise<UsageState> {
  const supabase = createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('reports_used, reports_included, subscription_tier')
    .eq('id', companyId)
    .single()

  const used = company?.reports_used ?? 0
  const plan = getPlan(company?.subscription_tier)
  const included = company?.reports_included ?? plan.reportsIncluded
  const remaining = Math.max(0, included - used)
  const percentUsed = included > 0 ? (used / included) * 100 : 100

  return {
    used,
    included,
    remaining,
    percentUsed,
    isOverage: used >= included,
    isNearLimit: percentUsed >= 80,
    overageRate: plan.additionalReportCost,
    planName: plan.name,
    planKey: plan.key,
  }
}

export async function checkExistingInspection(
  companyId: string,
  vin: string
): Promise<{ inspectionId: string; startedAt: string } | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('vehicle_inspections')
    .select('id, initiated_at')
    .eq('company_id', companyId)
    .eq('vin', vin.trim().toUpperCase())
    .eq('status', 'in_progress')
    .order('initiated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return { inspectionId: data.id, startedAt: data.initiated_at }
}

export async function initiateInspection({
  companyId,
  inspectorId,
  initialData,
  deviceId,
}: {
  companyId: string
  inspectorId: string
  initialData?: Record<string, any>
  deviceId?: string
}): Promise<{ inspectionId: string; isOverage: boolean }> {
  const supabase = createClient()

  const usageState = await checkUsageState(companyId)
  const isOverage = usageState.isOverage
  const now = new Date().toISOString()

  const { data: inspection, error } = await supabase
    .from('vehicle_inspections')
    .insert({
      company_id: companyId,
      inspector_id: inspectorId,
      status: 'in_progress',
      usage_status: 'initiated',
      initiated_at: now,
      last_active_at: now,
      is_overage: false,
      device_id: deviceId ?? null,
      ...(initialData ?? {}),
    })
    .select('id')
    .single()

  if (error || !inspection) throw new Error(error?.message ?? 'Failed to create inspection')

  // Sync to storage — never blocks the inspection flow
  if (initialData?.vin) {
    const vinKey = initialData.vin.trim()
    const { data: existingVeh } = await supabase
      .from('storage_vehicles')
      .select('id')
      .eq('company_id', companyId)
      .eq('vin', vinKey)
      .maybeSingle()
    if (existingVeh) {
      supabase.from('storage_vehicles').update({ status: 'pending_inspection', latest_inspection_id: inspection.id, updated_at: new Date().toISOString() }).eq('id', existingVeh.id).then(() => {})
    } else {
      supabase.from('storage_vehicles').insert({ company_id: companyId, vin: vinKey, year: initialData.year ?? null, make: initialData.make ?? null, model: initialData.model ?? null, lifecycle_status: 'on_lot', status: 'pending_inspection', arrived_at: new Date().toISOString(), latest_inspection_id: inspection.id }).then(() => {})
    }
  }

  return { inspectionId: inspection.id, isOverage }
}

export async function completeInspection(inspectionId: string): Promise<void> {
  const supabase = createClient()
  try {
    const { data: inspection, error: updateError } = await supabase
      .from('vehicle_inspections')
      .update({ usage_status: 'completed', status: 'completed' })
      .eq('id', inspectionId)
      .select('company_id')
      .single()

    if (updateError) throw updateError

    if (inspection?.company_id) {
      const companyId = inspection.company_id
      const { data: company } = await supabase
        .from('companies')
        .select('reports_used, subscription_tier')
        .eq('id', companyId)
        .single()
      const preIncrementUsed = company?.reports_used ?? 0
      const plan = getPlan(company?.subscription_tier)
      const isOverage = preIncrementUsed >= plan.reportsIncluded
      const [{ error: billingError }] = await Promise.all([
        supabase.from('companies').update({ reports_used: preIncrementUsed + 1 }).eq('id', companyId),
        supabase.from('vehicle_inspections').update({ is_overage: isOverage }).eq('id', inspectionId),
      ])
      if (billingError) throw billingError
    }
  } catch (err) {
    captureHighSeverityError(err, { flow: 'completeInspection', inspectionId })
    throw err
  }
}

export async function abandonInspection(inspectionId: string): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('vehicle_inspections')
    .update({ usage_status: 'abandoned', status: 'abandoned' })
    .eq('id', inspectionId)
}

export async function getFMCRequestByToken(token: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('fmc_inspection_requests')
    .select(`*, fmc_locations(name, city, state)`)
    .eq('link_token', token)
    .single()

  if (error) return null

  if (data.link_expires_at && new Date(data.link_expires_at) < new Date()) return null

  return data
}

export async function trackFMCLinkOpened(token: string): Promise<void> {
  const supabase = createClient()
  await supabase
    .from('fmc_inspection_requests')
    .update({ status: 'link_opened', link_opened_at: new Date().toISOString() })
    .eq('link_token', token)
    .eq('status', 'pending')
}

export async function initiateFMCInspection({
  token,
  companyId,
  requestId,
  vin,
}: {
  token: string
  companyId: string
  requestId: string
  vin: string
}): Promise<{ inspectionId: string }> {
  const supabase = createClient()

  const { data: inspection, error } = await supabase
    .from('vehicle_inspections')
    .insert({
      company_id: companyId,
      status: 'in_progress',
      usage_status: 'initiated',
      initiated_at: new Date().toISOString(),
      is_overage: false,
      vin,
    })
    .select('id')
    .single()

  if (error || !inspection) throw new Error(error?.message ?? 'Failed to create FMC inspection')

  await supabase
    .from('fmc_inspection_requests')
    .update({ status: 'in_progress', inspection_started_at: new Date().toISOString(), report_id: inspection.id })
    .eq('id', requestId)

  return { inspectionId: inspection.id }
}

export async function completeFMCInspection({
  inspectionId,
  requestId,
  fmcAccountId,
  vin,
}: {
  inspectionId: string
  requestId: string
  fmcAccountId: string
  vin: string
}): Promise<void> {
  const supabase = createClient()
  const now = new Date().toISOString()

  const [inspectionResult] = await Promise.all([
    supabase
      .from('vehicle_inspections')
      .update({ usage_status: 'completed', status: 'completed' })
      .eq('id', inspectionId)
      .select('company_id')
      .single(),
    supabase
      .from('fmc_inspection_requests')
      .update({ status: 'completed', completed_at: now })
      .eq('id', requestId),
  ])

  if (inspectionResult.data?.company_id) {
    try {
      const companyId = inspectionResult.data.company_id
      const { data: company } = await supabase
        .from('companies')
        .select('reports_used, subscription_tier')
        .eq('id', companyId)
        .single()
      const preIncrementUsed = company?.reports_used ?? 0
      const plan = getPlan(company?.subscription_tier)
      const isOverage = preIncrementUsed >= plan.reportsIncluded
      const [{ error: billingError }] = await Promise.all([
        supabase.from('companies').update({ reports_used: preIncrementUsed + 1 }).eq('id', companyId),
        supabase.from('vehicle_inspections').update({ is_overage: isOverage }).eq('id', inspectionId),
      ])
      if (billingError) throw billingError
    } catch (err) {
      captureHighSeverityError(err, { flow: 'completeFMCInspection', inspectionId })
      throw err
    }
  }

  const { data: existing } = await supabase
    .from('fmc_vehicle_inventory')
    .select('id')
    .eq('fmc_account_id', fmcAccountId)
    .eq('vin', vin)
    .single()

  if (existing) {
    await supabase
      .from('fmc_vehicle_inventory')
      .update({ status: 'inspected', latest_report_id: inspectionId, updated_at: now })
      .eq('id', existing.id)
  } else {
    await supabase.from('fmc_vehicle_inventory').insert({
      fmc_account_id: fmcAccountId,
      vin,
      status: 'inspected',
      latest_report_id: inspectionId,
    })
  }
}

export async function initiateInspectionRequest({
  requestId,
  companyId,
  vin,
}: {
  requestId: string
  companyId: string
  vin?: string
}): Promise<{ inspectionId: string; error: null } | { inspectionId: null; error: string }> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    const { data: inspection, error } = await supabase
      .from('vehicle_inspections')
      .insert({
        company_id: companyId,
        status: 'in_progress',
        usage_status: 'initiated',
        initiated_at: new Date().toISOString(),
        is_overage: false,
        ...(vin ? { vin } : {}),
      })
      .select('id')
      .single()

    if (error || !inspection) {
      console.error('[initiateInspectionRequest] insert error', error)
      return { inspectionId: null, error: error?.message ?? 'Failed to create inspection' }
    }

    const vinKey = vin?.trim() || null

    await supabase
      .from('inspection_requests')
      .update({ used_at: new Date().toISOString() })
      .eq('id', requestId)

    if (vinKey) {
      const now = new Date().toISOString()
      const { data: existingVeh } = await supabase
        .from('storage_vehicles')
        .select('id, status')
        .eq('company_id', companyId)
        .eq('vin', vinKey)
        .maybeSingle()
      if (existingVeh) {
        if (existingVeh.status === 'active') {
          await supabase.from('storage_vehicles').update({ status: 'pending_inspection', updated_at: now }).eq('id', existingVeh.id)
        }
      } else {
        await supabase.from('storage_vehicles').insert({ company_id: companyId, vin: vinKey, status: 'pending_inspection', arrived_at: now }).then(() => {}, () => {})
      }
    }

    return { inspectionId: inspection.id, error: null }
  } catch (e: any) {
    console.error('[initiateInspectionRequest] unexpected error', e)
    return { inspectionId: null, error: e?.message ?? 'Unknown error starting inspection' }
  }
}

export async function getMonthlyUsageCount(companyId: string): Promise<number> {
  const supabase = createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('billing_cycle_start')
    .eq('id', companyId)
    .single()

  const cycleStart = company?.billing_cycle_start ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const { count } = await supabase
    .from('vehicle_inspections')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('usage_status', ['completed'])
    .gte('initiated_at', cycleStart)

  return count ?? 0
}

export async function createShareToken(inspectionId: string): Promise<string> {
  const supabase = createClient()
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('inspection_share_tokens').insert({
    inspection_id: inspectionId,
    token,
    expires_at: expiresAt,
  })

  if (error) throw new Error('Failed to create share token')
  return token
}

export async function createInspectionRequest(
  companyId: string,
  vehicleInfo: { vin?: string; year?: string; make?: string; model?: string; location?: string; notes?: string },
  expiresInHours = 24
): Promise<string> {
  const supabase = createClient()
  const token = crypto.randomUUID().replace(/-/g, '') + Date.now().toString(36)
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString()

  const { error } = await supabase.from('inspection_requests').insert({
    company_id: companyId,
    token,
    expires_at: expiresAt,
    ...vehicleInfo,
  })

  if (error) throw new Error('Failed to create inspection request')
  return token
}

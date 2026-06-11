'use server'

import { createClient } from '@/lib/supabase/server'
import { getFeatureFlags } from '@/lib/feature-flags'

export interface UsageLogEntry {
  id: string
  vin: string | null
  make: string | null
  model: string | null
  year: string | null
  status: string
  usage_status: string
  created_at: string
  inspector_id: string | null
}

export interface PlanChangeRequest {
  id: string
  requested_plan: string
  notes: string | null
  status: string
  created_at: string
  requested_by: string
}

export async function getBillingPageData(companyId: string) {
  const supabase = createClient()

  const [companyRes, flags, pendingRes, usageRes] = await Promise.all([
    supabase
      .from('companies')
      .select('reports_used, reports_included, subscription_tier, legacy_pricing, billing_interval, billing_cycle_start')
      .eq('id', companyId)
      .single(),
    getFeatureFlags(companyId),
    supabase
      .from('plan_change_requests')
      .select('id')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .limit(1),
    supabase
      .from('vehicle_inspections')
      .select('id, vin, make, model, year, status, usage_status, created_at, inspector_id')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return {
    company: companyRes.data,
    flags,
    hasPendingRequest: (pendingRes.data?.length ?? 0) > 0,
    usageLog: (usageRes.data ?? []) as UsageLogEntry[],
  }
}

export async function submitPlanChangeRequest({
  companyId,
  requestedBy,
  currentPlan,
  requestedPlan,
  notes,
}: {
  companyId: string
  requestedBy: string
  currentPlan: string
  requestedPlan: string
  notes?: string
}): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('plan_change_requests').insert({
    company_id: companyId,
    requested_by: requestedBy,
    current_plan: currentPlan,
    requested_plan: requestedPlan,
    notes: notes?.trim() || null,
    status: 'pending',
  })
  if (error) throw error
}

export async function getPlanChangeRequests(companyId: string): Promise<PlanChangeRequest[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('plan_change_requests')
    .select('id, requested_plan, notes, status, created_at, requested_by')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  return (data ?? []) as PlanChangeRequest[]
}

export async function updatePlanChangeRequestStatus(
  requestId: string,
  status: 'pending' | 'reviewed' | 'completed'
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('plan_change_requests')
    .update({ status })
    .eq('id', requestId)
  if (error) throw error
}

export async function getCompaniesWithPendingRequests(): Promise<string[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('plan_change_requests')
    .select('company_id')
    .eq('status', 'pending')
  return [...new Set((data ?? []).map(r => r.company_id as string))]
}

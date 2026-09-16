import { createClient } from '@/lib/supabase/client'
import type { WorkOrderStatus } from '@/lib/work-order-status'

// ── Hardcoded fallback ───────────────────────────────────────────────────────
// Applies to any status neither the company nor (if relevant) the customer has
// explicitly configured. On Hold defaults to non-billable per the approved
// Phase 5 design — same treatment as On Lot - Pending Repairs.

export const HARDCODED_STATUS_BILLABLE_DEFAULTS: Record<WorkOrderStatus, boolean> = {
  pending_arrival: false,
  checked_in: true,
  in_storage: true,
  on_lot_pending_repairs: false,
  on_lot_repairs_complete: true,
  off_lot: false,
  on_hold: false,
  pending_release: true,
  ready_for_release: true,
  released: false,
}

// ── Company-wide status defaults ─────────────────────────────────────────────

export async function getCompanyStatusDefaults(companyId: string): Promise<Record<WorkOrderStatus, boolean>> {
  const supabase = createClient()
  const { data } = await supabase
    .from('company_status_billing_defaults')
    .select('status, is_billable')
    .eq('company_id', companyId)
  const resolved = { ...HARDCODED_STATUS_BILLABLE_DEFAULTS }
  for (const row of data ?? []) {
    resolved[row.status as WorkOrderStatus] = row.is_billable
  }
  return resolved
}

export async function setCompanyStatusDefault(companyId: string, status: WorkOrderStatus, isBillable: boolean): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('company_status_billing_defaults')
    .upsert(
      { company_id: companyId, status, is_billable: isBillable, updated_at: new Date().toISOString() },
      { onConflict: 'company_id,status' },
    )
  if (error) throw error
}

// ── Customer-level status overrides ──────────────────────────────────────────

export async function getCustomerStatusOverrides(customerId: string): Promise<Partial<Record<WorkOrderStatus, boolean>>> {
  const supabase = createClient()
  const { data } = await supabase
    .from('customer_status_billing_overrides')
    .select('status, is_billable')
    .eq('customer_id', customerId)
  const overrides: Partial<Record<WorkOrderStatus, boolean>> = {}
  for (const row of data ?? []) overrides[row.status as WorkOrderStatus] = row.is_billable
  return overrides
}

export async function setCustomerStatusOverride(companyId: string, customerId: string, status: WorkOrderStatus, isBillable: boolean): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('customer_status_billing_overrides')
    .upsert(
      { company_id: companyId, customer_id: customerId, status, is_billable: isBillable, updated_at: new Date().toISOString() },
      { onConflict: 'customer_id,status' },
    )
  if (error) throw error
}

export async function clearCustomerStatusOverride(customerId: string, status: WorkOrderStatus): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('customer_status_billing_overrides')
    .delete()
    .eq('customer_id', customerId)
    .eq('status', status)
  if (error) throw error
}

// ── Customer-level rate override ─────────────────────────────────────────────

export interface CustomerRateOverride {
  default_daily_rate: number | null
  default_monthly_rate: number | null
  default_billing_type: 'daily' | 'monthly' | null
}

export async function getCustomerRateOverride(customerId: string): Promise<CustomerRateOverride | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('customers')
    .select('default_daily_rate, default_monthly_rate, default_billing_type')
    .eq('id', customerId)
    .maybeSingle()
  return data
}

export async function setCustomerRateOverride(customerId: string, data: CustomerRateOverride): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('customers').update(data).eq('id', customerId)
  if (error) throw error
}

// ── Precedence resolvers ──────────────────────────────────────────────────────
// Billable status: customer_status_billing_overrides > company_status_billing_defaults > hardcoded fallback.
// Rate: storage_vehicles per-vehicle override (resolved by the caller, unchanged,
// stays highest precedence) > customer default > company default.

export function resolveBillableStatus(
  status: WorkOrderStatus,
  companyDefaults: Record<WorkOrderStatus, boolean>,
  customerOverrides?: Partial<Record<WorkOrderStatus, boolean>> | null,
): boolean {
  if (customerOverrides && status in customerOverrides) return customerOverrides[status]!
  if (status in companyDefaults) return companyDefaults[status]
  return HARDCODED_STATUS_BILLABLE_DEFAULTS[status]
}

export interface ResolvedRate {
  billingType: 'daily' | 'monthly'
  rate: number | null
}

export function resolveRate(
  vehicle: { billing_type?: string | null; daily_rate?: number | null; monthly_rate?: number | null },
  customer: { default_billing_type?: string | null; default_daily_rate?: number | null; default_monthly_rate?: number | null } | null | undefined,
  company: { default_billing_type?: string | null; default_daily_rate?: number | null; default_monthly_rate?: number | null },
): ResolvedRate {
  const billingType =
    (vehicle.billing_type as 'daily' | 'monthly') ??
    (customer?.default_billing_type as 'daily' | 'monthly') ??
    (company.default_billing_type as 'daily' | 'monthly') ??
    'daily'

  const rate =
    billingType === 'daily'
      ? (vehicle.daily_rate ?? customer?.default_daily_rate ?? company.default_daily_rate ?? null)
      : (vehicle.monthly_rate ?? customer?.default_monthly_rate ?? company.default_monthly_rate ?? null)

  return { billingType, rate }
}

import { createClient } from '@/lib/supabase/client'

// ── Fee Types ─────────────────────────────────────────────────────────────────

export interface FeeType {
  id: string
  company_id: string
  name: string
  default_amount: number
  is_recurring: boolean
  active: boolean
  created_at: string
  updated_at: string
}

export async function getFeeTypes(companyId: string): Promise<FeeType[]> {
  const { data, error } = await createClient()
    .from('company_fee_types')
    .select('*')
    .eq('company_id', companyId)
    .eq('active', true)
    .order('name')
  if (error) throw error
  return (data ?? []) as FeeType[]
}

export async function createFeeType(
  companyId: string,
  data: { name: string; default_amount: number; is_recurring: boolean }
): Promise<FeeType> {
  const { data: created, error } = await createClient()
    .from('company_fee_types')
    .insert({ company_id: companyId, ...data })
    .select()
    .single()
  if (error) throw error
  return created as FeeType
}

export async function updateFeeType(
  id: string,
  data: { name?: string; default_amount?: number; is_recurring?: boolean }
): Promise<void> {
  const { error } = await createClient()
    .from('company_fee_types')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function softDeleteFeeType(id: string): Promise<void> {
  const { error } = await createClient()
    .from('company_fee_types')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ── Report Costs ──────────────────────────────────────────────────────────────

export interface ReportCosts {
  report_cost_checkin: number | null
  report_cost_checkout: number | null
  report_cost_one_off: number | null
}

export async function getReportCosts(companyId: string): Promise<ReportCosts> {
  const { data } = await createClient()
    .from('companies')
    .select('report_cost_checkin, report_cost_checkout, report_cost_one_off')
    .eq('id', companyId)
    .single()
  return (data ?? {
    report_cost_checkin: null,
    report_cost_checkout: null,
    report_cost_one_off: null,
  }) as ReportCosts
}

export async function saveReportCosts(companyId: string, costs: ReportCosts): Promise<void> {
  const { error } = await createClient()
    .from('companies')
    .update(costs)
    .eq('id', companyId)
  if (error) throw error
}

// ── Vehicle Charges ───────────────────────────────────────────────────────────

export interface VehicleCharge {
  id: string
  company_id: string
  vehicle_id: string
  charge_type: 'report' | 'custom_fee'
  label: string
  amount: number
  report_type: 'checkin' | 'checkout' | 'one_off' | null
  inspection_id: string | null
  fee_type_id: string | null
  is_recurring: boolean
  created_at: string
  created_by: string | null
}

export async function getVehicleCharges(vehicleId: string): Promise<VehicleCharge[]> {
  const { data, error } = await createClient()
    .from('vehicle_charges')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as VehicleCharge[]
}

export async function applyFeeToVehicle(payload: {
  companyId: string
  vehicleId: string
  feeTypeId: string
  label: string
  amount: number
  isRecurring: boolean
  createdBy: string
}): Promise<VehicleCharge> {
  const { data, error } = await createClient()
    .from('vehicle_charges')
    .insert({
      company_id: payload.companyId,
      vehicle_id: payload.vehicleId,
      charge_type: 'custom_fee',
      label: payload.label,
      amount: payload.amount,
      is_recurring: payload.isRecurring,
      fee_type_id: payload.feeTypeId,
      created_by: payload.createdBy,
    })
    .select()
    .single()
  if (error) throw error
  return data as VehicleCharge
}

export async function applyReportCostToVehicle(payload: {
  companyId: string
  vehicleId: string
  reportType: 'checkin' | 'checkout' | 'one_off'
  label: string
  amount: number
  inspectionId?: string | null
  createdBy: string
}): Promise<VehicleCharge> {
  const { data, error } = await createClient()
    .from('vehicle_charges')
    .insert({
      company_id: payload.companyId,
      vehicle_id: payload.vehicleId,
      charge_type: 'report',
      label: payload.label,
      amount: payload.amount,
      report_type: payload.reportType,
      inspection_id: payload.inspectionId ?? null,
      is_recurring: false,
      created_by: payload.createdBy,
    })
    .select()
    .single()
  if (error) throw error
  return data as VehicleCharge
}

export async function updateCharge(
  id: string,
  data: { label?: string; amount?: number }
): Promise<void> {
  const { error } = await createClient()
    .from('vehicle_charges')
    .update(data)
    .eq('id', id)
  if (error) throw error
}

export async function deleteCharge(id: string): Promise<void> {
  const { error } = await createClient()
    .from('vehicle_charges')
    .delete()
    .eq('id', id)
  if (error) throw error
}

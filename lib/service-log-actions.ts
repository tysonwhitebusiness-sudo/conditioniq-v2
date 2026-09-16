import { createClient } from '@/lib/supabase/client'
import type { VehicleCharge } from '@/lib/lot-fee-actions'

// Service log entries are vehicle_charges rows (charge_type: 'service') — same
// table as report/custom_fee charges, so they inherit the existing billed/unbilled
// mechanism (lot_invoice_charges FK) and the existing per-vehicle rollup in the
// billing dashboard for free. Editing/deleting an existing service log reuses
// lib/lot-fee-actions.ts's generic updateCharge/deleteCharge rather than
// duplicating them here — only creation and vehicle-scoped fetch are distinct
// enough (extra fields: fee_type_id, performed_at, notes) to warrant their own
// functions.

export async function getServiceLogsForVehicle(vehicleId: string): Promise<VehicleCharge[]> {
  const { data, error } = await createClient()
    .from('vehicle_charges')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('charge_type', 'service')
    .order('performed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as VehicleCharge[]
}

export async function logService(payload: {
  companyId: string
  vehicleId: string
  feeTypeId: string
  label: string
  amount: number
  performedAt: string // YYYY-MM-DD
  notes?: string
  createdBy: string
}): Promise<VehicleCharge> {
  const { data, error } = await createClient()
    .from('vehicle_charges')
    .insert({
      company_id: payload.companyId,
      vehicle_id: payload.vehicleId,
      charge_type: 'service',
      label: payload.label,
      amount: payload.amount,
      fee_type_id: payload.feeTypeId,
      performed_at: payload.performedAt,
      notes: payload.notes ?? null,
      is_recurring: false,
      created_by: payload.createdBy,
    })
    .select()
    .single()
  if (error) throw error
  return data as VehicleCharge
}

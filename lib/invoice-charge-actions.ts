import { createClient } from '@/lib/supabase/client'

// ── Billed-charge tracking ──────────────────────────────────────────────────────
// A vehicle_charges row (fee or Condition Report cost) is "billed" once it has a
// matching row in lot_invoice_charges. Storage isn't tracked here — its "billed"
// amount is derived from the days_on_lot already recorded on prior lot_invoices rows.

export async function getBilledChargeIds(vehicleId: string): Promise<Set<string>> {
  const { data, error } = await createClient()
    .from('lot_invoice_charges')
    .select('vehicle_charge_id, vehicle_charges!inner(vehicle_id)')
    .eq('vehicle_charges.vehicle_id', vehicleId)
  if (error) throw error
  return new Set((data ?? []).map(r => r.vehicle_charge_id as string))
}

// billed_through_date on storage_vehicles is the single source of truth for how
// far a vehicle's storage has been invoiced. It only advances when a new invoice
// includes storage, and is never touched by invoice status changes.
export async function advanceBilledThroughDate(vehicleId: string, throughDate: string): Promise<void> {
  const { error } = await createClient()
    .from('storage_vehicles')
    .update({ billed_through_date: throughDate })
    .eq('id', vehicleId)
  if (error) throw error
}

export async function linkChargesToInvoice(
  groupId: string,
  companyId: string,
  charges: { id: string; amount: number }[],
): Promise<void> {
  if (charges.length === 0) return
  const { error } = await createClient()
    .from('lot_invoice_charges')
    .insert(charges.map(c => ({
      group_id: groupId,
      vehicle_charge_id: c.id,
      company_id: companyId,
      amount: c.amount,
    })))
  if (error) throw error
}

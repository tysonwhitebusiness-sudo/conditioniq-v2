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

export async function getAlreadyBilledStorageDays(vehicleId: string, companyId: string): Promise<number> {
  const { data, error } = await createClient()
    .from('lot_invoices')
    .select('days_on_lot, status, lot_invoice_groups!group_id(status)')
    .eq('vehicle_id', vehicleId)
    .eq('company_id', companyId)
  if (error) throw error
  return (data ?? []).reduce((sum, r) => {
    const group = Array.isArray(r.lot_invoice_groups) ? r.lot_invoice_groups[0] : r.lot_invoice_groups as { status: string } | null
    const effectiveStatus = group?.status ?? r.status
    if (effectiveStatus === 'void') return sum
    return sum + (r.days_on_lot ?? 0)
  }, 0)
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

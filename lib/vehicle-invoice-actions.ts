'use server'

import { createClient } from '@/lib/supabase/server'

export interface VehicleInvoiceRow {
  id: string
  invoiceNumber: string
  invoiceDate: string
  status: string
  totalAmount: number
  isConsolidated: boolean
  groupId: string | null
  portalToken: string | null
  billToName: string | null
  vehicleVin: string | null
  periodStart: string | null
  periodEnd: string | null
}

export interface VehicleInvoiceHistory {
  rows: VehicleInvoiceRow[]
}

function parseInvoiceDate(raw: string): Date | null {
  if (!raw) return null
  // ISO format: "2026-06-18"
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw + 'T00:00:00')
  // Human format: "June 19, 2026"
  const parsed = new Date(raw)
  return isNaN(parsed.getTime()) ? null : parsed
}

export async function getVehicleInvoiceHistory(
  vehicleId: string,
  vin: string,
  companyId: string,
): Promise<VehicleInvoiceHistory> {
  const supabase = createClient()

  // Fetch all lot_invoices rows for this vehicle (by id or vin)
  // Also pull group info for portal_token and authoritative status
  const [byIdRes, byVinRes] = await Promise.all([
    supabase
      .from('lot_invoices')
      .select(`
        id, invoice_number, invoice_date, status, total_amount,
        bulk_invoice_id, group_id, bill_to_name, vehicle_vin,
        storage_period_start, storage_period_end,
        lot_invoice_groups!group_id ( status, portal_token )
      `)
      .eq('company_id', companyId)
      .eq('vehicle_id', vehicleId)
      .order('invoice_date', { ascending: false }),
    vin
      ? supabase
          .from('lot_invoices')
          .select(`
            id, invoice_number, invoice_date, status, total_amount,
            bulk_invoice_id, group_id, bill_to_name, vehicle_vin,
            storage_period_start, storage_period_end,
            lot_invoice_groups!group_id ( status, portal_token )
          `)
          .eq('company_id', companyId)
          .eq('vehicle_vin', vin)
          .is('vehicle_id', null)
          .order('invoice_date', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])

  const rawRows = [
    ...(byIdRes.data ?? []),
    ...(byVinRes.data ?? []),
  ]

  // Deduplicate by id (shouldn't overlap, but guard anyway)
  const seen = new Set<string>()
  const deduped = rawRows.filter(r => {
    if (seen.has(r.id)) return false
    seen.add(r.id)
    return true
  })

  // Sort newest first
  deduped.sort((a, b) => {
    const da = parseInvoiceDate(a.invoice_date)
    const db = parseInvoiceDate(b.invoice_date)
    if (!da || !db) return 0
    return db.getTime() - da.getTime()
  })

  const rows: VehicleInvoiceRow[] = deduped.map(r => {
    const group = Array.isArray(r.lot_invoice_groups)
      ? r.lot_invoice_groups[0]
      : r.lot_invoice_groups as { status: string; portal_token: string } | null
    return {
      id: r.id,
      invoiceNumber: r.invoice_number,
      invoiceDate: r.invoice_date,
      status: group?.status ?? r.status,
      totalAmount: Number(r.total_amount ?? 0),
      isConsolidated: r.bulk_invoice_id != null,
      groupId: r.group_id ?? null,
      portalToken: group?.portal_token ?? null,
      billToName: r.bill_to_name ?? null,
      vehicleVin: r.vehicle_vin ?? null,
      periodStart: r.storage_period_start ?? null,
      periodEnd: r.storage_period_end ?? null,
    }
  })

  return { rows }
}

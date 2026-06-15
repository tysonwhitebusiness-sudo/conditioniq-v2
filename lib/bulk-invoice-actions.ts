'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export interface BulkInvoiceRow {
  vehicleId: string | null
  vin: string
  vehicleDescription: string | null
  effectiveStart: string
  effectiveEnd: string
  days: number
  billingType: 'daily' | 'monthly'
  rate: number
  subtotal: number
}

export async function getNextBulkInvoiceNumber(companyId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('lot_invoices')
    .select('invoice_number')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let next = 1
  if (data?.invoice_number) {
    const match = data.invoice_number.match(/(\d+)$/)
    if (match) next = parseInt(match[1], 10) + 1
  }
  return `INV-${String(next).padStart(4, '0')}`
}

export async function createBulkInvoiceUploadUrl(
  companyId: string,
  invoiceNumber: string,
): Promise<{ path: string; token: string } | null> {
  const supabase = createAdminClient()
  const path = `${companyId}/${invoiceNumber}.pdf`
  const { data, error } = await supabase.storage
    .from('invoices')
    .createSignedUploadUrl(path)
  if (error) { console.error('[bulk-invoices] createUploadUrl', error); return null }
  return { path, token: data.token }
}

export async function saveBulkInvoice({
  companyId,
  invoiceNumber,
  invoiceDate,
  dueDate,
  billToName,
  billToContact,
  notes,
  storagePath,
  rows,
  createdBy,
}: {
  companyId: string
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string | null
  billToName: string
  billToContact?: string | null
  notes?: string | null
  storagePath: string | null
  rows: BulkInvoiceRow[]
  createdBy: string | null
}): Promise<{ bulkInvoiceId: string | null; error: string | null }> {
  const supabase = createAdminClient()
  const bulkInvoiceId = crypto.randomUUID()

  const inserts = rows.map(r => ({
    company_id: companyId,
    vehicle_id: r.vehicleId,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    due_date: dueDate ?? null,
    bill_to_name: billToName,
    bill_to_contact: billToContact ?? null,
    vehicle_vin: r.vin,
    vehicle_description: r.vehicleDescription,
    days_on_lot: r.days,
    billing_type: r.billingType,
    rate: r.rate,
    total_amount: r.subtotal,
    storage_path: storagePath,
    notes: notes ?? null,
    status: 'draft' as const,
    created_by: createdBy,
    bulk_invoice_id: bulkInvoiceId,
  }))

  const { error } = await supabase.from('lot_invoices').insert(inserts)
  if (error) { console.error('[bulk-invoices] save', error); return { bulkInvoiceId: null, error: error.message } }
  return { bulkInvoiceId, error: null }
}

export async function getBulkInvoiceSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from('invoices')
    .createSignedUrl(storagePath, 3600)
  if (error) { console.error('[bulk-invoices] signedUrl', error); return null }
  return data.signedUrl
}

export async function updateBulkInvoiceStatus(
  bulkInvoiceId: string,
  status: 'draft' | 'sent' | 'paid',
): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('lot_invoices').update({ status }).eq('bulk_invoice_id', bulkInvoiceId)
}

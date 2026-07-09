'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeCompanyAccess } from '@/lib/inspection-auth'

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
  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) throw new Error('Not authorized')

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('get_next_invoice_number', { p_company_id: companyId })
  if (!error && data) return data as string
  // fallback
  const { data: latest } = await supabase
    .from('lot_invoices')
    .select('invoice_number')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  let next = 1
  if (latest?.invoice_number) {
    const match = latest.invoice_number.match(/(\d+)$/)
    if (match) next = parseInt(match[1], 10) + 1
  }
  return `INV-${String(next).padStart(4, '0')}`
}

export async function createBulkInvoiceUploadUrl(
  companyId: string,
  invoiceNumber: string,
): Promise<{ path: string; token: string } | null> {
  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) return null

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
  customerId,
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
  customerId?: string | null
}): Promise<{ bulkInvoiceId: string | null; groupId: string | null; error: string | null }> {
  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) return { bulkInvoiceId: null, groupId: null, error: 'Not authorized' }

  const supabase = createAdminClient()
  const bulkInvoiceId = crypto.randomUUID()

  // Create a group header for this bulk invoice
  let groupId: string | null = null
  const { data: group } = await supabase
    .from('lot_invoice_groups')
    .insert({
      company_id: companyId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate ?? null,
      bill_to_name: billToName,
      bill_to_contact: billToContact ?? null,
      notes: notes ?? null,
      customer_id: customerId ?? null,
      status: 'draft' as const,
      created_by: createdBy,
    })
    .select('id')
    .single()
  groupId = group?.id ?? null

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
    group_id: groupId,
  }))

  const { error } = await supabase.from('lot_invoices').insert(inserts)
  if (error) { console.error('[bulk-invoices] save', error); return { bulkInvoiceId: null, groupId: null, error: error.message } }
  return { bulkInvoiceId, groupId, error: null }
}

export async function getBulkInvoiceSignedUrl(storagePath: string): Promise<string | null> {
  const companyId = storagePath.split('/')[0]
  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) return null

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
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('lot_invoices')
    .select('company_id')
    .eq('bulk_invoice_id', bulkInvoiceId)
    .limit(1)
    .maybeSingle()
  if (!existing) return
  const ok = await authorizeCompanyAccess(existing.company_id)
  if (!ok) return

  const supabase = createAdminClient()
  await supabase.from('lot_invoices').update({ status }).eq('bulk_invoice_id', bulkInvoiceId)
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface LotInvoice {
  id: string
  company_id: string
  vehicle_id: string | null
  invoice_number: string
  invoice_date: string
  due_date: string | null
  bill_to_name: string | null
  bill_to_contact: string | null
  vehicle_vin: string | null
  vehicle_description: string | null
  days_on_lot: number
  billing_type: 'daily' | 'monthly'
  rate: number
  total_amount: number
  storage_path: string | null
  notes: string | null
  status: 'draft' | 'sent' | 'paid'
  created_at: string
  created_by: string | null
  bulk_invoice_id: string | null  // null for individual invoices; shared UUID for bulk batches
  group_id?: string | null         // lot_invoice_groups FK (null for legacy rows)
}

export async function getNextInvoiceNumber(companyId: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_next_invoice_number', { p_company_id: companyId })
  if (!error && data) return data as string
  // fallback if RPC unavailable
  const { data: latest } = await supabase
    .from('lot_invoices')
    .select('invoice_number')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  let next = 1
  if (latest?.invoice_number) {
    const match = latest.invoice_number.match(/(\d+)$/)
    if (match) next = parseInt(match[1], 10) + 1
  }
  return `INV-${String(next).padStart(4, '0')}`
}

export async function createInvoiceUploadUrl(companyId: string, invoiceNumber: string): Promise<{ path: string; token: string } | null> {
  const supabase = createAdminClient()
  const path = `${companyId}/${invoiceNumber}.pdf`
  const { data, error } = await supabase.storage
    .from('invoices')
    .createSignedUploadUrl(path)
  if (error) { console.error('[invoices] createUploadUrl', error); return null }
  return { path, token: data.token }
}

export async function getInvoiceSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from('invoices')
    .createSignedUrl(storagePath, 3600)
  if (error) { console.error('[invoices] signedUrl', error); return null }
  return data.signedUrl
}

export async function saveLotInvoice(invoice: Omit<LotInvoice, 'id' | 'created_at'>): Promise<LotInvoice | null> {
  const supabase = createClient()

  // Create a group header for this invoice so the new detail page and portal work
  let groupId: string | null = invoice.group_id ?? null
  if (!groupId) {
    const { data: group } = await supabase
      .from('lot_invoice_groups')
      .insert({
        company_id: invoice.company_id,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date ?? null,
        bill_to_name: invoice.bill_to_name,
        bill_to_contact: invoice.bill_to_contact ?? null,
        notes: invoice.notes ?? null,
        status: invoice.status ?? 'draft',
        created_by: invoice.created_by,
      })
      .select('id')
      .single()
    groupId = group?.id ?? null
  }

  const { data, error } = await supabase
    .from('lot_invoices')
    .insert({ ...invoice, group_id: groupId })
    .select()
    .single()
  if (error) { console.error('[invoices] save', error); return null }
  return data as LotInvoice
}

export async function getCompanyInvoices(companyId: string): Promise<LotInvoice[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('lot_invoices')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  return (data ?? []) as LotInvoice[]
}

export async function updateInvoiceStatus(invoiceId: string, status: 'draft' | 'sent' | 'paid'): Promise<void> {
  const supabase = createClient()
  await supabase.from('lot_invoices').update({ status }).eq('id', invoiceId)
}

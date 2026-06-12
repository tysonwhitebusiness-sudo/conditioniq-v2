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
}

export async function getNextInvoiceNumber(companyId: string): Promise<string> {
  const supabase = createClient()
  const { data } = await supabase
    .from('lot_invoices')
    .select('invoice_number')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  let next = 1
  if (data?.invoice_number) {
    const match = data.invoice_number.match(/(\d+)$/)
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
  const { data, error } = await supabase
    .from('lot_invoices')
    .insert(invoice)
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

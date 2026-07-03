'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type InvoiceGroupStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'

// INVOICE_STATUS_LABELS and PAYMENT_METHOD_LABELS live in lib/invoice-utils.ts

export interface InvoiceGroup {
  id: string
  company_id: string
  customer_id: string | null
  invoice_number: string
  invoice_date: string
  due_date: string | null
  bill_to_name: string | null
  bill_to_contact: string | null
  status: InvoiceGroupStatus
  notes: string | null
  portal_token: string
  portal_viewed: boolean
  portal_viewed_at: string | null
  sent_at: string | null
  created_at: string
  created_by: string | null
}

export interface InvoicePayment {
  id: string
  group_id: string
  company_id: string
  amount: number
  payment_method: 'check' | 'ach' | 'cash' | 'credit_card' | 'other'
  payment_date: string
  notes: string | null
  created_at: string
  created_by: string | null
}

export interface InvoiceAdjustment {
  id: string
  group_id: string
  company_id: string
  label: string
  amount: number
  created_at: string
  created_by: string | null
}

export interface InvoiceLineItem {
  id: string
  vehicle_vin: string | null
  vehicle_description: string | null
  days_on_lot: number
  billing_type: 'daily' | 'monthly'
  rate: number
  total_amount: number
  storage_path: string | null
}

export interface InvoiceGroupDetail extends InvoiceGroup {
  line_items: InvoiceLineItem[]
  payments: InvoicePayment[]
  adjustments: InvoiceAdjustment[]
  customer: { id: string; name: string; email: string | null; phone: string | null } | null
}

// ── Number Generation ─────────────────────────────────────────────────────────

export async function getNextGroupInvoiceNumber(companyId: string): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_next_invoice_number', { p_company_id: companyId })
  if (error) {
    console.error('[invoice-groups] next-number rpc failed, falling back', error)
    // fallback: scan existing invoices
    const { data: latest } = await supabase
      .from('lot_invoices')
      .select('invoice_number')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    let next = 1
    if (latest?.invoice_number) {
      const m = latest.invoice_number.match(/(\d+)$/)
      if (m) next = parseInt(m[1], 10) + 1
    }
    return `INV-${String(next).padStart(4, '0')}`
  }
  return data as string
}

// ── Group CRUD ────────────────────────────────────────────────────────────────

export async function createInvoiceGroup(params: {
  companyId: string
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string | null
  billToName: string | null
  billToContact?: string | null
  notes?: string | null
  customerId?: string | null
  status?: InvoiceGroupStatus
  createdBy: string | null
}): Promise<InvoiceGroup | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lot_invoice_groups')
    .insert({
      company_id: params.companyId,
      invoice_number: params.invoiceNumber,
      invoice_date: params.invoiceDate,
      due_date: params.dueDate ?? null,
      bill_to_name: params.billToName,
      bill_to_contact: params.billToContact ?? null,
      notes: params.notes ?? null,
      customer_id: params.customerId ?? null,
      status: params.status ?? 'draft',
      created_by: params.createdBy,
    })
    .select()
    .single()
  if (error) { console.error('[invoice-groups] create', error); return null }
  return data as InvoiceGroup
}

export async function getInvoiceGroups(companyId: string): Promise<InvoiceGroup[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lot_invoice_groups')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
  if (error) { console.error('[invoice-groups] list', error); return [] }
  return (data ?? []) as InvoiceGroup[]
}

export async function getInvoiceGroupDetail(groupId: string): Promise<InvoiceGroupDetail | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lot_invoice_groups')
    .select(`
      *,
      customer:customers!customer_id(id, name, email, phone),
      line_items:lot_invoices!group_id(id, vehicle_vin, vehicle_description, days_on_lot, billing_type, rate, total_amount, storage_path),
      payments:lot_invoice_payments!group_id(*),
      adjustments:lot_invoice_adjustments!group_id(*)
    `)
    .eq('id', groupId)
    .single()
  if (error) { console.error('[invoice-groups] detail', error); return null }
  return data as unknown as InvoiceGroupDetail
}

export async function getInvoiceGroupByToken(token: string): Promise<InvoiceGroupDetail | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('lot_invoice_groups')
    .select(`
      *,
      customer:customers!customer_id(id, name, email, phone),
      line_items:lot_invoices!group_id(id, vehicle_vin, vehicle_description, days_on_lot, billing_type, rate, total_amount, storage_path),
      payments:lot_invoice_payments!group_id(*),
      adjustments:lot_invoice_adjustments!group_id(*)
    `)
    .eq('portal_token', token)
    .single()
  if (error) { console.error('[invoice-groups] by-token', error); return null }

  if (data && !data.portal_viewed) {
    await supabase
      .from('lot_invoice_groups')
      .update({ portal_viewed: true, portal_viewed_at: new Date().toISOString() })
      .eq('id', data.id)
    data.portal_viewed = true
  }

  return data as unknown as InvoiceGroupDetail
}

// ── Status & Notes ────────────────────────────────────────────────────────────

export async function updateInvoiceGroupStatus(
  groupId: string,
  status: InvoiceGroupStatus,
): Promise<void> {
  const supabase = createClient()
  const update: Record<string, unknown> = { status }
  if (status === 'sent') update.sent_at = new Date().toISOString()
  const { error } = await supabase.from('lot_invoice_groups').update(update).eq('id', groupId)
  if (error) throw error
}

export async function updateInvoiceGroupNotes(
  groupId: string,
  notes: string | null,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('lot_invoice_groups').update({ notes }).eq('id', groupId)
  if (error) throw error
}

// ── Payments ──────────────────────────────────────────────────────────────────

export async function addInvoicePayment(params: {
  groupId: string
  companyId: string
  amount: number
  paymentMethod: 'check' | 'ach' | 'cash' | 'credit_card' | 'other'
  paymentDate: string
  notes?: string | null
  createdBy: string | null
}): Promise<InvoicePayment | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lot_invoice_payments')
    .insert({
      group_id: params.groupId,
      company_id: params.companyId,
      amount: params.amount,
      payment_method: params.paymentMethod,
      payment_date: params.paymentDate,
      notes: params.notes ?? null,
      created_by: params.createdBy,
    })
    .select()
    .single()
  if (error) { console.error('[invoice-groups] add-payment', error); return null }
  return data as InvoicePayment
}

export async function deleteInvoicePayment(paymentId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('lot_invoice_payments').delete().eq('id', paymentId)
  if (error) throw error
}

// ── Adjustments ───────────────────────────────────────────────────────────────

export async function addInvoiceAdjustment(params: {
  groupId: string
  companyId: string
  label: string
  amount: number
  createdBy: string | null
}): Promise<InvoiceAdjustment | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lot_invoice_adjustments')
    .insert({
      group_id: params.groupId,
      company_id: params.companyId,
      label: params.label,
      amount: params.amount,
      created_by: params.createdBy,
    })
    .select()
    .single()
  if (error) { console.error('[invoice-groups] add-adjustment', error); return null }
  return data as InvoiceAdjustment
}

export async function deleteInvoiceAdjustment(adjustmentId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('lot_invoice_adjustments').delete().eq('id', adjustmentId)
  if (error) throw error
}

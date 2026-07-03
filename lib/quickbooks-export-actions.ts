'use server'

import { createClient } from '@/lib/supabase/server'

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw + 'T00:00:00')
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function toQBDate(raw: string | null | undefined): string {
  const d = parseDate(raw)
  if (!d) return ''
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}/${dd}/${d.getFullYear()}`
}

function inRange(raw: string | null | undefined, start: Date, end: Date): boolean {
  const d = parseDate(raw)
  if (!d) return false
  return d >= start && d <= end
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function cell(val: string | number | null | undefined): string {
  const s = val == null ? '' : String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(cell).join(',')
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExportParams {
  companyId: string
  startDate: string  // YYYY-MM-DD inclusive
  endDate: string    // YYYY-MM-DD inclusive
  customerId?: string | null
}

export interface ExportResult {
  invoicesCsv: string
  paymentsCsv: string
  invoiceCount: number
  paymentCount: number
  error?: string
}

// ── Main export action ────────────────────────────────────────────────────────

export async function exportQuickBooksCSV(params: ExportParams): Promise<ExportResult> {
  const supabase = createClient()
  const { companyId, startDate, endDate, customerId } = params

  const rangeStart = new Date(startDate + 'T00:00:00')
  const rangeEnd   = new Date(endDate   + 'T23:59:59')

  // ── 1. Grouped invoices ───────────────────────────────────────────────────

  let gq = supabase
    .from('lot_invoice_groups')
    .select(`
      id, invoice_number, invoice_date, due_date, bill_to_name, bill_to_contact,
      status, notes, customer_id,
      lot_invoices!group_id (
        id, vehicle_description, vehicle_vin, days_on_lot, billing_type, rate, total_amount
      ),
      lot_invoice_payments!group_id (
        id, amount, payment_date, payment_method, notes
      ),
      lot_invoice_adjustments!group_id (
        id, label, amount
      ),
      customers!customer_id (
        name, billing_address, payment_terms
      )
    `)
    .eq('company_id', companyId)
    .order('invoice_date', { ascending: true })

  if (customerId) gq = gq.eq('customer_id', customerId)

  const { data: groups, error: groupErr } = await gq
  if (groupErr) {
    return { invoicesCsv: '', paymentsCsv: '', invoiceCount: 0, paymentCount: 0, error: groupErr.message }
  }

  // ── 2. Legacy invoices (group_id IS NULL) ─────────────────────────────────

  let lq = supabase
    .from('lot_invoices')
    .select(`
      id, invoice_number, invoice_date, due_date, bill_to_name, bill_to_contact,
      status, notes, vehicle_description, vehicle_vin, days_on_lot, billing_type, rate, total_amount
    `)
    .eq('company_id', companyId)
    .is('group_id', null)
    .order('invoice_date', { ascending: true })

  // Legacy rows have no customer_id link — skip customerId filter for them
  // (they can't be reliably scoped to a customer without a FK)
  if (customerId) {
    // If exporting by customer, skip legacy rows (no reliable FK)
    lq = lq.eq('id', '00000000-0000-0000-0000-000000000000') // returns nothing
  }

  const { data: legacyAll } = await lq

  // ── 3. Filter by date range ───────────────────────────────────────────────

  const filteredGroups = (groups ?? []).filter(g => inRange(g.invoice_date, rangeStart, rangeEnd))

  // Group legacy rows by invoice_number
  const legacyMap = new Map<string, typeof legacyAll>()
  for (const r of legacyAll ?? []) {
    if (!inRange(r.invoice_date, rangeStart, rangeEnd)) continue
    if (!legacyMap.has(r.invoice_number)) legacyMap.set(r.invoice_number, [])
    legacyMap.get(r.invoice_number)!.push(r)
  }

  // ── 4. Build invoices CSV ─────────────────────────────────────────────────

  const INV_HEADERS = [
    '*InvoiceNo', '*Customer', '*InvoiceDate', '*DueDate',
    'Terms', 'BillingAddress', 'Memo',
    'Item(Product/Service)', 'ItemDescription',
    'ItemQuantity', 'ItemRate', '*ItemAmount', 'Currency',
  ]

  const invRows: string[] = [INV_HEADERS.join(',')]
  let invoiceCount = 0

  for (const g of filteredGroups) {
    // Supabase returns many-to-one FK joins as objects, one-to-many as arrays
    const cust = (g.customers && !Array.isArray(g.customers))
      ? (g.customers as { name: string; billing_address: string | null; payment_terms: string | null })
      : null
    const customerName   = cust?.name ?? g.bill_to_name ?? ''
    const terms          = cust?.payment_terms ?? ''
    const billingAddress = cust?.billing_address ?? ''
    const lineItems      = (g.lot_invoices ?? []) as {
      vehicle_description: string | null; vehicle_vin: string | null
      days_on_lot: number; billing_type: string; rate: number; total_amount: number
    }[]
    const adjustments    = (g.lot_invoice_adjustments ?? []) as {
      label: string; amount: number
    }[]

    invoiceCount++

    // Build ordered list: vehicle line items first, then adjustments
    type LineEntry = { isAdj: boolean; desc: string; qty: number | string; rate: string; amount: string }
    const entries: LineEntry[] = [
      ...lineItems.map(li => ({
        isAdj: false,
        desc: [
          li.vehicle_description,
          li.vehicle_vin ? `VIN: ${li.vehicle_vin}` : null,
          li.days_on_lot != null
            ? `${li.days_on_lot} ${li.billing_type === 'monthly' ? 'month(s)' : 'day(s)'}` : null,
        ].filter(Boolean).join(' · '),
        qty:    li.days_on_lot ?? 1,
        rate:   Number(li.rate ?? 0).toFixed(2),
        amount: Number(li.total_amount ?? 0).toFixed(2),
      })),
      ...adjustments.map(adj => ({
        isAdj:  true,
        desc:   adj.label,
        qty:    1,
        rate:   '',
        amount: Number(adj.amount ?? 0).toFixed(2),
      })),
    ]

    if (entries.length === 0) {
      invRows.push(row([
        g.invoice_number, customerName, toQBDate(g.invoice_date), toQBDate(g.due_date),
        terms, billingAddress, g.notes ?? '',
        '', '', '', '', '0.00', 'USD',
      ]))
    } else {
      entries.forEach((e, i) => {
        const first = i === 0
        invRows.push(row([
          g.invoice_number,
          first ? customerName        : '',
          first ? toQBDate(g.invoice_date) : '',
          first ? toQBDate(g.due_date)     : '',
          first ? terms               : '',
          first ? billingAddress      : '',
          first ? (g.notes ?? '')     : '',
          e.isAdj ? 'Adjustment' : 'Lot Storage',
          e.desc,
          e.qty,
          e.rate,
          e.amount,
          first ? 'USD' : '',
        ]))
      })
    }
  }

  // Legacy rows
  for (const [invNum, rows_] of Array.from(legacyMap.entries())) {
    if (!rows_ || rows_.length === 0) continue
    const first = rows_[0]
    invoiceCount++

    rows_.forEach((r: typeof rows_[0], i: number) => {
      const desc = [
        r.vehicle_description,
        r.vehicle_vin ? `VIN: ${r.vehicle_vin}` : null,
        r.days_on_lot != null
          ? `${r.days_on_lot} ${r.billing_type === 'monthly' ? 'month(s)' : 'day(s)'}` : null,
      ].filter(Boolean).join(' · ')

      invRows.push(row([
        invNum,
        i === 0 ? (first.bill_to_name ?? '') : '',
        i === 0 ? toQBDate(first.invoice_date) : '',
        i === 0 ? toQBDate(first.due_date) : '',
        '', '',
        i === 0 ? (first.notes ?? '') : '',
        'Lot Storage', desc,
        r.days_on_lot ?? 1,
        Number(r.rate ?? 0).toFixed(2),
        Number(r.total_amount ?? 0).toFixed(2),
        i === 0 ? 'USD' : '',
      ]))
    })
  }

  // ── 5. Build payments CSV ─────────────────────────────────────────────────

  const PMT_HEADERS = [
    '*RefNo', '*Customer', '*PaymentDate', '*Amount',
    'PaymentMethod', 'Memo', '*AppliedToInvoiceNo',
  ]

  const pmtRows: string[] = [PMT_HEADERS.join(',')]
  let paymentCount = 0

  for (const g of filteredGroups) {
    const cust = (g.customers && !Array.isArray(g.customers))
      ? (g.customers as { name: string })
      : null
    const customerName = cust?.name ?? g.bill_to_name ?? ''
    const payments = (g.lot_invoice_payments ?? []) as {
      amount: number; payment_date: string; payment_method: string; notes: string | null
    }[]

    for (const pmt of payments) {
      paymentCount++
      pmtRows.push(row([
        `PMT-${g.invoice_number}-${paymentCount}`,
        customerName,
        toQBDate(pmt.payment_date),
        Number(pmt.amount ?? 0).toFixed(2),
        pmt.payment_method ?? '',
        pmt.notes ?? '',
        g.invoice_number,
      ]))
    }
  }

  return {
    invoicesCsv: invRows.join('\r\n'),
    paymentsCsv: pmtRows.join('\r\n'),
    invoiceCount,
    paymentCount,
  }
}

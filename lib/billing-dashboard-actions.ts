'use server'

import { createClient } from '@/lib/supabase/server'
import { logVehicleEvent } from '@/lib/vehicle-events-actions'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BillingKPIs {
  outstandingBalance: number
  collectedThisMonth: number
  overdueCount: number
  vehiclesOnLot: number
  unbilledCount: number        // on lot with no invoice at all
}

export interface VehicleBillingRow {
  id: string
  vin: string
  year: string | null
  make: string | null
  model: string | null
  arrivedAt: string
  releasedAt: string | null
  daysOnLot: number
  isOnLot: boolean
  customerName: string | null
  customerId: string | null
  dailyRate: number | null
  monthlyRate: number | null
  billingType: string | null
  estimatedCharge: number | null
  accumulatedFees: number
  lastInvoiceDate: string | null
  lastInvoiceNumber: string | null
  lastInvoiceStatus: string | null
  outstandingAmount: number
  daysSinceLastBill: number | null
}

export interface OutstandingInvoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  dueDate: string | null
  billToName: string | null
  billToContact: string | null
  totalAmount: number
  status: string
  daysOverdue: number
  vehicleVin: string | null
  vehicleDescription: string | null
  bulkInvoiceId: string | null
  groupId: string | null
}

export interface AgingBucket {
  key: 'current' | '1_30' | '31_60' | '60_plus'
  label: string
  count: number
  total: number
  color: string
  textColor: string
}

export interface RevenueMonth {
  month: string   // YYYY-MM
  label: string   // "Jan '26"
  invoiced: number
  collected: number
}

export interface TopCustomer {
  name: string
  totalInvoiced: number
  totalPaid: number
  invoiceCount: number
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

export async function getBillingKPIs(companyId: string): Promise<BillingKPIs> {
  const supabase = createClient()

  const [invoicesRes, vehiclesOnLotRes, allVehiclesRes] = await Promise.all([
    supabase
      .from('lot_invoices')
      .select('id, status, total_amount, due_date, invoice_date, vehicle_id')
      .eq('company_id', companyId),
    supabase
      .from('storage_vehicles')
      .select('id')
      .eq('company_id', companyId)
      .not('arrived_at', 'is', null)
      .is('released_at', null),
    // vehicles on lot that have any lot_invoice
    supabase
      .from('lot_invoices')
      .select('vehicle_id')
      .eq('company_id', companyId)
      .not('vehicle_id', 'is', null),
  ])

  const invoices = invoicesRes.data ?? []
  const vehiclesOnLot = vehiclesOnLotRes.data ?? []
  const billedVehicleIds = new Set((allVehiclesRes.data ?? []).map(r => r.vehicle_id as string))

  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)

  let outstandingBalance = 0
  let collectedThisMonth = 0
  let overdueCount = 0

  for (const inv of invoices) {
    if (inv.status === 'draft' || inv.status === 'sent') {
      outstandingBalance += Number(inv.total_amount ?? 0)
      const dueStr = inv.due_date
      const isOverdue = dueStr ? dueStr < today : inv.invoice_date.slice(0, 7) < thisMonth
      if (isOverdue) overdueCount++
    }
    if (inv.status === 'paid' && inv.invoice_date?.startsWith(thisMonth)) {
      collectedThisMonth += Number(inv.total_amount ?? 0)
    }
  }

  const unbilledCount = vehiclesOnLot.filter(v => !billedVehicleIds.has(v.id)).length

  return {
    outstandingBalance,
    collectedThisMonth,
    overdueCount,
    vehiclesOnLot: vehiclesOnLot.length,
    unbilledCount,
  }
}

// ── Vehicle billing rows (Unbilled tab) ───────────────────────────────────────

export async function getVehicleBillingRows(companyId: string): Promise<VehicleBillingRow[]> {
  const supabase = createClient()

  // 90-day lookback on released vehicles so recently-released still appear
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)
  const cutoffStr = cutoff.toISOString()

  const [vehiclesRes, invoicesRes, chargesRes, customersRes] = await Promise.all([
    supabase
      .from('storage_vehicles')
      .select('id, vin, year, make, model, arrived_at, released_at, customer_id, sub_client_name, daily_rate, monthly_rate, billing_type')
      .eq('company_id', companyId)
      .not('arrived_at', 'is', null)
      .or(`released_at.is.null,released_at.gte.${cutoffStr}`)
      .order('arrived_at', { ascending: true }),
    supabase
      .from('lot_invoices')
      .select('id, vehicle_id, invoice_number, invoice_date, status, total_amount')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicle_charges')
      .select('vehicle_id, amount')
      .eq('company_id', companyId),
    supabase
      .from('customers')
      .select('id, name')
      .eq('company_id', companyId),
  ])

  const vehicles = vehiclesRes.data ?? []
  const invoices = invoicesRes.data ?? []
  const charges = chargesRes.data ?? []
  const customers = customersRes.data ?? []

  const customerMap = new Map(customers.map(c => [c.id, c.name]))

  const invoicesByVehicle = new Map<string, typeof invoices>()
  for (const inv of invoices) {
    if (!inv.vehicle_id) continue
    const arr = invoicesByVehicle.get(inv.vehicle_id) ?? []
    arr.push(inv)
    invoicesByVehicle.set(inv.vehicle_id, arr)
  }

  const chargesByVehicle = new Map<string, number>()
  for (const c of charges) {
    chargesByVehicle.set(c.vehicle_id, (chargesByVehicle.get(c.vehicle_id) ?? 0) + Number(c.amount))
  }

  const now = new Date()

  return vehicles.map(v => {
    const arrivedAt = new Date(v.arrived_at)
    const releasedAt = v.released_at ? new Date(v.released_at) : null
    const isOnLot = !releasedAt
    const effectiveEnd = releasedAt && releasedAt < now ? releasedAt : now
    const daysOnLot = Math.max(0, Math.floor((effectiveEnd.getTime() - arrivedAt.getTime()) / 86400000))

    let estimatedCharge: number | null = null
    if (v.billing_type === 'daily' && v.daily_rate) {
      estimatedCharge = daysOnLot * Number(v.daily_rate)
    } else if (v.billing_type === 'monthly' && v.monthly_rate) {
      estimatedCharge = (daysOnLot / 30) * Number(v.monthly_rate)
    } else if (v.daily_rate) {
      estimatedCharge = daysOnLot * Number(v.daily_rate)
    } else if (v.monthly_rate) {
      estimatedCharge = (daysOnLot / 30) * Number(v.monthly_rate)
    }

    const vehicleInvoices = invoicesByVehicle.get(v.id) ?? []
    const latestInv = vehicleInvoices[0]

    const outstandingAmount = vehicleInvoices
      .filter(i => i.status === 'draft' || i.status === 'sent')
      .reduce((s, i) => s + Number(i.total_amount ?? 0), 0)

    const lastBilledDate = latestInv?.invoice_date ?? null
    const daysSinceLastBill = lastBilledDate
      ? Math.floor((now.getTime() - new Date(lastBilledDate).getTime()) / 86400000)
      : null

    const customerName = v.customer_id
      ? (customerMap.get(v.customer_id) ?? v.sub_client_name)
      : v.sub_client_name

    return {
      id: v.id,
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.model,
      arrivedAt: v.arrived_at,
      releasedAt: v.released_at,
      daysOnLot,
      isOnLot,
      customerName: customerName ?? null,
      customerId: v.customer_id,
      dailyRate: v.daily_rate ? Number(v.daily_rate) : null,
      monthlyRate: v.monthly_rate ? Number(v.monthly_rate) : null,
      billingType: v.billing_type,
      estimatedCharge,
      accumulatedFees: chargesByVehicle.get(v.id) ?? 0,
      lastInvoiceDate: latestInv?.invoice_date ?? null,
      lastInvoiceNumber: latestInv?.invoice_number ?? null,
      lastInvoiceStatus: latestInv?.status ?? null,
      outstandingAmount,
      daysSinceLastBill,
    }
  })
}

// ── Outstanding invoices (Outstanding tab) ────────────────────────────────────

export async function getOutstandingInvoices(companyId: string): Promise<OutstandingInvoice[]> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('lot_invoices')
    .select('id, invoice_number, invoice_date, due_date, bill_to_name, bill_to_contact, total_amount, status, vehicle_vin, vehicle_description, bulk_invoice_id, group_id')
    .eq('company_id', companyId)
    .in('status', ['draft', 'sent'])
    .order('invoice_date', { ascending: true })

  if (error) { console.error('[dashboard] outstanding', error); return [] }

  const today = new Date().toISOString().slice(0, 10)

  return (data ?? []).map(inv => {
    const dueStr = inv.due_date ?? null
    let daysOverdue = 0
    if (dueStr) {
      if (dueStr < today) daysOverdue = Math.floor((Date.parse(today) - Date.parse(dueStr)) / 86400000)
    } else {
      // Implied due: invoice_date + 30 days
      const implied = new Date(inv.invoice_date)
      implied.setDate(implied.getDate() + 30)
      const impliedStr = implied.toISOString().slice(0, 10)
      if (impliedStr < today) daysOverdue = Math.floor((Date.parse(today) - implied.getTime()) / 86400000)
    }

    return {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      invoiceDate: inv.invoice_date,
      dueDate: inv.due_date,
      billToName: inv.bill_to_name,
      billToContact: inv.bill_to_contact,
      totalAmount: Number(inv.total_amount),
      status: inv.status,
      daysOverdue,
      vehicleVin: inv.vehicle_vin,
      vehicleDescription: inv.vehicle_description,
      bulkInvoiceId: inv.bulk_invoice_id,
      groupId: inv.group_id,
    }
  })
}

// computeAgingBuckets lives in lib/billing-utils.ts (pure function, not a server action)

// ── Revenue data (Revenue tab) ────────────────────────────────────────────────

export async function getRevenueData(companyId: string): Promise<{
  months: RevenueMonth[]
  topCustomers: TopCustomer[]
  invoicedYtd: number
  collectedYtd: number
}> {
  const supabase = createClient()

  const yearStart = `${new Date().getFullYear()}-01-01`
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11)
  const cutoff = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`

  const { data } = await supabase
    .from('lot_invoices')
    .select('invoice_date, status, total_amount, bill_to_name, bulk_invoice_id, invoice_number')
    .eq('company_id', companyId)
    .gte('invoice_date', cutoff)
    .order('invoice_date', { ascending: true })

  const invoices = data ?? []

  // Build 12-month series (fill gaps with zero)
  const monthMap = new Map<string, { invoiced: number; collected: number }>()
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthMap.set(key, { invoiced: 0, collected: 0 })
  }

  // Deduplicate bulk invoices: only count total_amount once per invoice_number group
  const seenInvoiceNumbers = new Map<string, boolean>() // invoiceNumber -> already counted
  for (const inv of invoices) {
    const month = inv.invoice_date.slice(0, 7)
    if (!monthMap.has(month)) continue
    const m = monthMap.get(month)!

    // For bulk invoices each row has the same invoice_number — sum all rows (they are individual vehicle line items)
    m.invoiced += Number(inv.total_amount ?? 0)
    if (inv.status === 'paid') m.collected += Number(inv.total_amount ?? 0)
  }

  const MONTH_LABELS: Record<string, string> = {
    '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
    '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
    '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
  }

  const months: RevenueMonth[] = Array.from(monthMap.entries()).map(([month, d]) => ({
    month,
    label: `${MONTH_LABELS[month.slice(5)]} '${month.slice(2, 4)}`,
    invoiced: d.invoiced,
    collected: d.collected,
  }))

  // Top customers (by bill_to_name, last 12 months)
  const customerMap = new Map<string, { invoiced: number; paid: number; count: number }>()
  for (const inv of invoices) {
    const name = inv.bill_to_name || '—'
    const existing = customerMap.get(name) ?? { invoiced: 0, paid: 0, count: 0 }
    existing.invoiced += Number(inv.total_amount ?? 0)
    if (inv.status === 'paid') existing.paid += Number(inv.total_amount ?? 0)
    existing.count++
    customerMap.set(name, existing)
  }
  const topCustomers: TopCustomer[] = Array.from(customerMap.entries())
    .map(([name, d]) => ({ name, totalInvoiced: d.invoiced, totalPaid: d.paid, invoiceCount: d.count }))
    .sort((a, b) => b.totalInvoiced - a.totalInvoiced)
    .slice(0, 8)

  // YTD totals
  const ytdInvoices = invoices.filter(i => i.invoice_date >= yearStart)
  const invoicedYtd = ytdInvoices.reduce((s, i) => s + Number(i.total_amount ?? 0), 0)
  const collectedYtd = ytdInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total_amount ?? 0), 0)

  return { months, topCustomers, invoicedYtd, collectedYtd }
}

// ── Bulk mark paid ────────────────────────────────────────────────────────────

export async function bulkMarkPaid(
  invoiceIds: string[],
  companyId: string,
): Promise<{ error: string | null }> {
  if (!invoiceIds.length) return { error: null }
  const supabase = createClient()
  const { data: invoices } = await supabase
    .from('lot_invoices')
    .select('vehicle_id, total_amount')
    .in('id', invoiceIds)
    .eq('company_id', companyId)
  const { error } = await supabase
    .from('lot_invoices')
    .update({ status: 'paid' })
    .in('id', invoiceIds)
    .eq('company_id', companyId)
  if (error) return { error: error.message }

  for (const inv of invoices ?? []) {
    if (!inv.vehicle_id) continue
    logVehicleEvent({
      companyId, vehicleId: inv.vehicle_id, eventType: 'invoice_paid',
      description: 'Invoice marked paid (bulk)',
      metadata: { amount: inv.total_amount },
    })
  }

  return { error: null }
}

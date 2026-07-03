import type { OutstandingInvoice, AgingBucket } from '@/lib/billing-dashboard-actions'

export function computeAgingBuckets(invoices: OutstandingInvoice[]): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { key: 'current', label: 'Current',    count: 0, total: 0, color: '#D1FAE5', textColor: '#065F46' },
    { key: '1_30',    label: '1–30 Days',  count: 0, total: 0, color: '#FEF3C7', textColor: '#92400E' },
    { key: '31_60',   label: '31–60 Days', count: 0, total: 0, color: '#FED7AA', textColor: '#9A3412' },
    { key: '60_plus', label: '60+ Days',   count: 0, total: 0, color: '#FEE2E2', textColor: '#991B1B' },
  ]
  for (const inv of invoices) {
    const d = inv.daysOverdue
    if (d <= 0)       { buckets[0].count++; buckets[0].total += inv.totalAmount }
    else if (d <= 30) { buckets[1].count++; buckets[1].total += inv.totalAmount }
    else if (d <= 60) { buckets[2].count++; buckets[2].total += inv.totalAmount }
    else              { buckets[3].count++; buckets[3].total += inv.totalAmount }
  }
  return buckets
}

import type { InvoiceGroupStatus } from '@/lib/invoice-group-actions'

export const INVOICE_STATUS_LABELS: Record<InvoiceGroupStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  check: 'Check',
  ach: 'ACH / Bank Transfer',
  cash: 'Cash',
  credit_card: 'Credit Card',
  other: 'Other',
}

// Single source of truth for invoice status badge styling — used on the vehicle
// detail page, the invoice detail page, and the public invoice portal.
export const INVOICE_STATUS_BADGE_STYLE: Record<InvoiceGroupStatus, { bg: string; color: string; label: string }> = {
  draft:   { bg: 'rgba(244, 166, 42, 0.15)', color: '#B67516', label: 'Draft' },
  sent:    { bg: 'rgba(0, 180, 216, 0.15)',  color: '#0088A8', label: 'Sent' },
  paid:    { bg: 'rgba(46, 158, 109, 0.15)', color: '#2E9E6D', label: 'Paid' },
  overdue: { bg: 'rgba(217, 83, 79, 0.15)',  color: '#D9534F', label: 'Overdue' },
  void:    { bg: 'rgba(138, 150, 163, 0.15)', color: '#8A96A3', label: 'Void' },
}

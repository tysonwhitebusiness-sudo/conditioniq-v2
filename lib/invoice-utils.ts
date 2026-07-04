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

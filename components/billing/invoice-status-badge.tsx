import { INVOICE_STATUS_BADGE_STYLE } from '@/lib/invoice-utils'
import type { InvoiceGroupStatus } from '@/lib/invoice-group-actions'

export default function InvoiceStatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const s = INVOICE_STATUS_BADGE_STYLE[status as InvoiceGroupStatus] ?? INVOICE_STATUS_BADGE_STYLE.draft
  return (
    <span style={{
      display: 'inline-block',
      fontSize: size === 'sm' ? 9 : 12,
      fontWeight: 700,
      letterSpacing: '0.03em',
      textTransform: 'uppercase',
      padding: size === 'sm' ? '3px 8px' : '5px 12px',
      borderRadius: 20,
      background: s.bg,
      color: s.color,
      whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

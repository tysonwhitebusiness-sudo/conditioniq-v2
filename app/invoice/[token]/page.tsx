import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInvoiceGroupByToken } from '@/lib/invoice-group-actions'
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/invoice-utils'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

interface Props {
  params: { token: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return {
    title: 'Invoice',
    robots: { index: false, follow: false },
  }
}

async function getCompanyInfo(companyId: string) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('companies')
    .select('name, logo_url')
    .eq('id', companyId)
    .single()
  return data
}

async function getPdfSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from('invoices')
    .createSignedUrl(storagePath, 3600)
  if (error) return null
  return data.signedUrl
}

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  draft:   { bg: '#F0F4F8', color: '#4A5568', label: 'Draft' },
  sent:    { bg: '#E0F7FC', color: '#0097B2', label: 'Sent' },
  paid:    { bg: '#D1FAE5', color: '#065F46', label: 'Paid' },
  overdue: { bg: '#FEE2E2', color: '#DC2626', label: 'Overdue' },
  void:    { bg: '#F3F4F6', color: '#9CA3AF', label: 'Void' },
}

export default async function PublicInvoicePage({ params }: Props) {
  const group = await getInvoiceGroupByToken(params.token)
  if (!group) notFound()

  const company = await getCompanyInfo(group.company_id)

  // Collect unique PDF paths
  const uniquePaths = Array.from(new Set(
    group.line_items.map(li => li.storage_path).filter(Boolean) as string[]
  ))
  const pdfUrls: Record<string, string> = {}
  await Promise.all(uniquePaths.map(async path => {
    const url = await getPdfSignedUrl(path)
    if (url) pdfUrls[path] = url
  }))

  const lineTotal = group.line_items.reduce((s, li) => s + (li.total_amount ?? 0), 0)
  const adjTotal = group.adjustments.reduce((s, a) => s + (a.amount ?? 0), 0)
  const grandTotal = lineTotal + adjTotal
  const totalPaid = group.payments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const balanceDue = grandTotal - totalPaid
  const statusBadge = STATUS_BADGE[group.status] ?? STATUS_BADGE.draft

  const firstPdfUrl = uniquePaths.length > 0 ? pdfUrls[uniquePaths[0]] : null

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #F0F4F8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        @media print { body { background: #FFF; } }
      `}</style>

      <div style={{ minHeight: '100vh', background: '#F0F4F8', padding: '24px 16px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ background: '#0D1B2A', borderRadius: 16, padding: '24px 28px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Invoice</p>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#FFFFFF', margin: '0 0 4px', fontFamily: 'monospace' }}>{group.invoice_number}</p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>{company?.name ?? ''}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ display: 'inline-block', background: statusBadge.bg, color: statusBadge.color, borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
                {statusBadge.label}
              </span>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#00B4D8', margin: '8px 0 0' }}>${grandTotal.toFixed(2)}</p>
              {balanceDue > 0 && group.status !== 'paid' && group.status !== 'void' && (
                <p style={{ fontSize: 13, color: '#F4A62A', margin: '2px 0 0', fontWeight: 700 }}>Balance Due: ${balanceDue.toFixed(2)}</p>
              )}
            </div>
          </div>

          {/* Bill To + Dates */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: '20px 24px', marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Bill To</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: '0 0 2px' }}>{group.bill_to_name ?? '—'}</p>
                {group.bill_to_contact && <p style={{ fontSize: 13, color: '#4A5568', margin: 0 }}>{group.bill_to_contact}</p>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Invoice Date</p>
                  <p style={{ fontSize: 13, color: '#0D1B2A', fontWeight: 600, margin: 0 }}>
                    {new Date(group.invoice_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {group.due_date && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>Due Date</p>
                    <p style={{ fontSize: 13, color: '#0D1B2A', fontWeight: 600, margin: 0 }}>
                      {new Date(group.due_date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #F0F4F8' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                Services ({group.line_items.length} vehicle{group.line_items.length !== 1 ? 's' : ''})
              </p>
            </div>
            <div style={{ padding: '0 20px' }}>
              {group.line_items.map((li, i) => (
                <div key={li.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: i === 0 ? 'none' : '1px solid #F0F4F8', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>{li.vehicle_description ?? li.vehicle_vin ?? '—'}</p>
                    {li.vehicle_description && li.vehicle_vin && (
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0', fontFamily: 'monospace' }}>{li.vehicle_vin}</p>
                    )}
                    <p style={{ fontSize: 12, color: '#64748B', margin: '3px 0 0' }}>
                      {li.days_on_lot} {li.billing_type === 'daily' ? 'day' : 'month'}{li.days_on_lot !== 1 ? 's' : ''} × ${(li.rate ?? 0).toFixed(2)}/{li.billing_type === 'daily' ? 'day' : 'mo'}
                    </p>
                  </div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: 0, flexShrink: 0 }}>${(li.total_amount ?? 0).toFixed(2)}</p>
                  {li.storage_path && pdfUrls[li.storage_path] && (
                    <a href={pdfUrls[li.storage_path]} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#00B4D8', textDecoration: 'none', fontWeight: 600, flexShrink: 0 }}>
                      View Report ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Adjustments */}
          {group.adjustments.length > 0 && (
            <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, marginBottom: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #F0F4F8' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Adjustments</p>
              </div>
              <div style={{ padding: '0 20px' }}>
                {group.adjustments.map((a, i) => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid #F0F4F8' }}>
                    <p style={{ fontSize: 13, color: '#0D1B2A', margin: 0 }}>{a.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: a.amount < 0 ? '#DC2626' : '#10B981', margin: 0 }}>
                      {a.amount < 0 ? '-' : '+'}${Math.abs(a.amount).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Totals */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
            {group.adjustments.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Subtotal</p>
                <p style={{ fontSize: 13, color: '#0D1B2A', margin: 0 }}>${lineTotal.toFixed(2)}</p>
              </div>
            )}
            {group.payments.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
                  Payment ({PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method} · {new Date(p.payment_date).toLocaleDateString()})
                </p>
                <p style={{ fontSize: 13, color: '#10B981', fontWeight: 600, margin: 0 }}>-${(p.amount ?? 0).toFixed(2)}</p>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid #E1E8F0', marginTop: 4 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>
                {totalPaid > 0 ? 'Balance Due' : 'Total Due'}
              </p>
              <p style={{ fontSize: 18, fontWeight: 800, color: balanceDue <= 0 ? '#10B981' : '#0D1B2A', margin: 0 }}>
                ${Math.max(0, balanceDue).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Notes */}
          {group.notes && (
            <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: '16px 20px', marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Notes</p>
              <p style={{ fontSize: 13, color: '#4A5568', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{group.notes}</p>
            </div>
          )}

          {/* PDF Download */}
          {firstPdfUrl && (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <a href={firstPdfUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 24px', borderRadius: 12, background: '#0D1B2A', color: '#FFFFFF', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
                ↓ Download PDF
              </a>
            </div>
          )}

          {/* Footer */}
          <p style={{ textAlign: 'center', fontSize: 11, color: '#CBD5E1', marginTop: 8 }}>
            Powered by Condition IQ
          </p>

        </div>
      </div>
    </>
  )
}

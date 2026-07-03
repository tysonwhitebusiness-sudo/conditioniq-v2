'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { saveLotBillingDefaultsAction } from '@/lib/lot-server-actions'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import LoadingOverlay from '@/components/ui/loading-overlay'
import {
  DollarSign, Check, Loader2, AlertTriangle, RefreshCw,
  Copy, Mail, X, Car, ChevronRight, TrendingUp, Settings, Download,
} from 'lucide-react'
import {
  getBillingKPIs, getVehicleBillingRows, getOutstandingInvoices,
  computeAgingBuckets, getRevenueData, bulkMarkPaid,
  type BillingKPIs, type VehicleBillingRow, type OutstandingInvoice,
  type AgingBucket, type RevenueMonth, type TopCustomer,
} from '@/lib/billing-dashboard-actions'
import ExportCsvModal from '@/components/billing/export-csv-modal'
import BillingReminderBanner from '@/components/billing/billing-reminder-banner'
import {
  getUnreadBillingNotifications,
  type BillingNotification,
} from '@/lib/billing-notification-actions'

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  midnight: '#0D1B2A',
  navy: '#1B2D40',
  cyan: '#00B4D8',
  amber: '#F4A62A',
  bg: '#F0F4F8',
  border: '#E1E8F0',
  muted: '#94A3B8',
  text: '#0D1B2A',
  green: '#10B981',
  red: '#EF4444',
  orange: '#F97316',
}

type Tab = 'unbilled' | 'outstanding' | 'revenue' | 'settings'
type BillingType = 'daily' | 'monthly'
type UnbilledFilter = 'all' | 'never' | 'attention'

// ── Small shared helpers ──────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function vehicleLabel(row: Pick<VehicleBillingRow, 'year' | 'make' | 'model' | 'vin'>) {
  const parts = [row.year, row.make, row.model].filter(Boolean)
  return parts.length ? parts.join(' ') : row.vin
}

function lastBilledColor(days: number | null): string {
  if (days === null) return C.red
  if (days <= 30) return C.green
  if (days <= 90) return C.amber
  return C.red
}

function lastBilledLabel(days: number | null, status: string | null): string {
  if (days === null) return 'Never billed'
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days <= 30) return `${days}d ago`
  if (days <= 60) return `${Math.round(days / 7)}w ago`
  return `${Math.round(days / 30)}mo ago`
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, accent, loading,
}: {
  label: string; value: string; sub?: string; accent?: string; loading?: boolean
}) {
  return (
    <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 14, padding: '16px 18px' }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>{label}</p>
      {loading ? (
        <div style={{ height: 28, display: 'flex', alignItems: 'center' }}>
          <Loader2 size={16} color={C.muted} style={{ animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <>
          <p style={{ fontSize: 22, fontWeight: 800, color: accent ?? C.midnight, margin: 0, lineHeight: 1.2 }}>{value}</p>
          {sub && <p style={{ fontSize: 11, color: C.muted, margin: '4px 0 0' }}>{sub}</p>}
        </>
      )}
    </div>
  )
}

// ── Tab nav ───────────────────────────────────────────────────────────────────

function TabNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: 'unbilled', label: 'Unbilled' },
    { id: 'outstanding', label: 'Outstanding' },
    { id: 'revenue', label: 'Revenue' },
    { id: 'settings', label: 'Settings' },
  ]
  return (
    <div style={{ display: 'flex', background: '#F0F4F8', borderRadius: 12, padding: 3, gap: 2, marginBottom: 20 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            flex: 1, height: 36, borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 13, fontWeight: 700, transition: 'all 150ms ease',
            background: active === t.id ? '#FFFFFF' : 'transparent',
            color: active === t.id ? C.midnight : C.muted,
            boxShadow: active === t.id ? '0 1px 4px rgba(13,27,42,0.08)' : 'none',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Last-billed dot ───────────────────────────────────────────────────────────

function BilledDot({ days }: { days: number | null }) {
  const color = lastBilledColor(days)
  return (
    <div style={{ width: 10, height: 10, borderRadius: 5, background: color, flexShrink: 0, marginTop: 1 }} />
  )
}

// ── Unbilled tab ──────────────────────────────────────────────────────────────

function UnbilledTab({
  rows, loading, onNavigate,
}: {
  rows: VehicleBillingRow[]
  loading: boolean
  onNavigate: (vehicleId: string) => void
}) {
  const [filter, setFilter] = useState<UnbilledFilter>('all')

  const filtered = useMemo(() => {
    if (filter === 'never') return rows.filter(r => r.lastInvoiceDate === null)
    if (filter === 'attention') return rows.filter(r => r.daysSinceLastBill === null || r.daysSinceLastBill > 30)
    return rows
  }, [rows, filter])

  const totalEstimated = useMemo(
    () => filtered.reduce((s, r) => s + (r.estimatedCharge ?? 0) + r.accumulatedFees, 0),
    [filtered],
  )

  const neverBilled = rows.filter(r => !r.lastInvoiceDate).length

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
      <Loader2 size={22} color={C.muted} style={{ animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div>
      {/* Summary bar */}
      {neverBilled > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 12, padding: '10px 14px', marginBottom: 14 }}>
          <AlertTriangle size={15} color={C.orange} style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: '#9A3412', margin: 0 }}>
            <strong>{neverBilled}</strong> vehicle{neverBilled !== 1 ? 's' : ''} on lot {neverBilled !== 1 ? 'have' : 'has'} never been billed.
          </p>
        </div>
      )}

      {/* Filter pills + estimated total */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { id: 'all' as UnbilledFilter, label: `All (${rows.length})` },
            { id: 'never' as UnbilledFilter, label: `Never Billed (${neverBilled})` },
            { id: 'attention' as UnbilledFilter, label: 'Needs Attention' },
          ] as { id: UnbilledFilter; label: string }[]).map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              height: 28, padding: '0 10px', borderRadius: 20, border: `1.5px solid ${filter === f.id ? C.midnight : C.border}`,
              background: filter === f.id ? C.midnight : '#FFF', color: filter === f.id ? '#FFF' : C.muted,
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {f.label}
            </button>
          ))}
        </div>
        {totalEstimated > 0 && (
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
            Est. unbilled: <strong style={{ color: C.midnight }}>${fmt(totalEstimated)}</strong>
          </p>
        )}
      </div>

      {/* Vehicle rows */}
      <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center' }}>
            <Car size={28} color={C.border} style={{ display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No vehicles match this filter.</p>
          </div>
        ) : filtered.map((row, i) => {
          const estimatedTotal = (row.estimatedCharge ?? 0) + row.accumulatedFees
          const isOnLot = row.isOnLot
          return (
            <div
              key={row.id}
              onClick={() => onNavigate(row.id)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 16px',
                borderTop: i === 0 ? 'none' : `1px solid ${C.bg}`,
                cursor: 'pointer',
                transition: 'background 100ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <BilledDot days={row.daysSinceLastBill} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.midnight, margin: 0 }}>{vehicleLabel(row)}</p>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', color: C.muted }}>{row.vin}</span>
                  {!isOnLot && (
                    <span style={{ fontSize: 9, fontWeight: 700, background: '#F0F4F8', color: C.muted, borderRadius: 4, padding: '1px 5px' }}>RELEASED</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                  {row.customerName && (
                    <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>{row.customerName}</p>
                  )}
                  <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>
                    {row.daysOnLot}d on lot · arrived {fmtDate(row.arrivedAt)}
                  </p>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                {estimatedTotal > 0 && (
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.midnight, margin: 0 }}>${fmt(estimatedTotal)}</p>
                )}
                <p style={{ fontSize: 11, margin: '2px 0 0', color: lastBilledColor(row.daysSinceLastBill) }}>
                  {lastBilledLabel(row.daysSinceLastBill, row.lastInvoiceStatus)}
                </p>
                {row.outstandingAmount > 0 && (
                  <p style={{ fontSize: 10, color: C.amber, margin: '1px 0 0', fontWeight: 700 }}>
                    ${fmt(row.outstandingAmount)} outstanding
                  </p>
                )}
              </div>
              <ChevronRight size={14} color={C.border} style={{ flexShrink: 0, marginTop: 2 }} />
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 10, paddingLeft: 2 }}>
        {[
          { color: C.green, label: '≤ 30 days ago' },
          { color: C.amber, label: '31–90 days ago' },
          { color: C.red, label: '90+ days / never' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: l.color }} />
            <span style={{ fontSize: 11, color: C.muted }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Outstanding tab ───────────────────────────────────────────────────────────

function OutstandingTab({
  invoices, loading, companyId, onRefresh,
}: {
  invoices: OutstandingInvoice[]
  loading: boolean
  companyId: string
  onRefresh: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showMarkPaid, setShowMarkPaid] = useState(false)
  const [showReminder, setShowReminder] = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [copied, setCopied] = useState(false)

  const buckets = useMemo(() => computeAgingBuckets(invoices), [invoices])

  const allSelected = selected.size > 0 && selected.size === invoices.length
  const toggleAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(invoices.map(i => i.id)))
  }
  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectedInvoices = invoices.filter(i => selected.has(i.id))
  const selectedTotal = selectedInvoices.reduce((s, i) => s + i.totalAmount, 0)

  async function handleMarkPaid() {
    if (!selectedInvoices.length) return
    setMarkingPaid(true)
    const { error } = await bulkMarkPaid(Array.from(selected), companyId)
    setMarkingPaid(false)
    if (!error) {
      setSelected(new Set())
      setShowMarkPaid(false)
      onRefresh()
    }
  }

  function buildReminderText(inv: OutstandingInvoice) {
    return `Hi,\n\nThis is a reminder that invoice ${inv.invoiceNumber} for $${fmt(inv.totalAmount)}, issued on ${fmtDate(inv.invoiceDate)}, is${inv.daysOverdue > 0 ? ` ${inv.daysOverdue} days overdue` : ' due'}. Please remit payment at your earliest convenience.\n\nThank you.`
  }

  function copyReminder() {
    const text = selectedInvoices.map(i =>
      `${i.invoiceNumber} · ${i.billToName ?? '—'} · $${fmt(i.totalAmount)} · ${i.daysOverdue > 0 ? `${i.daysOverdue}d overdue` : 'current'}`
    ).join('\n')
    const full = `PAYMENT REMINDER\n\n${text}\n\nPlease remit payment at your earliest convenience.`
    navigator.clipboard.writeText(full).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
      <Loader2 size={22} color={C.muted} style={{ animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  return (
    <div>
      {/* Aging buckets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        {buckets.map(b => (
          <div key={b.key} style={{ background: b.color, borderRadius: 12, padding: '12px 14px' }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: b.textColor, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{b.label}</p>
            <p style={{ fontSize: 18, fontWeight: 800, color: b.textColor, margin: '0 0 2px' }}>${fmt(b.total)}</p>
            <p style={{ fontSize: 11, color: b.textColor, margin: 0, opacity: 0.75 }}>{b.count} invoice{b.count !== 1 ? 's' : ''}</p>
          </div>
        ))}
      </div>

      {/* Invoice list */}
      {invoices.length === 0 ? (
        <div style={{ background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 16, padding: '32px 20px', textAlign: 'center' }}>
          <Check size={28} color={C.green} style={{ display: 'block', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: C.midnight, margin: '0 0 4px' }}>All invoices paid</p>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No outstanding invoices.</p>
        </div>
      ) : (
        <div style={{ background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          {/* Select all header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${C.bg}`, background: C.bg }}>
            <button onClick={toggleAll} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${allSelected ? C.midnight : C.border}`, background: allSelected ? C.midnight : '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              {allSelected && <Check size={11} color="#FFF" />}
            </button>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {selected.size > 0 ? `${selected.size} selected · $${fmt(selectedTotal)}` : `${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
            </p>
          </div>

          {invoices.map((inv, i) => {
            const isChecked = selected.has(inv.id)
            const overdueBadge = inv.daysOverdue > 60
              ? { bg: '#FEE2E2', color: '#991B1B' }
              : inv.daysOverdue > 30
              ? { bg: '#FED7AA', color: '#9A3412' }
              : inv.daysOverdue > 0
              ? { bg: '#FEF3C7', color: '#92400E' }
              : { bg: '#D1FAE5', color: '#065F46' }

            return (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.bg}`, background: isChecked ? '#F8FAFC' : '#FFF' }}>
                <button onClick={() => toggle(inv.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isChecked ? C.midnight : C.border}`, background: isChecked ? C.midnight : '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                  {isChecked && <Check size={11} color="#FFF" />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.midnight, margin: 0, fontFamily: 'monospace' }}>{inv.invoiceNumber}</p>
                    <span style={{ fontSize: 9, fontWeight: 700, background: overdueBadge.bg, color: overdueBadge.color, borderRadius: 4, padding: '1px 5px' }}>
                      {inv.daysOverdue > 0 ? `${inv.daysOverdue}d OVERDUE` : 'CURRENT'}
                    </span>
                  </div>
                  <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>
                    {inv.billToName ?? '—'} · {inv.vehicleDescription ?? inv.vehicleVin ?? ''} · {fmtDate(inv.invoiceDate)}
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: C.midnight, margin: 0 }}>${fmt(inv.totalAmount)}</p>
                  <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', textTransform: 'capitalize' }}>{inv.status}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 8, background: C.midnight, borderRadius: 14, padding: '10px 16px', boxShadow: '0 8px 32px rgba(13,27,42,0.4)', whiteSpace: 'nowrap' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#FFF', margin: 0 }}>{selected.size} selected</p>
          <button onClick={() => setShowMarkPaid(true)} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: C.green, color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Mark Paid
          </button>
          <button onClick={() => setShowReminder(true)} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: 'none', background: C.amber, color: C.midnight, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Send Reminder
          </button>
          <button onClick={() => setSelected(new Set())} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={13} color="#FFF" />
          </button>
        </div>
      )}

      {/* Mark paid modal */}
      {showMarkPaid && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setShowMarkPaid(false)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.midnight, margin: '0 0 4px' }}>Mark as Paid</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: '0 0 20px' }}>
              Marking {selected.size} invoice{selected.size !== 1 ? 's' : ''} paid · <strong style={{ color: C.midnight }}>${fmt(selectedTotal)}</strong> total
            </p>
            <div style={{ background: '#F8FAFC', border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', marginBottom: 20, maxHeight: 120, overflowY: 'auto' }}>
              {selectedInvoices.map(inv => (
                <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <p style={{ fontSize: 12, color: C.midnight, margin: 0, fontFamily: 'monospace' }}>{inv.invoiceNumber}</p>
                  <p style={{ fontSize: 12, fontWeight: 600, color: C.midnight, margin: 0 }}>${fmt(inv.totalAmount)}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowMarkPaid(false)} style={{ flex: 1, height: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: C.muted }}>Cancel</button>
              <button onClick={handleMarkPaid} disabled={markingPaid} style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: C.green, color: '#FFF', fontSize: 14, fontWeight: 700, cursor: markingPaid ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, opacity: markingPaid ? 0.7 : 1 }}>
                {markingPaid ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Saving…</> : <><Check size={15} /> Confirm Paid</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder modal */}
      {showReminder && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setShowReminder(false)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 460, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.midnight, margin: '0 0 4px' }}>Send Reminders</h3>
            <p style={{ fontSize: 13, color: C.muted, margin: '0 0 16px' }}>{selected.size} invoice{selected.size !== 1 ? 's' : ''} selected</p>
            <div style={{ background: '#F8FAFC', border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px', marginBottom: 14, maxHeight: 180, overflowY: 'auto' }}>
              {selectedInvoices.map(inv => {
                const hasEmail = inv.billToContact?.includes('@')
                return (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.bg}` }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: C.midnight, margin: 0 }}>{inv.invoiceNumber} · {inv.billToName ?? '—'}</p>
                      <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>${fmt(inv.totalAmount)} · {inv.daysOverdue > 0 ? `${inv.daysOverdue}d overdue` : 'current'}</p>
                    </div>
                    {hasEmail && (
                      <a
                        href={`mailto:${inv.billToContact}?subject=Payment Reminder: ${inv.invoiceNumber}&body=${encodeURIComponent(`Hi,\n\nThis is a reminder that invoice ${inv.invoiceNumber} for $${fmt(inv.totalAmount)} is ${inv.daysOverdue > 0 ? `${inv.daysOverdue} days overdue` : 'due'}.\n\nPlease remit payment at your earliest convenience.\n\nThank you.`)}`}
                        style={{ height: 28, padding: '0 10px', borderRadius: 7, background: '#E0F7FC', color: '#0097B2', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none', flexShrink: 0 }}
                      >
                        <Mail size={11} /> Email
                      </a>
                    )}
                  </div>
                )
              })}
            </div>
            <p style={{ fontSize: 11, color: C.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
              Tip: click <strong>Email</strong> next to invoices with email contacts, or copy the summary below and paste into your email client.
            </p>
            <button onClick={copyReminder} style={{ width: '100%', height: 42, borderRadius: 10, border: `1px solid ${C.border}`, background: copied ? C.green : '#FFF', color: copied ? '#FFF' : C.midnight, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8, transition: 'background 200ms ease' }}>
              {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Summary</>}
            </button>
            <button onClick={() => setShowReminder(false)} style={{ width: '100%', height: 38, borderRadius: 10, border: `1px solid ${C.border}`, background: '#FFF', fontSize: 13, color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Revenue tab ───────────────────────────────────────────────────────────────

function RevenueTab({
  months, topCustomers, invoicedYtd, collectedYtd, loading,
}: {
  months: RevenueMonth[]
  topCustomers: TopCustomer[]
  invoicedYtd: number
  collectedYtd: number
  loading: boolean
}) {
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
      <Loader2 size={22} color={C.muted} style={{ animation: 'spin 0.8s linear infinite' }} />
    </div>
  )

  const maxVal = Math.max(...months.map(m => Math.max(m.invoiced, 1)), 1)
  const hasAnyRevenue = months.some(m => m.invoiced > 0)

  return (
    <div>
      {/* YTD summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
        <div style={{ background: C.midnight, borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>Invoiced YTD</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#FFFFFF', margin: 0 }}>${fmt(invoicedYtd)}</p>
        </div>
        <div style={{ background: '#E0F7FC', borderRadius: 14, padding: '16px 18px' }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#0097B2', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>Collected YTD</p>
          <p style={{ fontSize: 22, fontWeight: 800, color: '#005F73', margin: 0 }}>${fmt(collectedYtd)}</p>
          {invoicedYtd > 0 && (
            <p style={{ fontSize: 10, color: '#0097B2', margin: '3px 0 0' }}>{Math.round((collectedYtd / invoicedYtd) * 100)}% collection rate</p>
          )}
        </div>
      </div>

      {/* Bar chart */}
      <div style={{ background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 16px', marginBottom: 16 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 16px' }}>Monthly Revenue — Last 12 Months</p>
        {!hasAnyRevenue ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <TrendingUp size={28} color={C.border} style={{ display: 'block', margin: '0 auto 8px' }} />
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No invoice data yet.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100, marginBottom: 6 }}>
              {months.map(m => (
                <div key={m.month} style={{ flex: 1, display: 'flex', gap: 2, alignItems: 'flex-end', minWidth: 0 }}>
                  <div
                    title={`Invoiced: $${fmt(m.invoiced)}`}
                    style={{
                      flex: 1, borderRadius: '3px 3px 0 0', background: C.navy,
                      height: m.invoiced > 0 ? `${Math.max(4, (m.invoiced / maxVal) * 100)}%` : '2px',
                      minHeight: 2, transition: 'height 400ms ease',
                    }}
                  />
                  <div
                    title={`Collected: $${fmt(m.collected)}`}
                    style={{
                      flex: 1, borderRadius: '3px 3px 0 0', background: C.cyan,
                      height: m.collected > 0 ? `${Math.max(4, (m.collected / maxVal) * 100)}%` : '2px',
                      minHeight: 2, transition: 'height 400ms ease',
                    }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {months.map(m => (
                <div key={m.month} style={{ flex: 1, textAlign: 'center' }}>
                  <p style={{ fontSize: 8, color: C.muted, margin: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>{m.label}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: C.navy }} />
                <span style={{ fontSize: 11, color: C.muted }}>Invoiced</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: C.cyan }} />
                <span style={{ fontSize: 11, color: C.muted }}>Collected</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Top customers */}
      {topCustomers.length > 0 && (
        <div style={{ background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.bg}` }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Top Customers — Last 12 Months</p>
          </div>
          {topCustomers.map((c, i) => {
            const pct = c.totalInvoiced > 0 ? Math.round((c.totalPaid / c.totalInvoiced) * 100) : 0
            return (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderTop: i === 0 ? 'none' : `1px solid ${C.bg}` }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>{(c.name || '?')[0].toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: C.midnight, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                  <p style={{ fontSize: 11, color: C.muted, margin: '1px 0 0' }}>{c.invoiceCount} invoice{c.invoiceCount !== 1 ? 's' : ''} · {pct}% paid</p>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.midnight, margin: 0, flexShrink: 0 }}>${fmt(c.totalInvoiced)}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({
  companyId, userId, isDesktop,
}: {
  companyId: string; userId: string; isDesktop: boolean
}) {
  // ── Rate defaults ──────────────────────────────────────────────────────────
  const [defaultDailyRate, setDefaultDailyRate] = useState('')
  const [defaultMonthlyRate, setDefaultMonthlyRate] = useState('')
  const [defaultBillingType, setDefaultBillingType] = useState<BillingType>('daily')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Billing reminders ──────────────────────────────────────────────────────
  const [billingDay, setBillingDay] = useState<number | null>(null)
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [savingReminder, setSavingReminder] = useState(false)
  const [reminderSaved, setReminderSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    createClient()
      .from('companies')
      .select('default_daily_rate, default_monthly_rate, default_billing_type, billing_day_of_month')
      .eq('id', companyId)
      .single()
      .then(({ data }) => {
        if (data) {
          setDefaultDailyRate(data.default_daily_rate != null ? String(data.default_daily_rate) : '')
          setDefaultMonthlyRate(data.default_monthly_rate != null ? String(data.default_monthly_rate) : '')
          setDefaultBillingType((data.default_billing_type as BillingType) ?? 'daily')
          setBillingDay(data.billing_day_of_month ?? null)
        }
        setLoading(false)
      })
  }, [companyId])

  useEffect(() => {
    if (!userId) return
    import('@/lib/billing-notification-actions').then(m =>
      m.getBillingReminderPreference(userId).then(setReminderEnabled)
    )
  }, [userId])

  async function handleSave() {
    setSaving(true)
    const { error: err } = await saveLotBillingDefaultsAction(companyId, {
      default_daily_rate: defaultDailyRate ? parseFloat(defaultDailyRate) : null,
      default_monthly_rate: defaultMonthlyRate ? parseFloat(defaultMonthlyRate) : null,
      default_billing_type: defaultBillingType,
    })
    setSaving(false)
    if (err) { setError('Failed to save: ' + err); return }
    setSaved(true); setTimeout(() => setSaved(false), 2500)
  }

  async function handleSaveReminder() {
    setSavingReminder(true)
    const { saveBillingSchedule, saveBillingReminderPreference } = await import('@/lib/billing-notification-actions')
    await Promise.all([
      saveBillingSchedule(companyId, billingDay),
      saveBillingReminderPreference(userId, reminderEnabled),
    ])
    setSavingReminder(false)
    setReminderSaved(true)
    setTimeout(() => setReminderSaved(false), 2500)
  }

  function ordinal(n: number) {
    const s = ['th', 'st', 'nd', 'rd']
    const v = n % 100
    return n + (s[(v - 20) % 10] || s[v] || s[0])
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: '#4A5568',
    textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 6,
  }
  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, border: `1px solid ${C.border}`, borderRadius: 10,
    padding: '0 12px 0 32px', fontSize: 15, outline: 'none', fontFamily: 'inherit',
    background: '#FAFAFA', color: C.midnight, boxSizing: 'border-box',
  }

  return (
    <div>
      <div style={{ background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 16, padding: 20, position: 'relative' }}>
        <LoadingOverlay show={loading || saving} />
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Default Billing Type</label>
          <div style={{ display: 'flex', background: '#F0F4F8', borderRadius: 10, padding: 3 }}>
            {(['daily', 'monthly'] as BillingType[]).map(type => (
              <button key={type} onClick={() => setDefaultBillingType(type)} style={{
                flex: 1, height: 38, borderRadius: 8, border: 'none',
                background: defaultBillingType === type ? C.midnight : 'transparent',
                color: defaultBillingType === type ? '#FFF' : '#4A5568',
                fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                textTransform: 'capitalize', transition: 'background 150ms ease, color 150ms ease',
              }}>
                {type}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Default Daily Rate</label>
          <div style={{ position: 'relative' }}>
            <DollarSign size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
            <input type="number" min="0" step="0.01" placeholder="e.g. 25.00" value={defaultDailyRate} onChange={e => setDefaultDailyRate(e.target.value)} style={inputStyle} />
          </div>
          <p style={{ fontSize: 11, color: C.muted, margin: '5px 0 0' }}>Per vehicle, per day on lot</p>
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Default Monthly Rate</label>
          <div style={{ position: 'relative' }}>
            <DollarSign size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
            <input type="number" min="0" step="0.01" placeholder="e.g. 500.00" value={defaultMonthlyRate} onChange={e => setDefaultMonthlyRate(e.target.value)} style={inputStyle} />
          </div>
          <p style={{ fontSize: 11, color: C.muted, margin: '5px 0 0' }}>Per vehicle, per 30 days on lot</p>
        </div>
        <button onClick={handleSave} disabled={saving || loading} style={{
          width: '100%', height: 46, borderRadius: 12, border: 'none',
          background: saved ? C.green : C.midnight, color: '#FFF',
          fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: saving ? 0.7 : 1, transition: 'background 300ms ease',
        }}>
          {saved ? <><Check size={16} />Saved</> : saving ? 'Saving…' : 'Save Defaults'}
        </button>
        {error && <p style={{ fontSize: 13, color: C.red, margin: '10px 0 0', textAlign: 'center' }}>{error}</p>}
      </div>

      {/* ── Billing Reminders ─────────────────────────────────────────── */}
      <div style={{ marginTop: 16, background: '#FFF', border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(244,166,42,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 14 }}>🔔</span>
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: C.midnight, margin: 0 }}>Billing Reminders</p>
            <p style={{ fontSize: 11, color: C.muted, margin: 0 }}>Get an in-app alert when it's time to bill</p>
          </div>
        </div>

        {/* Day of month picker */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 8 }}>
            Bill on the ___ of each month
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {/* Off */}
            <button
              onClick={() => setBillingDay(null)}
              style={{
                width: 40, height: 34, borderRadius: 8, border: `1.5px solid ${billingDay === null ? C.midnight : C.border}`,
                background: billingDay === null ? C.midnight : '#FFF',
                color: billingDay === null ? '#FFF' : C.muted,
                fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >Off</button>
            {/* Days 1–28 */}
            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
              <button
                key={d}
                onClick={() => setBillingDay(d)}
                style={{
                  width: 34, height: 34, borderRadius: 8, border: `1.5px solid ${billingDay === d ? C.amber : C.border}`,
                  background: billingDay === d ? C.amber : '#FFF',
                  color: billingDay === d ? C.midnight : C.muted,
                  fontSize: 12, fontWeight: billingDay === d ? 800 : 500, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >{d}</button>
            ))}
          </div>
          {billingDay !== null && (
            <p style={{ fontSize: 11, color: C.muted, margin: '8px 0 0' }}>
              You'll see a reminder on the <strong>{ordinal(billingDay)}</strong> of each month.
            </p>
          )}
        </div>

        {/* Email myself toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: C.bg, borderRadius: 10, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.midnight, margin: 0 }}>Show in-app notification</p>
            <p style={{ fontSize: 11, color: C.muted, margin: '2px 0 0' }}>Banner on the billing dashboard with a mailto link to email yourself a summary</p>
          </div>
          <button
            onClick={() => setReminderEnabled(!reminderEnabled)}
            style={{
              width: 40, height: 22, borderRadius: 11, border: 'none', padding: 2,
              background: reminderEnabled ? C.cyan : C.border, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: reminderEnabled ? 'flex-end' : 'flex-start',
              transition: 'background 200ms ease', flexShrink: 0, marginLeft: 16,
            }}
          >
            <div style={{ width: 18, height: 18, borderRadius: 9, background: '#FFF', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>

        <button
          onClick={handleSaveReminder}
          disabled={savingReminder}
          style={{
            width: '100%', height: 44, borderRadius: 12, border: 'none',
            background: reminderSaved ? C.green : C.navy, color: '#FFF',
            fontSize: 14, fontWeight: 700, cursor: savingReminder ? 'default' : 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: savingReminder ? 0.7 : 1, transition: 'background 300ms ease',
          }}
        >
          {reminderSaved ? <><Check size={15} /> Saved</> : savingReminder ? 'Saving…' : 'Save Reminder Settings'}
        </button>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function LotBillingPage() {
  const { effectiveCompany, user } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const router = useRouter()
  const companyId = effectiveCompany?.id ?? ''

  const [activeTab, setActiveTab] = useState<Tab>('unbilled')
  const [showExport, setShowExport] = useState(false)
  const [notifications, setNotifications] = useState<BillingNotification[]>([])
  const [notificationsLoaded, setNotificationsLoaded] = useState(false)

  const [kpis, setKpis] = useState<BillingKPIs | null>(null)
  const [kpisLoading, setKpisLoading] = useState(true)

  const [vehicleRows, setVehicleRows] = useState<VehicleBillingRow[]>([])
  const [vehicleRowsLoading, setVehicleRowsLoading] = useState(true)

  const [outstanding, setOutstanding] = useState<OutstandingInvoice[]>([])
  const [outstandingLoading, setOutstandingLoading] = useState(false)
  const [outstandingLoaded, setOutstandingLoaded] = useState(false)

  const [revenueData, setRevenueData] = useState<{ months: RevenueMonth[]; topCustomers: TopCustomer[]; invoicedYtd: number; collectedYtd: number } | null>(null)
  const [revenueLoading, setRevenueLoading] = useState(false)
  const [revenueLoaded, setRevenueLoaded] = useState(false)

  // Load KPIs + unbilled + notifications on mount
  useEffect(() => {
    if (!companyId) return
    setKpisLoading(true)
    setVehicleRowsLoading(true)
    Promise.all([
      getBillingKPIs(companyId),
      getVehicleBillingRows(companyId),
      getUnreadBillingNotifications(companyId),
    ]).then(([k, rows, notifs]) => {
      setKpis(k)
      setVehicleRows(rows)
      setNotifications(notifs)
      setNotificationsLoaded(true)
    }).finally(() => {
      setKpisLoading(false)
      setVehicleRowsLoading(false)
    })
  }, [companyId])

  // Lazy-load outstanding tab
  useEffect(() => {
    if (activeTab !== 'outstanding' || outstandingLoaded || !companyId) return
    setOutstandingLoading(true)
    getOutstandingInvoices(companyId)
      .then(data => { setOutstanding(data); setOutstandingLoaded(true) })
      .finally(() => setOutstandingLoading(false))
  }, [activeTab, outstandingLoaded, companyId])

  // Lazy-load revenue tab
  useEffect(() => {
    if (activeTab !== 'revenue' || revenueLoaded || !companyId) return
    setRevenueLoading(true)
    getRevenueData(companyId)
      .then(data => { setRevenueData(data); setRevenueLoaded(true) })
      .finally(() => setRevenueLoading(false))
  }, [activeTab, revenueLoaded, companyId])

  function refreshOutstanding() {
    setOutstandingLoaded(false)
    setKpisLoading(true)
    getBillingKPIs(companyId).then(setKpis).finally(() => setKpisLoading(false))
  }

  function handleRefreshAll() {
    setKpisLoading(true); setVehicleRowsLoading(true)
    setOutstandingLoaded(false); setRevenueLoaded(false)
    Promise.all([
      getBillingKPIs(companyId),
      getVehicleBillingRows(companyId),
    ]).then(([k, rows]) => { setKpis(k); setVehicleRows(rows) })
      .finally(() => { setKpisLoading(false); setVehicleRowsLoading(false) })
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.muted,
    textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px',
  }

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        padding: isDesktop ? '24px 28px' : '16px',
        paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))',
        maxWidth: 800, margin: '0 auto',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: isDesktop ? 22 : 20, fontWeight: 900, color: C.midnight, margin: '0 0 3px' }}>Lot Billing</h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Track unbilled units, outstanding invoices, and revenue</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowExport(true)}
              style={{ height: 36, padding: '0 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: '#FFF', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.midnight, fontFamily: 'inherit' }}
            >
              <Download size={14} color={C.midnight} /> Export
            </button>
            <button onClick={handleRefreshAll} disabled={kpisLoading} style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${C.border}`, background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: kpisLoading ? 'default' : 'pointer' }}>
              <RefreshCw size={15} color={C.muted} style={kpisLoading ? { animation: 'spin 0.8s linear infinite' } : undefined} />
            </button>
          </div>
        </div>

        {/* Billing reminder banner */}
        {notificationsLoaded && notifications.length > 0 && (
          <BillingReminderBanner
            notification={notifications[0]}
            userEmail={user?.email ?? null}
            appUrl={typeof window !== 'undefined' ? window.location.origin : ''}
            onDismiss={() => setNotifications(prev => prev.slice(1))}
            onReview={() => {
              setActiveTab('unbilled')
              setNotifications(prev => prev.slice(1))
            }}
          />
        )}

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
          <KPICard
            label="Outstanding"
            value={kpis ? `$${fmt(kpis.outstandingBalance)}` : '—'}
            sub={kpis ? `${kpis.overdueCount} overdue` : undefined}
            accent={kpis && kpis.overdueCount > 0 ? C.red : undefined}
            loading={kpisLoading}
          />
          <KPICard
            label="Collected This Month"
            value={kpis ? `$${fmt(kpis.collectedThisMonth)}` : '—'}
            accent={C.green}
            loading={kpisLoading}
          />
          <KPICard
            label="Overdue Invoices"
            value={kpis ? String(kpis.overdueCount) : '—'}
            sub={kpis && kpis.overdueCount > 0 ? 'Need follow-up' : 'All current'}
            accent={kpis && kpis.overdueCount > 0 ? C.red : C.green}
            loading={kpisLoading}
          />
          <KPICard
            label="Vehicles On Lot"
            value={kpis ? String(kpis.vehiclesOnLot) : '—'}
            sub={kpis && kpis.unbilledCount > 0 ? `${kpis.unbilledCount} never billed` : 'All billed'}
            accent={kpis && kpis.unbilledCount > 0 ? C.amber : undefined}
            loading={kpisLoading}
          />
        </div>

        {/* Tab nav */}
        <TabNav active={activeTab} onChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === 'unbilled' && (
          <UnbilledTab
            rows={vehicleRows}
            loading={vehicleRowsLoading}
            onNavigate={id => router.push(`/inventory/${id}`)}
          />
        )}

        {activeTab === 'outstanding' && (
          <OutstandingTab
            invoices={outstanding}
            loading={outstandingLoading}
            companyId={companyId}
            onRefresh={refreshOutstanding}
          />
        )}

        {activeTab === 'revenue' && (
          <RevenueTab
            months={revenueData?.months ?? []}
            topCustomers={revenueData?.topCustomers ?? []}
            invoicedYtd={revenueData?.invoicedYtd ?? 0}
            collectedYtd={revenueData?.collectedYtd ?? 0}
            loading={revenueLoading}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab companyId={companyId} userId={user?.id ?? ''} isDesktop={isDesktop} />
        )}

        <BottomNav />
      </div>

      {showExport && (
        <ExportCsvModal
          companyId={companyId}
          onClose={() => setShowExport(false)}
        />
      )}
    </>
  )
}

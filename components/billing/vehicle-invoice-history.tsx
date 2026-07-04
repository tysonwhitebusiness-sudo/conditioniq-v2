'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ChevronRight, Users } from 'lucide-react'
import { getVehicleInvoiceHistory, type VehicleInvoiceRow } from '@/lib/vehicle-invoice-actions'
import { updateInvoiceGroupStatus, type InvoiceGroupStatus } from '@/lib/invoice-group-actions'
import { INVOICE_STATUS_LABELS } from '@/lib/invoice-utils'

const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  draft:   { bg: '#F0F4F8', color: '#4A5568',  label: 'Draft'   },
  sent:    { bg: '#E0F7FC', color: '#0097B2',  label: 'Sent'    },
  paid:    { bg: '#D1FAE5', color: '#065F46',  label: 'Paid'    },
  overdue: { bg: '#FEE2E2', color: '#DC2626',  label: 'Overdue' },
  void:    { bg: '#F3F4F6', color: '#9CA3AF',  label: 'Void'    },
}

function fmtDate(raw: string) {
  // Accept both "2026-06-18" and "June 19, 2026"
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw + 'T00:00:00' : raw
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? raw
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtAmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatusControl({ row, onChanged }: { row: VehicleInvoiceRow; onChanged: (status: string) => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const s = STATUS_STYLE[row.status] ?? STATUS_STYLE.draft

  if (!row.groupId) {
    return (
      <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 5px', background: s.bg, color: s.color, display: 'inline-block', marginTop: 2 }}>
        {s.label.toUpperCase()}
      </span>
    )
  }

  if (!open) {
    return (
      <span
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        style={{ fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '1px 5px', background: s.bg, color: s.color, display: 'inline-block', marginTop: 2, cursor: 'pointer' }}
      >
        {saving ? '…' : s.label.toUpperCase()}
      </span>
    )
  }

  return (
    <select
      autoFocus
      value={row.status}
      onClick={e => e.stopPropagation()}
      onBlur={() => setOpen(false)}
      onChange={async e => {
        e.stopPropagation()
        const next = e.target.value as InvoiceGroupStatus
        setSaving(true)
        try {
          await updateInvoiceGroupStatus(row.groupId as string, next)
          onChanged(next)
        } finally {
          setSaving(false)
          setOpen(false)
        }
      }}
      style={{ fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 4px', background: s.bg, color: s.color, border: 'none', outline: 'none', marginTop: 2, cursor: 'pointer' }}
    >
      {Object.entries(INVOICE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  )
}

interface Props {
  vehicleId: string
  vin: string
  companyId: string
}

export default function VehicleInvoiceHistory({ vehicleId, vin, companyId }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<VehicleInvoiceRow[]>([])
  const [billedThisMonth, setBilledThisMonth] = useState(false)
  const [monthLabel, setMonthLabel] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!vehicleId && !vin) return
    setLoading(true)
    getVehicleInvoiceHistory(vehicleId, vin, companyId).then(result => {
      setRows(result.rows)
      setBilledThisMonth(result.billedThisMonth)
      setMonthLabel(result.currentMonthLabel)
      setLoading(false)
    })
  }, [vehicleId, vin, companyId])

  function handleRowClick(row: VehicleInvoiceRow) {
    if (row.groupId) {
      router.push(`/lot-billing/${row.groupId}`)
    } else {
      router.push('/lot-billing')
    }
  }

  const statusBadge = billedThisMonth
    ? { bg: '#D1FAE5', color: '#065F46', text: `Billed for ${monthLabel}` }
    : { bg: '#FEF3C7', color: '#92400E', text: `Not yet billed for ${monthLabel}` }

  return (
    <div>
      {/* Section header + billing status badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
          Invoice History
        </p>
        {!loading && (
          <span style={{
            fontSize: 11, fontWeight: 700, borderRadius: 20,
            padding: '3px 10px', background: statusBadge.bg, color: statusBadge.color,
          }}>
            {statusBadge.text}
          </span>
        )}
      </div>

      {/* Invoice list */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 0' }}>
            <Loader2 size={16} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: '16px 16px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No invoices on record for this vehicle.</p>
          </div>
        ) : (
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {rows.map((row, i) => {
              return (
                <div
                  key={row.id}
                  onClick={() => handleRowClick(row)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px',
                    borderTop: i === 0 ? 'none' : '1px solid #F0F4F8',
                    cursor: 'pointer', transition: 'background 100ms',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Invoice number + consolidated chip */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', fontFamily: 'monospace' }}>
                        {row.invoiceNumber}
                      </span>
                      {row.isConsolidated && (
                        <span title="This invoice covers multiple vehicles" style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontSize: 9, fontWeight: 700, color: '#0097B2',
                          background: '#E0F7FC', borderRadius: 4, padding: '1px 5px',
                        }}>
                          <Users size={9} />FLEET
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                      {fmtDate(row.invoiceDate)}{row.billToName ? ` · ${row.billToName}` : ''}
                    </p>
                  </div>

                  {/* Amount + status */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>
                      ${fmtAmt(row.totalAmount)}
                    </p>
                    <StatusControl
                      row={row}
                      onChanged={next => setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: next } : r))}
                    />
                  </div>

                  <ChevronRight size={13} color="#CBD5E1" style={{ flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

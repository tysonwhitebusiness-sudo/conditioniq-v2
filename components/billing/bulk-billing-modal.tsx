'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, AlertTriangle, ChevronRight, ChevronLeft, Loader2, Download, Mail, ExternalLink, Check } from 'lucide-react'
import { calculateBulkBilling, type BulkVehicleRow } from '@/lib/lot-actions'
import { getNextBulkInvoiceNumber } from '@/lib/bulk-invoice-actions'
import { generateAndSaveBulkInvoice } from '@/lib/bulk-invoice-generator'
import { createClient } from '@/lib/supabase/client'
import { getCustomers, type Customer } from '@/lib/customer-actions'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BulkVehicle {
  id: string
  vin: string
  year: number | null
  make: string | null
  model: string | null
  arrived_at: string | null
  released_at: string | null
  billing_type: string | null
  daily_rate: number | null
  monthly_rate: number | null
  sub_client_name: string | null
  _status: string
}

interface CompanyDefaults {
  default_billing_type: string | null
  default_daily_rate: number | null
  default_monthly_rate: number | null
}

interface BulkBillingModalProps {
  companyId: string
  companyName: string
  userId: string | null
  vehicles: BulkVehicle[]
  onClose: () => void
  onSuccess: () => void
}

type ModalStep = 1 | 2 | 3 | 4 | 5 | 'success'

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function monthStartStr() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function vehicleLabel(r: { year: number | null; make: string | null; model: string | null; vin: string }) {
  return [r.year, r.make, r.model].filter(Boolean).join(' ') || r.vin
}

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  pending_arrival: { label: 'PENDING', bg: '#F0F4F8', color: '#4A5568' },
  on_lot:         { label: 'ON LOT', bg: '#E0F7FC', color: '#0097B2' },
  releasing:      { label: 'RELEASING', bg: '#FEF3C7', color: '#92400E' },
  released:       { label: 'RELEASED', bg: '#D1FAE5', color: '#065F46' },
  one_off:        { label: 'ONE-OFF', bg: '#F0F4F8', color: '#4A5568' },
}

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepDots({ step }: { step: ModalStep }) {
  const current = step === 'success' ? 5 : (step as number)
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <div key={n} style={{
          width: n === current ? 20 : 8, height: 8, borderRadius: 4,
          background: n < current ? '#10B981' : n === current ? '#00B4D8' : '#E1E8F0',
          transition: 'all 200ms ease',
        }} />
      ))}
    </div>
  )
}

// ── Main Modal ─────────────────────────────────────────────────────────────────

export default function BulkBillingModal({
  companyId, companyName, userId, vehicles, onClose, onSuccess,
}: BulkBillingModalProps) {
  const [step, setStep] = useState<ModalStep>(1)

  // Step 1: vehicle selection
  const [deselected, setDeselected] = useState<Set<string>>(new Set())

  // Step 2: date range
  const [rangeStart, setRangeStart] = useState(monthStartStr())
  const [rangeEnd, setRangeEnd] = useState(todayStr())

  // Step 3: resolved rows + warning ack
  const [rows, setRows] = useState<BulkVehicleRow[]>([])
  const [userExcluded, setUserExcluded] = useState<Set<string>>(new Set())
  const [warningAcked, setWarningAcked] = useState(false)
  const [company, setCompany] = useState<CompanyDefaults | null>(null)

  // Step 4: rate overrides (vehicleId -> rate)
  const [rateOverrides, setRateOverrides] = useState<Record<string, string>>({})

  // Step 5: bill to
  const [billToName, setBillToName] = useState('')
  const [billToContact, setBillToContact] = useState('')
  const [billToNotes, setBillToNotes] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(todayStr())
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [customers, setCustomers] = useState<Customer[]>([])

  // Generation
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [successData, setSuccessData] = useState<{ invoiceNumber: string; totalAmount: number; pdfBlob: Blob | null; signedUrl: string | null } | null>(null)

  // Fetch company billing defaults on mount
  useEffect(() => {
    createClient()
      .from('companies')
      .select('default_billing_type, default_daily_rate, default_monthly_rate')
      .eq('id', companyId)
      .single()
      .then(({ data }) => setCompany(data ?? { default_billing_type: null, default_daily_rate: null, default_monthly_rate: null }))
  }, [companyId])

  // Fetch customers for step 5
  useEffect(() => {
    getCustomers(companyId).then(setCustomers).catch(() => {})
  }, [companyId])

  // ── Derived ──────────────────────────────────────────────────────────────────

  const activeVehicles = useMemo(
    () => vehicles.filter(v => !deselected.has(v.id)),
    [vehicles, deselected],
  )

  // Recalculate rows whenever range / active vehicles / company changes (for step 3+)
  const computedRows = useMemo(() => {
    if (!company) return []
    return calculateBulkBilling(activeVehicles, rangeStart, rangeEnd, company)
  }, [activeVehicles, rangeStart, rangeEnd, company])

  // After entering step 3, lock in computed rows
  useEffect(() => {
    if (step === 3) {
      setRows(computedRows)
      setUserExcluded(new Set(computedRows.filter(r => r.excluded).map(r => r.vehicleId)))
      setWarningAcked(false)
    }
  }, [step]) // only run when step changes to 3

  const finalRows = useMemo(
    () => rows.filter(r => !userExcluded.has(r.vehicleId)),
    [rows, userExcluded],
  )

  const rateResolvedRows = useMemo(() => finalRows.map(r => {
    const override = rateOverrides[r.vehicleId]
    const rate = override !== undefined ? parseFloat(override) : r.rate
    let subtotal: number | null = null
    if (rate !== null && !isNaN(rate)) {
      subtotal = r.billingType === 'daily' ? r.days * rate : (r.days / 30) * rate
    }
    return { ...r, rate: (rate !== null && !isNaN(rate)) ? rate : r.rate, subtotal }
  }), [finalRows, rateOverrides])

  const grandTotal = useMemo(
    () => rateResolvedRows.reduce((s, r) => s + (r.subtotal ?? 0), 0),
    [rateResolvedRows],
  )

  const hasUnackedWarnings = useMemo(
    () => rows.some(r => r.warning === 'arrived_late' && !userExcluded.has(r.vehicleId)),
    [rows, userExcluded],
  )

  const hasMissingRate = useMemo(
    () => rateResolvedRows.some(r => r.rate === null || isNaN(r.rate as number)),
    [rateResolvedRows],
  )

  // Derive shared sub-client across active vehicles for Bill To auto-population
  const subClientInfo = useMemo(() => {
    const names = activeVehicles.map(v => v.sub_client_name).filter((n): n is string => !!n)
    if (names.length === 0) return { value: '', hint: '' }
    const unique = new Set(names)
    if (unique.size === 1) return { value: names[0], hint: '' }
    return { value: '', hint: 'Multiple clients selected — enter a Bill To name manually.' }
  }, [activeVehicles])

  // Auto-populate Bill To Name when entering step 5 (only if not already set by user)
  useEffect(() => {
    if (step === 5) setBillToName(prev => prev || subClientInfo.value)
  }, [step, subClientInfo.value])

  function handleCustomerSelect(customerId: string) {
    setSelectedCustomerId(customerId)
    const customer = customers.find(c => c.id === customerId)
    if (customer) {
      setBillToName(customer.name)
      setBillToContact(customer.email ?? customer.phone ?? '')
    } else {
      // "none" selected — clear only if the name matches a customer
      if (customers.some(c => c.name === billToName)) setBillToName('')
      setBillToContact('')
    }
  }

  // ── Navigation guards ──────────────────────────────────────────────────────

  function canAdvance() {
    if (step === 1) return activeVehicles.length > 0
    if (step === 2) return rangeStart <= rangeEnd
    if (step === 3) return !hasUnackedWarnings || warningAcked
    if (step === 4) return !hasMissingRate && rateResolvedRows.length > 0
    if (step === 5) return billToName.trim().length > 0
    return false
  }

  function advance() {
    if (!canAdvance()) return
    if (step === 5) { handleGenerate(); return }
    setStep((s) => {
      const next = (s as number) + 1
      return next as ModalStep
    })
  }

  function back() {
    setStep((s) => {
      const prev = Math.max(1, (s as number) - 1)
      return prev as ModalStep
    })
  }

  // ── PDF generation ─────────────────────────────────────────────────────────

  async function handleGenerate() {
    if (!canAdvance() || generating) return
    setGenerating(true)
    setGenError('')
    try {
      const invoiceNumber = await getNextBulkInvoiceNumber(companyId)
      const pdfRows = rateResolvedRows.map(r => ({
        vehicleId: r.vehicleId,
        vin: r.vin,
        vehicleDescription: vehicleLabel(r) !== r.vin ? vehicleLabel(r) : null,
        effectiveStart: r.effectiveStart,
        effectiveEnd: r.effectiveEnd,
        days: r.days,
        rate: r.rate as number,
        billingType: r.billingType,
        subtotal: r.subtotal as number,
      }))

      const result = await generateAndSaveBulkInvoice({
        companyId,
        companyName,
        invoiceNumber,
        invoiceDate,
        billToName: billToName.trim(),
        billToContact: billToContact.trim() || null,
        notes: billToNotes.trim() || null,
        userId,
        rows: pdfRows,
        totalAmount: grandTotal,
        customerId: selectedCustomerId || null,
      })

      if (result.error) { setGenError(result.error); return }

      setSuccessData({
        invoiceNumber: result.invoiceNumber,
        totalAmount: grandTotal,
        pdfBlob: result.pdfBlob,
        signedUrl: result.signedUrl,
      })
      setStep('success')
      onSuccess()
    } catch (e: any) {
      setGenError(e?.message ?? 'Failed to generate invoice')
    } finally {
      setGenerating(false)
    }
  }

  function downloadPdf() {
    if (!successData?.pdfBlob) return
    const url = URL.createObjectURL(successData.pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${successData.invoiceNumber}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const stepTitle: Record<string, string> = {
    1: 'Review Vehicles',
    2: 'Billing Period',
    3: 'Date Resolution',
    4: 'Rates & Totals',
    5: 'Bill To & Review',
    success: 'Invoice Generated',
  }

  const btnLabel = step === 5 ? (generating ? 'Generating…' : 'Generate Invoice') : 'Continue'

  // ── Layout ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 16 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ background: '#FFFFFF', borderRadius: 18, width: '100%', maxWidth: 680, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #E1E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: '#0D1B2A', margin: '0 0 6px' }}>
              {stepTitle[String(step)]}
            </h2>
            {step !== 'success' && <StepDots step={step} />}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E1E8F0', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16} color="#94A3B8" />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── STEP 1: Vehicle review ───────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <p style={{ fontSize: 13, color: '#4A5568', margin: '0 0 14px' }}>
                {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} selected. Uncheck any to exclude from this invoice.
              </p>
              <div style={{ border: '1px solid #E1E8F0', borderRadius: 12, overflow: 'hidden' }}>
                {vehicles.map((v, i) => {
                  const checked = !deselected.has(v.id)
                  const sc = STATUS_CFG[v._status] ?? STATUS_CFG.on_lot
                  return (
                    <div key={v.id} onClick={() => setDeselected(prev => {
                      const next = new Set<string>(Array.from(prev))
                      if (next.has(v.id)) next.delete(v.id); else next.add(v.id)
                      return next
                    })} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid #F0F4F8', cursor: 'pointer', background: checked ? '#FFFFFF' : '#F8FAFC', opacity: checked ? 1 : 0.55 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${checked ? '#10B981' : '#CBD5E1'}`, background: checked ? '#10B981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {checked && <Check size={12} color="#FFF" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>{vehicleLabel(v)}</p>
                        <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0', fontFamily: 'monospace' }}>{v.vin}</p>
                      </div>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>{sc.label}</span>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>In: {fmtDate(v.arrived_at)}</p>
                        <p style={{ fontSize: 11, color: v.released_at ? '#10B981' : '#94A3B8', margin: '2px 0 0' }}>{v.released_at ? fmtDate(v.released_at) : 'Still on lot'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {activeVehicles.length === 0 && (
                <p style={{ fontSize: 13, color: '#EF4444', textAlign: 'center', marginTop: 12 }}>Select at least one vehicle to continue.</p>
              )}
            </div>
          )}

          {/* ── STEP 2: Date range ──────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <p style={{ fontSize: 13, color: '#4A5568', margin: '0 0 20px' }}>
                Choose the billing period. Dates will be clipped to each vehicle's actual arrival and release.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Start Date</label>
                  <input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)}
                    style={{ width: '100%', height: 42, border: '1.5px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#FAFAFA' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6 }}>End Date</label>
                  <input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)}
                    style={{ width: '100%', height: 42, border: '1.5px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', background: '#FAFAFA' }} />
                </div>
              </div>
              {rangeStart > rangeEnd && (
                <p style={{ fontSize: 13, color: '#EF4444', marginTop: 10 }}>End date must be after start date.</p>
              )}
            </div>
          )}

          {/* ── STEP 3: Date resolution ─────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <p style={{ fontSize: 13, color: '#4A5568', margin: '0 0 14px' }}>
                Dates are clipped to each vehicle's actual on-lot period. Review and manually exclude if needed.
              </p>
              <div style={{ border: '1px solid #E1E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                {rows.map((r, i) => {
                  const isUserExcluded = userExcluded.has(r.vehicleId)
                  const isAutoExcluded = r.excluded && !isUserExcluded
                  let rowBg = '#FFFFFF'
                  let leftBorder = 'transparent'
                  if (isAutoExcluded || (r.excluded && isUserExcluded)) { rowBg = '#FFF5F5'; leftBorder = '#EF4444' }
                  else if (isUserExcluded) { rowBg = '#F8FAFC'; leftBorder = '#94A3B8' }
                  else if (r.warning === 'arrived_late') { rowBg = '#FFFBEB'; leftBorder = '#F59E0B' }
                  else if (r.note === 'released_early') { rowBg = '#F8FAFC'; leftBorder = '#94A3B8' }
                  else { rowBg = '#FFFFFF'; leftBorder = '#10B981' }

                  return (
                    <div key={r.vehicleId} style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F4F8', background: rowBg, borderLeft: `3px solid ${leftBorder}`, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>{vehicleLabel(r)}</p>
                          <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#94A3B8' }}>{r.vin}</span>
                          {r.excluded && !isUserExcluded && (
                            <span style={{ fontSize: 10, fontWeight: 700, background: '#FEE2E2', color: '#DC2626', borderRadius: 4, padding: '1px 6px' }}>AUTO-EXCLUDED</span>
                          )}
                          {isUserExcluded && (
                            <span style={{ fontSize: 10, fontWeight: 700, background: '#F0F4F8', color: '#4A5568', borderRadius: 4, padding: '1px 6px' }}>EXCLUDED</span>
                          )}
                        </div>
                        {!r.excluded && !isUserExcluded && (
                          <p style={{ fontSize: 12, color: '#4A5568', margin: '4px 0 0' }}>
                            {r.effectiveStart} → {r.effectiveEnd} · <strong>{r.days} days</strong>
                          </p>
                        )}
                        {r.warning === 'arrived_late' && !isUserExcluded && (
                          <p style={{ fontSize: 11, color: '#92400E', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={11} /> Arrived {fmtDate(r.arrivedAt)} — after billing period start
                          </p>
                        )}
                        {r.note === 'released_early' && !isUserExcluded && (
                          <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0', fontStyle: 'italic' }}>
                            Released {fmtDate(r.releasedAt)} — before billing period end
                          </p>
                        )}
                        {r.excluded && !isUserExcluded && (
                          <p style={{ fontSize: 11, color: '#DC2626', margin: '4px 0 0' }}>
                            Not on lot during {rangeStart} → {rangeEnd}
                          </p>
                        )}
                      </div>
                      {!r.excluded && (
                        <button onClick={() => setUserExcluded(prev => {
                          const next = new Set<string>(Array.from(prev))
                          if (next.has(r.vehicleId)) next.delete(r.vehicleId); else next.add(r.vehicleId)
                          return next
                        })} style={{ height: 26, padding: '0 10px', borderRadius: 6, border: `1px solid ${isUserExcluded ? '#10B981' : '#E1E8F0'}`, background: isUserExcluded ? '#D1FAE5' : '#F8FAFC', color: isUserExcluded ? '#065F46' : '#94A3B8', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
                          {isUserExcluded ? 'Include' : 'Exclude'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {hasUnackedWarnings && (
                <div onClick={() => setWarningAcked(v => !v)}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 14px', background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 10, cursor: 'pointer' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${warningAcked ? '#F59E0B' : '#CBD5E1'}`, background: warningAcked ? '#F59E0B' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    {warningAcked && <Check size={12} color="#FFF" />}
                  </div>
                  <p style={{ fontSize: 13, color: '#92400E', margin: 0, lineHeight: 1.5 }}>
                    I understand that some vehicles arrived after the billing period start. Their billing begins from their arrival date.
                  </p>
                </div>
              )}

              {finalRows.length === 0 && (
                <p style={{ fontSize: 13, color: '#EF4444', textAlign: 'center', marginTop: 12 }}>All vehicles excluded. Go back and adjust the date range.</p>
              )}
            </div>
          )}

          {/* ── STEP 4: Rates ───────────────────────────────────────────────── */}
          {step === 4 && (
            <div>
              <p style={{ fontSize: 13, color: '#4A5568', margin: '0 0 14px' }}>
                Confirm rates per vehicle. Override any individual rate as needed.
              </p>
              <div style={{ border: '1px solid #E1E8F0', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
                {rateResolvedRows.map((r, i) => {
                  const noRate = r.rate === null || isNaN(r.rate as number)
                  const overrideVal = rateOverrides[r.vehicleId] ?? ''
                  const typeLabel = r.billingType === 'daily' ? '/day' : '/mo'
                  return (
                    <div key={r.vehicleId} style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F4F8', padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>{vehicleLabel(r)}</p>
                        <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                          {r.days} days · {r.billingType}
                        </p>
                        {noRate && (
                          <p style={{ fontSize: 11, color: '#EF4444', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={11} /> No rate set — enter a rate to include
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <span style={{ fontSize: 13, color: '#94A3B8' }}>$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder={noRate ? 'Enter rate' : String(r.rate?.toFixed(2) ?? '')}
                          value={overrideVal}
                          onChange={e => setRateOverrides(prev => ({ ...prev, [r.vehicleId]: e.target.value }))}
                          style={{ width: 90, height: 34, border: `1.5px solid ${noRate && !overrideVal ? '#EF4444' : '#E1E8F0'}`, borderRadius: 8, padding: '0 8px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', boxSizing: 'border-box' }}
                        />
                        <span style={{ fontSize: 12, color: '#94A3B8', width: 26 }}>{typeLabel}</span>
                      </div>
                      <div style={{ width: 80, textAlign: 'right', flexShrink: 0 }}>
                        {r.subtotal !== null
                          ? <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>${r.subtotal.toFixed(2)}</p>
                          : <p style={{ fontSize: 12, color: '#CBD5E1', margin: 0 }}>—</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E1E8F0' }}>
                <span style={{ fontSize: 13, color: '#94A3B8', marginRight: 16 }}>Grand Total</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#0D1B2A' }}>${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* ── STEP 5: Bill To + Preview ────────────────────────────────────── */}
          {step === 5 && (
            <div>
              {/* Bill To fields */}
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Bill To</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {customers.length > 0 && (
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Customer (optional)</label>
                      <select
                        value={selectedCustomerId}
                        onChange={e => handleCustomerSelect(e.target.value)}
                        style={{ width: '100%', height: 40, border: '1.5px solid #E1E8F0', borderRadius: 9, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', cursor: 'pointer', boxSizing: 'border-box' }}
                      >
                        <option value="">— Select a customer —</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Name <span style={{ color: '#EF4444' }}>*</span></label>
                    <input value={billToName} onChange={e => setBillToName(e.target.value)} placeholder="Company or person name"
                      style={{ width: '100%', height: 40, border: `1.5px solid ${!billToName.trim() ? '#FCA5A5' : '#E1E8F0'}`, borderRadius: 9, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    {subClientInfo.hint && (
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0', fontStyle: 'italic' }}>{subClientInfo.hint}</p>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Contact (optional)</label>
                    <input value={billToContact} onChange={e => setBillToContact(e.target.value)} placeholder="Email or phone"
                      style={{ width: '100%', height: 40, border: '1.5px solid #E1E8F0', borderRadius: 9, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Invoice Date</label>
                      <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)}
                        style={{ width: '100%', height: 40, border: '1.5px solid #E1E8F0', borderRadius: 9, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Notes (optional)</label>
                      <input value={billToNotes} onChange={e => setBillToNotes(e.target.value)} placeholder="Any invoice notes"
                        style={{ width: '100%', height: 40, border: '1.5px solid #E1E8F0', borderRadius: 9, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Preview table */}
              <h3 style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Invoice Preview</h3>
              <div style={{ border: '1px solid #E1E8F0', borderRadius: 10, overflow: 'hidden', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['VIN', 'Vehicle', 'Period', 'Days', 'Rate', 'Type', 'Subtotal'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E1E8F0', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rateResolvedRows.map((r, i) => (
                      <tr key={r.vehicleId} style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F4F8' }}>
                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11, color: '#4A5568' }}>{r.vin.slice(-8)}</td>
                        <td style={{ padding: '8px 10px', color: '#0D1B2A', fontWeight: 500 }}>{vehicleLabel(r)}</td>
                        <td style={{ padding: '8px 10px', color: '#4A5568', whiteSpace: 'nowrap' }}>{r.effectiveStart.slice(5)} → {r.effectiveEnd.slice(5)}</td>
                        <td style={{ padding: '8px 10px', color: '#4A5568' }}>{r.days}</td>
                        <td style={{ padding: '8px 10px', color: '#4A5568' }}>${(r.rate as number).toFixed(2)}</td>
                        <td style={{ padding: '8px 10px', color: '#4A5568' }}>{r.billingType}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0D1B2A' }}>${(r.subtotal ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#0D1B2A', borderRadius: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>Total Due</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#00B4D8' }}>${grandTotal.toFixed(2)}</span>
              </div>

              {genError && (
                <p style={{ fontSize: 13, color: '#EF4444', marginTop: 12, textAlign: 'center' }}>{genError}</p>
              )}
            </div>
          )}

          {/* ── SUCCESS ──────────────────────────────────────────────────────── */}
          {step === 'success' && successData && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 72, height: 72, borderRadius: 36, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0D1B2A', margin: '0 0 6px' }}>Invoice Generated</h3>
              <p style={{ fontSize: 14, color: '#94A3B8', margin: '0 0 6px' }}>{successData.invoiceNumber}</p>
              <p style={{ fontSize: 22, fontWeight: 800, color: '#0D1B2A', margin: '0 0 24px' }}>${successData.totalAmount.toFixed(2)}</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                {successData.signedUrl && (
                  <button onClick={() => window.open(successData.signedUrl!, '_blank')}
                    style={{ height: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
                    <ExternalLink size={15} /> Open PDF
                  </button>
                )}
                {successData.pdfBlob && (
                  <button onClick={downloadPdf}
                    style={{ height: 42, padding: '0 18px', borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#0D1B2A', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
                    <Download size={15} /> Download
                  </button>
                )}
                {successData.signedUrl && (
                  <button onClick={() => window.location.href = `mailto:?subject=Invoice ${successData.invoiceNumber}&body=Please find your invoice at: ${successData.signedUrl}`}
                    style={{ height: 42, padding: '0 18px', borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#0D1B2A', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
                    <Mail size={15} /> Open in Mail
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 'success' && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid #E1E8F0', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={step === 1 ? onClose : back}
              disabled={generating}
              style={{ height: 42, padding: '0 18px', borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit', opacity: generating ? 0.5 : 1 }}>
              {step !== 1 && <ChevronLeft size={15} />}
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            <button
              onClick={advance}
              disabled={!canAdvance() || generating}
              style={{ height: 42, padding: '0 20px', borderRadius: 10, border: 'none', background: canAdvance() && !generating ? '#00B4D8' : '#E1E8F0', color: canAdvance() && !generating ? '#FFFFFF' : '#94A3B8', fontSize: 14, fontWeight: 700, cursor: canAdvance() && !generating ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'inherit' }}>
              {generating
                ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Generating…</>
                : <>{btnLabel} {step !== 5 && <ChevronRight size={15} />}</>}
            </button>
          </div>
        )}
        {step === 'success' && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid #E1E8F0', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <button onClick={onClose}
              style={{ height: 42, padding: '0 32px', borderRadius: 10, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

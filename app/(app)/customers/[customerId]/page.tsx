'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { ArrowLeft, Pencil, Car, Loader2, X, Phone, Mail, MapPin, Hash, FileText, Users, Download } from 'lucide-react'
import BottomNav from '@/components/ui/bottom-nav'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import {
  getCustomerById, getCustomerVehicles, updateCustomer,
  PAYMENT_TERMS_LABELS, type Customer, type CustomerFormData,
} from '@/lib/customer-actions'
import ExportCsvModal from '@/components/billing/export-csv-modal'
import { WORK_ORDER_STATUSES, WORK_ORDER_STATUS_LABEL, type WorkOrderStatus } from '@/lib/work-order-status'
import { PRIMARY, PRIMARY_LIGHT, PRIMARY_PILL_TEXT, WHITE, DANGER, SUCCESS, SUCCESS_LIGHT, SUCCESS_DARK, WARN, WARN_LIGHT, WARN_DARK, PURPLE_LIGHT, PURPLE_DARK, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'
import {
  getCustomerRateOverride, setCustomerRateOverride, getCustomerStatusOverrides,
  setCustomerStatusOverride, clearCustomerStatusOverride, type CustomerRateOverride,
} from '@/lib/billing-defaults-actions'

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectiveStatus(v: any): string {
  switch (v.work_order_status as WorkOrderStatus) {
    case 'pending_arrival': return 'pending_arrival'
    case 'pending_release':
    case 'ready_for_release': return 'pending_pickup'
    case 'released': return 'picked_up'
    default: return 'on_lot'
  }
}

// Colors sourced from design-tokens.ts, matching getSpotPinColor()'s semantic
// language (cyan = occupied, amber = attention) — see vehicles/page.tsx's
// STATUS_CFG for the identical treatment and the reasoning.
const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  pending_arrival: { label: 'PENDING ARRIVAL', bg: GRAY_100,      color: GRAY_700 },
  on_lot:          { label: 'ON LOT',          bg: PRIMARY_LIGHT, color: PRIMARY_PILL_TEXT },
  pending_pickup:  { label: 'PENDING PICKUP',  bg: WARN_LIGHT,    color: WARN_DARK },
  picked_up:       { label: 'PICKED UP',       bg: SUCCESS_LIGHT, color: SUCCESS_DARK },
  completed:       { label: 'COMPLETED',       bg: PURPLE_LIGHT,  color: PURPLE_DARK },
}

function field(val: string | null | undefined) { return val ?? '' }

// ── Edit Slide-Over ───────────────────────────────────────────────────────────

function EditSlideOver({ customer, onClose, onSaved }: {
  customer: Customer; onClose: () => void; onSaved: (updated: Customer) => void
}) {
  const [form, setForm] = useState<CustomerFormData>({
    name: customer.name, phone: customer.phone, email: customer.email,
    billing_address: customer.billing_address, account_number: customer.account_number,
    payment_terms: customer.payment_terms, tax_exempt: customer.tax_exempt,
    secondary_contact_name: customer.secondary_contact_name,
    secondary_contact_phone: customer.secondary_contact_phone,
    secondary_contact_email: customer.secondary_contact_email,
    notes: customer.notes,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof CustomerFormData, value: any) =>
    setForm(f => ({ ...f, [key]: value || null }))

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(null)
    try {
      await updateCustomer(customer.id, form)
      onSaved({ ...customer, ...form, updated_at: new Date().toISOString() })
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 42, border: `1px solid ${GRAY_300}`, borderRadius: 10,
    padding: '0 12px', fontSize: 14, outline: 'none', background: GRAY_100,
    boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 5 }
  const sh: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '20px 0 10px' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ width: 'min(520px,100vw)', background: WHITE, display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${GRAY_300}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: GRAY_900, margin: 0 }}>Edit Customer</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} color={GRAY_500} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          <p style={sh}>Primary Info</p>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name *</label>
            <input value={field(form.name)} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={labelStyle}>Phone</label><input value={field(form.phone)} onChange={e => set('phone', e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Email</label><input type="email" value={field(form.email)} onChange={e => set('email', e.target.value)} style={inputStyle} /></div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Billing Address</label>
            <input value={field(form.billing_address)} onChange={e => set('billing_address', e.target.value)} style={inputStyle} />
          </div>
          <p style={sh}>Account & Billing</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={labelStyle}>Account #</label><input value={field(form.account_number)} onChange={e => set('account_number', e.target.value)} style={inputStyle} /></div>
            <div>
              <label style={labelStyle}>Payment Terms</label>
              <select value={form.payment_terms ?? ''} onChange={e => set('payment_terms', e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                <option value="">— None —</option>
                <option value="due_on_receipt">Due on Receipt</option>
                <option value="net_15">Net 15</option>
                <option value="net_30">Net 30</option>
              </select>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.tax_exempt} onChange={e => setForm(f => ({ ...f, tax_exempt: e.target.checked }))} style={{ width: 16, height: 16, accentColor: PRIMARY }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: GRAY_700 }}>Tax Exempt</span>
          </label>
          <p style={sh}>Secondary Contact</p>
          <div style={{ marginBottom: 14 }}><label style={labelStyle}>Name</label><input value={field(form.secondary_contact_name)} onChange={e => set('secondary_contact_name', e.target.value)} style={inputStyle} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div><label style={labelStyle}>Phone</label><input value={field(form.secondary_contact_phone)} onChange={e => set('secondary_contact_phone', e.target.value)} style={inputStyle} /></div>
            <div><label style={labelStyle}>Email</label><input type="email" value={field(form.secondary_contact_email)} onChange={e => set('secondary_contact_email', e.target.value)} style={inputStyle} /></div>
          </div>
          <p style={sh}>Notes</p>
          <textarea value={field(form.notes)} onChange={e => set('notes', e.target.value)} rows={4}
            style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }} />
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${GRAY_300}`, flexShrink: 0 }}>
          {error && <p style={{ fontSize: 12, color: DANGER, margin: '0 0 10px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, height: 46, borderRadius: 12, border: `1px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={save} disabled={saving || !form.name.trim()}
              style={{ flex: 2, height: 46, borderRadius: 12, border: 'none', background: form.name.trim() ? PRIMARY : GRAY_300, color: form.name.trim() ? WHITE : GRAY_500, fontWeight: 700, fontSize: 15, cursor: form.name.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Info Row ──────────────────────────────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
      <div style={{ flexShrink: 0, marginTop: 2, color: GRAY_500 }}>{icon}</div>
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 14, color: GRAY_900, margin: '1px 0 0' }}>{value}</p>
      </div>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${GRAY_100}` }}>
        <h2 style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{title}</h2>
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

// ── Billing Overrides ─────────────────────────────────────────────────────────
// Precedence: this customer's override > the company-wide defaults configured
// in Settings > Fee Structure > hardcoded fallback. Rate override here sits
// below the existing per-vehicle override on a work order (set on the vehicle
// detail page) — that stays the most specific, highest-precedence signal.

function BillingOverridesCard({ customerId, companyId }: { customerId: string; companyId: string }) {
  const [rate, setRate] = useState<CustomerRateOverride | null>(null)
  const [statusOverrides, setStatusOverrides] = useState<Partial<Record<WorkOrderStatus, boolean>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingRate, setSavingRate] = useState(false)
  const [rateSaved, setRateSaved] = useState(false)
  const [savingStatus, setSavingStatus] = useState<WorkOrderStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getCustomerRateOverride(customerId), getCustomerStatusOverrides(customerId)]).then(([r, s]) => {
      if (cancelled) return
      setRate(r ?? { default_daily_rate: null, default_monthly_rate: null, default_billing_type: null })
      setStatusOverrides(s)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [customerId])

  const saveRate = async () => {
    if (!rate) return
    setSavingRate(true)
    try {
      await setCustomerRateOverride(customerId, rate)
      setRateSaved(true)
      setTimeout(() => setRateSaved(false), 2000)
    } finally { setSavingRate(false) }
  }

  const setStatusOverride = async (status: WorkOrderStatus, value: boolean | null) => {
    setSavingStatus(status)
    try {
      if (value === null) {
        await clearCustomerStatusOverride(customerId, status)
        setStatusOverrides(so => { const next = { ...so }; delete next[status]; return next })
      } else {
        await setCustomerStatusOverride(companyId, customerId, status, value)
        setStatusOverrides(so => ({ ...so, [status]: value }))
      }
    } finally { setSavingStatus(null) }
  }

  if (loading || !rate) {
    return (
      <SectionCard title="Billing Overrides">
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Loader2 size={16} color={GRAY_500} style={{ animation: 'spin 0.8s linear infinite' }} />
        </div>
      </SectionCard>
    )
  }

  return (
    <SectionCard title="Billing Overrides">
      <p style={{ fontSize: 11, color: GRAY_500, margin: '0 0 12px', lineHeight: 1.5 }}>
        Negotiated terms for this customer. Overrides the company-wide defaults in Settings.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 4 }}>Daily Rate</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: GRAY_500 }}>$</span>
            <input type="number" min="0" step="0.01"
              value={rate.default_daily_rate ?? ''}
              onChange={e => setRate(r => r && ({ ...r, default_daily_rate: e.target.value === '' ? null : parseFloat(e.target.value) }))}
              style={{ width: '100%', height: 36, border: `1px solid ${GRAY_300}`, borderRadius: 8, padding: '0 8px 0 20px', fontSize: 13, outline: 'none', background: GRAY_100, boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 4 }}>Monthly Rate</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: GRAY_500 }}>$</span>
            <input type="number" min="0" step="0.01"
              value={rate.default_monthly_rate ?? ''}
              onChange={e => setRate(r => r && ({ ...r, default_monthly_rate: e.target.value === '' ? null : parseFloat(e.target.value) }))}
              style={{ width: '100%', height: 36, border: `1px solid ${GRAY_300}`, borderRadius: 8, padding: '0 8px 0 20px', fontSize: 13, outline: 'none', background: GRAY_100, boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 4 }}>Billing Type</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['daily', 'monthly'] as const).map(t => (
            <button key={t} onClick={() => setRate(r => r && ({ ...r, default_billing_type: t }))}
              style={{ flex: 1, height: 32, borderRadius: 7, border: `1.5px solid ${rate.default_billing_type === t ? PRIMARY : GRAY_300}`, background: rate.default_billing_type === t ? PRIMARY_LIGHT : WHITE, color: rate.default_billing_type === t ? PRIMARY_PILL_TEXT : GRAY_500, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
              {t}
            </button>
          ))}
          <button onClick={() => setRate(r => r && ({ ...r, default_billing_type: null }))}
            style={{ flex: 1, height: 32, borderRadius: 7, border: `1.5px solid ${!rate.default_billing_type ? PRIMARY : GRAY_300}`, background: !rate.default_billing_type ? PRIMARY_LIGHT : WHITE, color: !rate.default_billing_type ? PRIMARY_PILL_TEXT : GRAY_500, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Company Default
          </button>
        </div>
      </div>
      <button onClick={saveRate} disabled={savingRate}
        style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: rateSaved ? SUCCESS : GRAY_900, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 18 }}>
        {rateSaved ? 'Saved' : savingRate ? 'Saving…' : 'Save Rate Override'}
      </button>

      <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
        Storage Billable by Status
      </p>
      {WORK_ORDER_STATUSES.map(status => {
        const override = statusOverrides?.[status]
        const value = override === undefined ? null : override
        return (
          <div key={status} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: `1px solid ${GRAY_100}`, opacity: savingStatus === status ? 0.6 : 1 }}>
            <span style={{ fontSize: 12, color: GRAY_700 }}>{WORK_ORDER_STATUS_LABEL[status]}</span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setStatusOverride(status, null)} disabled={savingStatus === status}
                style={{ height: 26, padding: '0 8px', borderRadius: 6, border: `1.5px solid ${value === null ? GRAY_500 : GRAY_300}`, background: value === null ? GRAY_100 : WHITE, color: value === null ? GRAY_700 : GRAY_300, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Default
              </button>
              <button onClick={() => setStatusOverride(status, true)} disabled={savingStatus === status}
                style={{ height: 26, padding: '0 8px', borderRadius: 6, border: `1.5px solid ${value === true ? PRIMARY : GRAY_300}`, background: value === true ? PRIMARY_LIGHT : WHITE, color: value === true ? PRIMARY_PILL_TEXT : GRAY_300, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Billable
              </button>
              <button onClick={() => setStatusOverride(status, false)} disabled={savingStatus === status}
                style={{ height: 26, padding: '0 8px', borderRadius: 6, border: `1.5px solid ${value === false ? WARN : GRAY_300}`, background: value === false ? WARN_LIGHT : WHITE, color: value === false ? WARN_DARK : GRAY_300, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Not
              </button>
            </div>
          </div>
        )
      })}
    </SectionCard>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CustomerDetailPage({ params }: { params: { customerId: string } }) {
  const router = useRouter()
  const { effectiveCompany } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showExport, setShowExport] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, v] = await Promise.all([
        getCustomerById(params.customerId),
        getCustomerVehicles(params.customerId),
      ])
      setCustomer(c)
      setVehicles(v)
    } finally { setLoading(false) }
  }, [params.customerId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={24} color={GRAY_500} style={{ animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (!customer) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ color: GRAY_500 }}>Customer not found.</p>
        <button onClick={() => router.push('/customers')} style={{ marginTop: 12, color: PRIMARY, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14 }}>← Back to Customers</button>
      </div>
    )
  }

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {!isDesktop && <MobilePageHeader />}
      <div style={{
        padding: isDesktop ? '24px 28px' : '16px',
        paddingBottom: isDesktop ? undefined : 'calc(80px + env(safe-area-inset-bottom))',
        maxWidth: 900, margin: '0 auto',
      }}>
        {/* Back + header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={() => router.push('/customers')}
            style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${GRAY_300}`, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <ArrowLeft size={16} color={GRAY_700} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: isDesktop ? 22 : 18, fontWeight: 800, color: GRAY_900, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {customer.name}
            </h1>
            {customer.account_number && (
              <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>Account #{customer.account_number}</p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setShowExport(true)}
              style={{ height: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}
            >
              <Download size={13} /> Export
            </button>
            <button onClick={() => setShowEdit(true)}
              style={{ height: 36, padding: '0 14px', borderRadius: 10, border: `1px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
              <Pencil size={13} /> Edit
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 16 }}>
          {/* Left column */}
          <div>
            <SectionCard title="Contact">
              <InfoRow icon={<Phone size={15} />} label="Phone" value={customer.phone} />
              <InfoRow icon={<Mail size={15} />} label="Email" value={customer.email} />
              <InfoRow icon={<MapPin size={15} />} label="Billing Address" value={customer.billing_address} />
              {!customer.phone && !customer.email && !customer.billing_address && (
                <p style={{ fontSize: 13, color: GRAY_300, margin: 0 }}>No contact info</p>
              )}
            </SectionCard>

            <SectionCard title="Account & Billing">
              <InfoRow icon={<Hash size={15} />} label="Account #" value={customer.account_number} />
              <InfoRow icon={<FileText size={15} />} label="Payment Terms" value={customer.payment_terms ? PAYMENT_TERMS_LABELS[customer.payment_terms] : null} />
              {customer.tax_exempt && (
                <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: SUCCESS_DARK, background: SUCCESS_LIGHT, borderRadius: 8, padding: '3px 10px' }}>
                  Tax Exempt
                </span>
              )}
              {!customer.account_number && !customer.payment_terms && !customer.tax_exempt && (
                <p style={{ fontSize: 13, color: GRAY_300, margin: 0 }}>No billing info</p>
              )}
            </SectionCard>

            {effectiveCompany && <BillingOverridesCard customerId={customer.id} companyId={effectiveCompany.id} />}

            {(customer.secondary_contact_name || customer.secondary_contact_phone || customer.secondary_contact_email) && (
              <SectionCard title="Secondary Contact">
                <InfoRow icon={<Users size={15} />} label="Name" value={customer.secondary_contact_name} />
                <InfoRow icon={<Phone size={15} />} label="Phone" value={customer.secondary_contact_phone} />
                <InfoRow icon={<Mail size={15} />} label="Email" value={customer.secondary_contact_email} />
              </SectionCard>
            )}

            {customer.notes && (
              <SectionCard title="Notes">
                <p style={{ fontSize: 13, color: GRAY_700, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{customer.notes}</p>
              </SectionCard>
            )}
          </div>

          {/* Right column — vehicles */}
          <div>
            <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${GRAY_100}`, display: 'flex', alignItems: 'center' }}>
                <h2 style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, flex: 1 }}>
                  Vehicles
                  <span style={{ marginLeft: 6, background: GRAY_100, color: GRAY_700, fontSize: 11, padding: '1px 7px', borderRadius: 8 }}>{vehicles.length}</span>
                </h2>
              </div>
              {vehicles.length === 0 ? (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <Car size={22} color={GRAY_300} style={{ marginBottom: 8 }} />
                  <p style={{ fontSize: 13, color: GRAY_500, margin: 0 }}>No vehicles linked yet</p>
                </div>
              ) : (
                vehicles.map((v, i) => {
                  const st = effectiveStatus(v)
                  const sc = STATUS_CFG[st] ?? STATUS_CFG.pending_arrival
                  return (
                    <div key={v.id}
                      onClick={() => router.push(`/inventory/${v.id}`)}
                      style={{ padding: '12px 16px', borderBottom: i < vehicles.length - 1 ? `1px solid ${GRAY_100}` : 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                      onMouseEnter={e => (e.currentTarget.style.background = GRAY_100)}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: GRAY_100, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Car size={16} color={GRAY_500} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: GRAY_900, margin: 0 }}>
                          {[v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin}
                        </p>
                        <p style={{ fontSize: 11, color: GRAY_500, margin: 0, fontFamily: 'monospace' }}>{v.vin}</p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, background: sc.bg, color: sc.color, borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>
                        {sc.label}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {showEdit && (
        <EditSlideOver
          customer={customer}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => { setCustomer(updated); setShowEdit(false) }}
        />
      )}

      {showExport && effectiveCompany && (
        <ExportCsvModal
          companyId={effectiveCompany.id}
          customerId={params.customerId}
          customerName={customer?.name ?? null}
          onClose={() => setShowExport(false)}
        />
      )}

      <BottomNav />
    </>
  )
}

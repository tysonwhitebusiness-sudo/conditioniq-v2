'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Search, Plus, X, Loader2, Users, ChevronRight, Trash2 } from 'lucide-react'
import BottomNav from '@/components/ui/bottom-nav'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer,
  PAYMENT_TERMS_LABELS, type Customer, type CustomerFormData,
} from '@/lib/customer-actions'

// ── Customer Form Slide-Over ──────────────────────────────────────────────────

const EMPTY_FORM: CustomerFormData = {
  name: '', phone: null, email: null, billing_address: null,
  account_number: null, payment_terms: null, tax_exempt: false,
  secondary_contact_name: null, secondary_contact_phone: null,
  secondary_contact_email: null, notes: null,
}

function field(val: string | null | undefined) { return val ?? '' }

function CustomerSlideOver({ companyId, customer, onClose, onSaved }: {
  companyId: string
  customer: Customer | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!customer
  const [form, setForm] = useState<CustomerFormData>(
    customer ? {
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      billing_address: customer.billing_address,
      account_number: customer.account_number,
      payment_terms: customer.payment_terms,
      tax_exempt: customer.tax_exempt,
      secondary_contact_name: customer.secondary_contact_name,
      secondary_contact_phone: customer.secondary_contact_phone,
      secondary_contact_email: customer.secondary_contact_email,
      notes: customer.notes,
    } : { ...EMPTY_FORM }
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (key: keyof CustomerFormData, value: any) =>
    setForm(f => ({ ...f, [key]: value || null }))

  const save = async () => {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)
    try {
      if (isEdit) {
        await updateCustomer(customer!.id, form)
      } else {
        await createCustomer(companyId, form)
      }
      onSaved()
    } catch (e: any) {
      setError(e.message ?? 'Failed to save customer')
    } finally { setSaving(false) }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10,
    padding: '0 12px', fontSize: 14, outline: 'none', background: '#FAFAFA',
    boxSizing: 'border-box', fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5,
  }
  const sectionHead: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase',
    letterSpacing: '0.08em', margin: '20px 0 10px',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ width: 'min(520px,100vw)', background: '#FFFFFF', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E1E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>
            {isEdit ? 'Edit Customer' : 'Add Customer'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={20} color="#94A3B8" />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {/* Primary info */}
          <p style={sectionHead}>Primary Info</p>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name *</label>
            <input value={field(form.name)} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Company or individual name" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={field(form.phone)} onChange={e => set('phone', e.target.value)}
                placeholder="(555) 000-0000" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={field(form.email)} onChange={e => set('email', e.target.value)}
                placeholder="email@company.com" style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Billing Address</label>
            <input value={field(form.billing_address)} onChange={e => set('billing_address', e.target.value)}
              placeholder="123 Main St, City, ST 00000" style={inputStyle} />
          </div>

          {/* Account & billing */}
          <p style={sectionHead}>Account & Billing</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Account #</label>
              <input value={field(form.account_number)} onChange={e => set('account_number', e.target.value)}
                placeholder="Optional" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Payment Terms</label>
              <select value={form.payment_terms ?? ''} onChange={e => set('payment_terms', e.target.value)}
                style={{ ...inputStyle, appearance: 'none' }}>
                <option value="">— None —</option>
                <option value="due_on_receipt">Due on Receipt</option>
                <option value="net_15">Net 15</option>
                <option value="net_30">Net 30</option>
              </select>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.tax_exempt} onChange={e => setForm(f => ({ ...f, tax_exempt: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: '#00B4D8' }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Tax Exempt</span>
          </label>

          {/* Secondary contact */}
          <p style={sectionHead}>Secondary Contact</p>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Name</label>
            <input value={field(form.secondary_contact_name)} onChange={e => set('secondary_contact_name', e.target.value)}
              placeholder="Contact name" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={field(form.secondary_contact_phone)} onChange={e => set('secondary_contact_phone', e.target.value)}
                placeholder="(555) 000-0000" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={field(form.secondary_contact_email)} onChange={e => set('secondary_contact_email', e.target.value)}
                placeholder="email@company.com" style={inputStyle} />
            </div>
          </div>

          {/* Notes */}
          <p style={sectionHead}>Notes</p>
          <textarea value={field(form.notes)} onChange={e => set('notes', e.target.value)}
            rows={4} placeholder="Internal notes…"
            style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }} />
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E1E8F0', flexShrink: 0 }}>
          {error && <p style={{ fontSize: 12, color: '#EF4444', margin: '0 0 10px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose}
              style={{ flex: 1, height: 46, borderRadius: 12, border: '1px solid #E1E8F0', background: '#FFF', color: '#374151', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving || !form.name.trim()}
              style={{ flex: 2, height: 46, borderRadius: 12, border: 'none', background: form.name.trim() ? '#F4A62A' : '#E1E8F0', color: form.name.trim() ? '#0D1B2A' : '#94A3B8', fontWeight: 700, fontSize: 15, cursor: form.name.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Customer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const router = useRouter()
  const { effectiveCompany } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const companyId = effectiveCompany?.id ?? ''

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [slideOver, setSlideOver] = useState<{ open: boolean; customer: Customer | null }>({ open: false, customer: null })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try { setCustomers(await getCustomers(companyId)) }
    catch (e) { console.error('[customers]', e) }
    finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const filtered = customers.filter(c => {
    const s = search.toLowerCase()
    return !s || c.name.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.phone?.includes(s) ||
      c.account_number?.toLowerCase().includes(s)
  })

  const handleDelete = async () => {
    if (!confirmDeleteId) return
    setDeleting(true)
    try { await deleteCustomer(confirmDeleteId); setConfirmDeleteId(null); await load() }
    catch (e: any) { alert(e.message) }
    finally { setDeleting(false) }
  }

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {!isDesktop && <MobilePageHeader />}
      <div style={{
        padding: isDesktop ? '24px 28px' : '16px',
        paddingBottom: isDesktop ? undefined : 'calc(80px + env(safe-area-inset-bottom))',
        maxWidth: 1200, margin: '0 auto',
      }}>
        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: isDesktop ? 24 : 20, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>Customers</h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: '2px 0 0' }}>{customers.length} total</p>
          </div>
          <button onClick={() => setSlideOver({ open: true, customer: null })}
            style={{ height: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            <Plus size={16} /> Add Customer
          </button>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone, account #…"
            style={{ width: '100%', height: 40, border: '1px solid #E1E8F0', borderRadius: 10, paddingLeft: 34, paddingRight: 12, fontSize: 13, outline: 'none', background: '#FFF', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>

        {/* List */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 14, overflow: 'hidden' }}>
          {loading && (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <Loader2 size={20} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: '48px 20px', textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: 26, background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <Users size={22} color="#94A3B8" />
              </div>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#0D1B2A', margin: '0 0 4px' }}>
                {search ? 'No customers found' : 'No customers yet'}
              </p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
                {search ? 'Try a different search term' : 'Add your first customer to get started'}
              </p>
            </div>
          )}
          {!loading && filtered.map((c, i) => (
            <div key={c.id}
              style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: i < filtered.length - 1 ? '1px solid #F0F4F8' : 'none', cursor: 'pointer', transition: 'background 120ms' }}
              onClick={() => router.push(`/customers/${c.id}`)}
              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>

              {/* Avatar */}
              <div style={{ width: 40, height: 40, borderRadius: 20, background: '#E0F7FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: 14 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0097B2' }}>
                  {c.name.charAt(0).toUpperCase()}
                </span>
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>{c.name}</p>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
                  {[c.email, c.phone, c.account_number ? `#${c.account_number}` : null].filter(Boolean).join(' · ')}
                </p>
              </div>

              {/* Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {c.payment_terms && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#0097B2', background: '#E0F7FC', borderRadius: 6, padding: '2px 8px' }}>
                    {PAYMENT_TERMS_LABELS[c.payment_terms]}
                  </span>
                )}
                {c.tax_exempt && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#065F46', background: '#D1FAE5', borderRadius: 6, padding: '2px 8px' }}>
                    Tax Exempt
                  </span>
                )}
                <button onClick={e => { e.stopPropagation(); setSlideOver({ open: true, customer: c }) }}
                  style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Edit
                </button>
                <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(c.id) }}
                  style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #FEE2E2', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Trash2 size={13} color="#EF4444" />
                </button>
                <ChevronRight size={16} color="#CBD5E1" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slide-over */}
      {slideOver.open && (
        <CustomerSlideOver
          companyId={companyId}
          customer={slideOver.customer}
          onClose={() => setSlideOver({ open: false, customer: null })}
          onSaved={() => { setSlideOver({ open: false, customer: null }); load() }}
        />
      )}

      {/* Delete confirm */}
      {confirmDeleteId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.5)' }} onClick={() => setConfirmDeleteId(null)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0D1B2A', margin: '0 0 10px' }}>Delete Customer?</h3>
            <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>
              This customer will be removed. Any linked vehicles will remain but lose the customer association.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDeleteId(null)}
                style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#374151', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: '#EF4444', color: '#FFF', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </>
  )
}

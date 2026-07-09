'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import {
  ArrowLeft, ExternalLink, Copy, Check, Eye, EyeOff,
  DollarSign, Plus, Trash2, Pencil, Loader2, X, Mail,
} from 'lucide-react'
import {
  getInvoiceGroupDetail,
  updateInvoiceGroupStatus,
  updateInvoiceGroupNotes,
  addInvoicePayment,
  deleteInvoicePayment,
  addInvoiceAdjustment,
  deleteInvoiceAdjustment,
  logInvoiceSentEvent,
  type InvoiceGroupDetail,
  type InvoicePayment,
  type InvoiceAdjustment,
  type InvoiceGroupStatus,
} from '@/lib/invoice-group-actions'
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS, INVOICE_STATUS_BADGE_STYLE } from '@/lib/invoice-utils'
import { getInvoiceSignedUrl } from '@/lib/invoice-actions'
import SectionCard from '@/components/ui/section-card'

export default function InvoiceGroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const router = useRouter()
  const { user, effectiveCompany } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [group, setGroup] = useState<InvoiceGroupDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // Status
  const [statusSaving, setStatusSaving] = useState(false)

  // Notes edit
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesValue, setNotesValue] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)

  // Payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'check' | 'ach' | 'cash' | 'credit_card' | 'other'>('check')
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10))
  const [payNotes, setPayNotes] = useState('')
  const [paymentSaving, setPaymentSaving] = useState(false)

  // Adjustment form
  const [showAdjForm, setShowAdjForm] = useState(false)
  const [adjLabel, setAdjLabel] = useState('')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjSaving, setAdjSaving] = useState(false)

  // PDF signed URLs per line item storage_path
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getInvoiceGroupDetail(groupId)
    setGroup(data)
    if (data) setNotesValue(data.notes ?? '')
    setLoading(false)
  }, [groupId])

  useEffect(() => { load() }, [load])

  // Load signed URLs for PDFs
  useEffect(() => {
    if (!group?.line_items) return
    const paths = Array.from(new Set(group.line_items.map(li => li.storage_path).filter(Boolean) as string[]))
    paths.forEach(async path => {
      if (pdfUrls[path]) return
      const url = await getInvoiceSignedUrl(path)
      if (url) setPdfUrls(prev => ({ ...prev, [path]: url }))
    })
  }, [group?.line_items])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <Loader2 size={24} color="#00B4D8" style={{ animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (!group) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: '#94A3B8' }}>Invoice not found.</p>
        <button onClick={() => router.back()} style={{ marginTop: 12, padding: '8px 16px', borderRadius: 8, border: '1px solid #E1E8F0', background: '#FFF', cursor: 'pointer', fontFamily: 'inherit' }}>Go Back</button>
      </div>
    )
  }

  const sc = INVOICE_STATUS_BADGE_STYLE[group.status] ?? INVOICE_STATUS_BADGE_STYLE.draft
  const lineTotal = group.line_items.reduce((s, li) => s + (li.total_amount ?? 0), 0)
  const adjTotal = group.adjustments.reduce((s, a) => s + (a.amount ?? 0), 0)
  const grandTotal = lineTotal + adjTotal
  const totalPaid = group.payments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const balanceDue = grandTotal - totalPaid

  const portalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/invoice/${group.portal_token}`
    : `/invoice/${group.portal_token}`

  const customerEmail = group.customer?.email ?? null
  const customerName = group.customer?.name ?? group.bill_to_name ?? 'there'
  const mailtoUrl = customerEmail
    ? `mailto:${customerEmail}?subject=${encodeURIComponent(`Invoice #${group.invoice_number} from Condition IQ`)}&body=${encodeURIComponent(
        `Hi ${customerName},\n\nYour invoice #${group.invoice_number} for $${grandTotal.toFixed(2)} is ready to view here:\n${portalUrl}\n\nThank you.`
      )}`
    : null

  async function handleStatusChange(status: InvoiceGroupStatus) {
    setStatusSaving(true)
    try {
      await updateInvoiceGroupStatus(groupId, status)
      setGroup(prev => prev ? { ...prev, status } : prev)
    } finally {
      setStatusSaving(false)
    }
  }

  async function handleSaveNotes() {
    setNotesSaving(true)
    try {
      await updateInvoiceGroupNotes(groupId, notesValue.trim() || null)
      setGroup(prev => prev ? { ...prev, notes: notesValue.trim() || null } : prev)
      setEditingNotes(false)
    } finally {
      setNotesSaving(false)
    }
  }

  async function handleAddPayment() {
    const amount = parseFloat(payAmount)
    if (!amount || amount <= 0) return
    setPaymentSaving(true)
    try {
      const payment = await addInvoicePayment({
        groupId,
        companyId: effectiveCompany!.id,
        amount,
        paymentMethod: payMethod,
        paymentDate: payDate,
        notes: payNotes.trim() || null,
        createdBy: user?.id ?? null,
      })
      if (payment) {
        setGroup(prev => prev ? { ...prev, payments: [...prev.payments, payment] } : prev)
        setPayAmount(''); setPayNotes(''); setShowPaymentForm(false)
      }
    } finally {
      setPaymentSaving(false)
    }
  }

  async function handleDeletePayment(paymentId: string) {
    await deleteInvoicePayment(paymentId)
    setGroup(prev => prev ? { ...prev, payments: prev.payments.filter(p => p.id !== paymentId) } : prev)
  }

  async function handleAddAdjustment() {
    if (!adjLabel.trim() || !adjAmount) return
    const amount = parseFloat(adjAmount)
    if (isNaN(amount)) return
    setAdjSaving(true)
    try {
      const adj = await addInvoiceAdjustment({
        groupId,
        companyId: effectiveCompany!.id,
        label: adjLabel.trim(),
        amount,
        createdBy: user?.id ?? null,
      })
      if (adj) {
        setGroup(prev => prev ? { ...prev, adjustments: [...prev.adjustments, adj] } : prev)
        setAdjLabel(''); setAdjAmount(''); setShowAdjForm(false)
      }
    } finally {
      setAdjSaving(false)
    }
  }

  async function handleDeleteAdjustment(adjId: string) {
    await deleteInvoiceAdjustment(adjId)
    setGroup(prev => prev ? { ...prev, adjustments: prev.adjustments.filter(a => a.id !== adjId) } : prev)
  }

  function copyPortalLink() {
    navigator.clipboard.writeText(portalUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleSendInvoiceClick() {
    if (!effectiveCompany || !group) return
    logInvoiceSentEvent(groupId, effectiveCompany.id, group.invoice_number, user?.id ?? null).catch(() => {})
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 38, border: '1.5px solid #E1E8F0', borderRadius: 9,
    padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit',
    background: '#FAFAFA', color: '#0D1B2A', boxSizing: 'border-box',
  }

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{
        padding: isDesktop ? '24px 32px' : '16px',
        paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))',
        maxWidth: 760, margin: '0 auto',
      }}>

        {/* Back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button onClick={() => router.back()} style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <ArrowLeft size={16} color="#4A5568" />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0D1B2A', margin: 0, fontFamily: 'monospace' }}>
              {group.invoice_number}
            </h1>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>
              {group.bill_to_name ?? '—'} · {new Date(group.invoice_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {statusSaving && <Loader2 size={14} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />}
            <select
              value={group.status}
              onChange={e => handleStatusChange(e.target.value as InvoiceGroupStatus)}
              disabled={statusSaving}
              style={{
                height: 32, border: 'none', borderRadius: 20,
                background: sc.bg, color: sc.color, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.03em', textTransform: 'uppercase',
                fontFamily: 'inherit', padding: '0 14px', cursor: 'pointer', outline: 'none',
              }}
            >
              {Object.entries(INVOICE_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 300px' : '1fr', gap: 16 }}>

          {/* Left column */}
          <div>

            {/* Summary card */}
            <SectionCard title="Invoice Summary">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  ['Invoice #', group.invoice_number],
                  ['Date', new Date(group.invoice_date).toLocaleDateString()],
                  ['Due', group.due_date ? new Date(group.due_date).toLocaleDateString() : '—'],
                  ['Customer', group.customer?.name ?? group.bill_to_name ?? '—'],
                  ['Contact', group.bill_to_contact ?? '—'],
                  ['Vehicles', String(group.line_items.length)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>{label}</p>
                    <p style={{ fontSize: 13, color: '#0D1B2A', fontWeight: 600, margin: 0 }}>{value}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            {/* Line items */}
            <SectionCard title="Line Items" count={group.line_items.length}>
              {group.line_items.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No line items.</p>
              ) : (
                <div>
                  {group.line_items.map((li, i) => {
                    const pdfUrl = li.storage_path ? pdfUrls[li.storage_path] : null
                    return (
                      <div key={li.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid #F0F4F8' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>{li.vehicle_description ?? li.vehicle_vin ?? '—'}</p>
                          <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0', fontFamily: 'monospace' }}>
                            {li.vehicle_vin ?? ''} · {li.days_on_lot}d · ${(li.rate ?? 0).toFixed(2)}/{li.billing_type === 'daily' ? 'day' : 'mo'}
                          </p>
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>${(li.total_amount ?? 0).toFixed(2)}</p>
                        {pdfUrl && (
                          <button onClick={() => window.open(pdfUrl, '_blank')} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                            <ExternalLink size={12} color="#00B4D8" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid #E1E8F0' }}>
                    <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Subtotal</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>${lineTotal.toFixed(2)}</p>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* Adjustments */}
            <SectionCard
              title="Adjustments / Credits"
              action={
                <button onClick={() => setShowAdjForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid #E1E8F0', background: '#FFF', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4A5568', fontFamily: 'inherit' }}>
                  <Plus size={12} /> Add
                </button>
              }
            >
              {showAdjForm && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <input value={adjLabel} onChange={e => setAdjLabel(e.target.value)} placeholder="Description (e.g. Discount)" style={{ ...inputStyle, flex: 2, minWidth: 120 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 90 }}>
                    <span style={{ fontSize: 13, color: '#94A3B8' }}>$</span>
                    <input type="number" step="0.01" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="0.00" style={{ ...inputStyle }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleAddAdjustment} disabled={adjSaving || !adjLabel.trim() || !adjAmount} style={{ height: 38, padding: '0 14px', borderRadius: 9, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {adjSaving ? '…' : 'Save'}
                    </button>
                    <button onClick={() => setShowAdjForm(false)} style={{ height: 38, width: 38, borderRadius: 9, border: '1px solid #E1E8F0', background: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={14} color="#94A3B8" />
                    </button>
                  </div>
                </div>
              )}
              {group.adjustments.length === 0 && !showAdjForm ? (
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No adjustments.</p>
              ) : (
                group.adjustments.map((a, i) => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: i === 0 && !showAdjForm ? 'none' : '1px solid #F0F4F8' }}>
                    <p style={{ flex: 1, fontSize: 13, color: '#0D1B2A', margin: 0 }}>{a.label}</p>
                    <p style={{ fontSize: 13, fontWeight: 600, color: a.amount < 0 ? '#DC2626' : '#10B981', margin: 0 }}>
                      {a.amount < 0 ? '-' : '+'}${Math.abs(a.amount).toFixed(2)}
                    </p>
                    <button onClick={() => handleDeleteAdjustment(a.id)} style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #FEE2E2', background: '#FFF5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <Trash2 size={11} color="#DC2626" />
                    </button>
                  </div>
                ))
              )}
            </SectionCard>

            {/* Notes */}
            <SectionCard
              title="Notes"
              action={
                !editingNotes
                  ? <button onClick={() => setEditingNotes(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid #E1E8F0', background: '#FFF', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4A5568', fontFamily: 'inherit' }}>
                      <Pencil size={11} /> Edit
                    </button>
                  : undefined
              }
            >
              {editingNotes ? (
                <div>
                  <textarea value={notesValue} onChange={e => setNotesValue(e.target.value)} rows={3} style={{ width: '100%', border: '1.5px solid #E1E8F0', borderRadius: 9, padding: 10, fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', background: '#FAFAFA' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={handleSaveNotes} disabled={notesSaving} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {notesSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => { setEditingNotes(false); setNotesValue(group.notes ?? '') }} style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #E1E8F0', background: '#FFF', fontSize: 13, color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: group.notes ? '#0D1B2A' : '#CBD5E1', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {group.notes || 'No notes.'}
                </p>
              )}
            </SectionCard>

          </div>

          {/* Right column */}
          <div>

            {/* Total card */}
            <div style={{ background: 'linear-gradient(135deg, #1B2D40, #0D1B2A)', borderRadius: 16, padding: 18, marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Invoice Total</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#00B4D8', margin: '0 0 12px' }}>${grandTotal.toFixed(2)}</p>
              {group.payments.length > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#64748B' }}>Paid</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#10B981' }}>${totalPaid.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #1B2D40' }}>
                    <span style={{ fontSize: 12, color: '#F0F4F8', fontWeight: 700 }}>Balance Due</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: balanceDue <= 0 ? '#10B981' : '#F4A62A' }}>${Math.max(0, balanceDue).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Payments */}
            <SectionCard
              title="Payments"
              action={
                <button onClick={() => setShowPaymentForm(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid #E1E8F0', background: '#FFF', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4A5568', fontFamily: 'inherit' }}>
                  <Plus size={12} /> Record
                </button>
              }
            >
              {showPaymentForm && (
                <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <DollarSign size={13} color="#94A3B8" style={{ flexShrink: 0 }} />
                    <input type="number" min="0" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="Amount" style={{ ...inputStyle }} />
                  </div>
                  <select value={payMethod} onChange={e => setPayMethod(e.target.value as typeof payMethod)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={inputStyle} />
                  <input value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Notes (optional)" style={inputStyle} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleAddPayment} disabled={paymentSaving || !payAmount} style={{ flex: 1, height: 36, borderRadius: 8, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {paymentSaving ? '…' : 'Add Payment'}
                    </button>
                    <button onClick={() => setShowPaymentForm(false)} style={{ height: 36, width: 36, borderRadius: 8, border: '1px solid #E1E8F0', background: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={13} color="#94A3B8" />
                    </button>
                  </div>
                </div>
              )}
              {group.payments.length === 0 && !showPaymentForm ? (
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No payments recorded.</p>
              ) : (
                group.payments.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: i === 0 && !showPaymentForm ? 'none' : '1px solid #F0F4F8' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>${(p.amount ?? 0).toFixed(2)}</p>
                      <p style={{ fontSize: 10, color: '#94A3B8', margin: '1px 0 0' }}>
                        {PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method} · {new Date(p.payment_date).toLocaleDateString()}
                      </p>
                    </div>
                    <button onClick={() => handleDeletePayment(p.id)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #FEE2E2', background: '#FFF5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                      <Trash2 size={10} color="#DC2626" />
                    </button>
                  </div>
                ))
              )}
            </SectionCard>

            {/* Portal link */}
            <SectionCard title="Client Portal">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {group.portal_viewed
                  ? <Eye size={14} color="#10B981" />
                  : <EyeOff size={14} color="#94A3B8" />}
                <p style={{ fontSize: 12, color: group.portal_viewed ? '#10B981' : '#94A3B8', margin: 0 }}>
                  {group.portal_viewed
                    ? `Viewed ${group.portal_viewed_at ? new Date(group.portal_viewed_at).toLocaleDateString() : ''}`
                    : 'Not yet viewed'}
                </p>
              </div>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 10px', wordBreak: 'break-all', lineHeight: 1.5 }}>
                {portalUrl}
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button onClick={copyPortalLink} style={{ flex: 1, height: 36, borderRadius: 9, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: copied ? '#10B981' : '#0D1B2A', fontFamily: 'inherit' }}>
                  {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy Link</>}
                </button>
                <button onClick={() => window.open(portalUrl, '_blank')} style={{ width: 36, height: 36, borderRadius: 9, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <ExternalLink size={13} color="#00B4D8" />
                </button>
              </div>
              {mailtoUrl ? (
                <a
                  href={mailtoUrl}
                  onClick={handleSendInvoiceClick}
                  style={{ height: 36, borderRadius: 9, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#0D1B2A', fontFamily: 'inherit', textDecoration: 'none' }}
                >
                  <Mail size={13} color="#00B4D8" /> Send Invoice
                </a>
              ) : (
                <button disabled title="Add a customer email to send this invoice"
                  style={{ height: 36, borderRadius: 9, border: '1px solid #E1E8F0', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'not-allowed', fontSize: 12, fontWeight: 700, color: '#94A3B8', fontFamily: 'inherit' }}
                >
                  <Mail size={13} color="#94A3B8" /> Send Invoice
                </button>
              )}
            </SectionCard>

          </div>
        </div>

        <BottomNav />
      </div>
    </>
  )
}

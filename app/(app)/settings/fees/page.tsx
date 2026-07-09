'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import {
  ArrowLeft, Plus, Pencil, Trash2, Check, RefreshCw, Loader2, Lock,
} from 'lucide-react'
import {
  getFeeTypes, createFeeType, updateFeeType, softDeleteFeeType,
  getReportCosts, saveReportCosts,
  type FeeType, type ReportCosts,
} from '@/lib/lot-fee-actions'

// ── Section wrapper ───────────────────────────────────────────────────────────

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #F0F4F8' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>{title}</p>
        {subtitle && <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>{subtitle}</p>}
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  )
}

// ── Fee type row ──────────────────────────────────────────────────────────────

function FeeRow({ fee, onEdit, onDelete }: { fee: FeeType; onEdit: () => void; onDelete: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #F8FAFC' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>{fee.name}</p>
        <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>
          ${Number(fee.default_amount).toFixed(2)} default · {fee.is_recurring ? 'Recurring' : 'One-time'}
        </p>
      </div>
      {fee.is_recurring && (
        <span style={{ fontSize: 10, fontWeight: 700, color: '#0097B2', background: '#E0F7FC', borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>
          RECURRING
        </span>
      )}
      <button onClick={onEdit}
        style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        <Pencil size={12} color="#4A5568" />
      </button>
      {confirmDelete ? (
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button onClick={() => setConfirmDelete(false)}
            style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #E1E8F0', background: '#FFF', fontSize: 11, fontWeight: 600, color: '#4A5568', cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={onDelete}
            style={{ height: 28, padding: '0 10px', borderRadius: 6, border: 'none', background: '#EF4444', fontSize: 11, fontWeight: 700, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit' }}>
            Delete
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmDelete(true)}
          style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #FEE2E2', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <Trash2 size={12} color="#EF4444" />
        </button>
      )}
    </div>
  )
}

// ── Add / Edit fee form ───────────────────────────────────────────────────────

function FeeForm({ initial, onSave, onCancel, saving }: {
  initial?: Partial<FeeType>
  onSave: (data: { name: string; default_amount: number; is_recurring: boolean }) => void
  onCancel: () => void
  saving: boolean
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState(initial?.default_amount != null ? String(initial.default_amount) : '')
  const [recurring, setRecurring] = useState(initial?.is_recurring ?? false)

  const valid = name.trim().length > 0 && amount !== '' && !isNaN(parseFloat(amount)) && parseFloat(amount) >= 0

  return (
    <div style={{ background: '#F8FAFC', border: '1px solid #E1E8F0', borderRadius: 12, padding: 16, marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Fee Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Admin Fee"
            style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 9, padding: '0 10px', fontSize: 13, outline: 'none', background: '#FFF', boxSizing: 'border-box', fontFamily: 'inherit' }} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Default Amount</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#94A3B8' }}>$</span>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}
              style={{ width: 110, height: 38, border: '1px solid #E1E8F0', borderRadius: 9, padding: '0 10px 0 22px', fontSize: 13, outline: 'none', background: '#FFF', fontFamily: 'inherit' }} />
          </div>
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)}
          style={{ width: 15, height: 15, accentColor: '#00B4D8' }} />
        <span style={{ fontSize: 13, color: '#374151' }}>
          Recurring fee <span style={{ color: '#94A3B8' }}>(can be re-applied each billing cycle)</span>
        </span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel}
          style={{ flex: 1, height: 36, borderRadius: 9, border: '1px solid #E1E8F0', background: '#FFF', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Cancel
        </button>
        <button onClick={() => onSave({ name: name.trim(), default_amount: parseFloat(amount), is_recurring: recurring })}
          disabled={!valid || saving}
          style={{ flex: 2, height: 36, borderRadius: 9, border: 'none', background: valid ? '#00B4D8' : '#E1E8F0', color: valid ? '#FFFFFF' : '#94A3B8', fontWeight: 700, fontSize: 13, cursor: valid ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          {saving ? 'Saving…' : initial?.id ? 'Save Changes' : 'Add Fee'}
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FeeSettingsPage() {
  const router = useRouter()
  const { effectiveCompany, user, loading } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const lotMapEnabled = useFeatureFlag('lot_map')
  const companyId = effectiveCompany?.id ?? ''

  // Report costs
  const [costs, setCosts] = useState<ReportCosts>({ report_cost_checkin: null, report_cost_checkout: null, report_cost_one_off: null })
  const [costsSaved, setCostsSaved] = useState(false)
  const [savingCosts, setSavingCosts] = useState(false)
  const [loadingCosts, setLoadingCosts] = useState(true)

  // Fee types
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([])
  const [loadingFees, setLoadingFees] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingFee, setEditingFee] = useState<FeeType | null>(null)
  const [formSaving, setFormSaving] = useState(false)

  const loadAll = useCallback(async () => {
    if (!companyId) return
    setLoadingCosts(true)
    setLoadingFees(true)
    try {
      const [c, f] = await Promise.all([getReportCosts(companyId), getFeeTypes(companyId)])
      setCosts(c)
      setFeeTypes(f)
    } finally {
      setLoadingCosts(false)
      setLoadingFees(false)
    }
  }, [companyId])

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => { loadAll() }, [loadAll])

  const handleSaveCosts = async () => {
    setSavingCosts(true)
    try {
      await saveReportCosts(companyId, costs)
      setCostsSaved(true)
      setTimeout(() => setCostsSaved(false), 2500)
    } finally { setSavingCosts(false) }
  }

  const handleAddFee = async (data: { name: string; default_amount: number; is_recurring: boolean }) => {
    setFormSaving(true)
    try {
      const created = await createFeeType(companyId, data)
      setFeeTypes(fs => [...fs, created].sort((a, b) => a.name.localeCompare(b.name)))
      setShowAddForm(false)
    } finally { setFormSaving(false) }
  }

  const handleUpdateFee = async (data: { name: string; default_amount: number; is_recurring: boolean }) => {
    if (!editingFee) return
    setFormSaving(true)
    try {
      await updateFeeType(editingFee.id, data)
      setFeeTypes(fs => fs.map(f => f.id === editingFee.id ? { ...f, ...data } : f).sort((a, b) => a.name.localeCompare(b.name)))
      setEditingFee(null)
    } finally { setFormSaving(false) }
  }

  const handleDeleteFee = async (id: string) => {
    await softDeleteFeeType(id)
    setFeeTypes(fs => fs.filter(f => f.id !== id))
  }

  const costInput = (label: string, key: keyof ReportCosts) => (
    <div>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#94A3B8' }}>$</span>
        <input
          type="number" min="0" step="0.01"
          value={costs[key] ?? ''}
          onChange={e => setCosts(c => ({ ...c, [key]: e.target.value === '' ? null : parseFloat(e.target.value) }))}
          placeholder="0.00"
          style={{ width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10, paddingLeft: 26, paddingRight: 12, fontSize: 14, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />
      </div>
    </div>
  )

  if (loading || !user) return null

  if (lotMapEnabled === false) {
    return (
      <>
        <MobilePageHeader />
        <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Lock size={28} color="#94A3B8" />
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px', textAlign: 'center' }}>Lot Billing not enabled</h2>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, textAlign: 'center' }}>Contact us to get access to fee structure settings.</p>
        </div>
        <BottomNav />
      </>
    )
  }

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {!isDesktop && <MobilePageHeader />}
      <div style={{
        padding: isDesktop ? '24px 28px' : '16px',
        paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))',
        maxWidth: 700, margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => router.push('/settings')}
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <ArrowLeft size={16} color="#4A5568" />
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>Fee Structure</h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Configure report costs and custom fees</p>
          </div>
        </div>

        {/* Report Costs */}
        <Card title="Condition Report Costs" subtitle="Automatically charged each time a report of that type is generated for a VIN">
          {loadingCosts ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Loader2 size={18} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
                {costInput('Check-In Report', 'report_cost_checkin')}
                {costInput('Check-Out Report', 'report_cost_checkout')}
                {costInput('One-Off Report', 'report_cost_one_off')}
              </div>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 14px', lineHeight: 1.5 }}>
                Leave blank to charge $0 for that report type. Charges are recorded automatically when a report is generated — they appear in the vehicle's charges breakdown.
              </p>
              <button onClick={handleSaveCosts} disabled={savingCosts}
                style={{ height: 40, padding: '0 20px', borderRadius: 10, border: 'none', background: costsSaved ? '#10B981' : '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 300ms ease' }}>
                {costsSaved ? <><Check size={14} /> Saved</> : savingCosts ? 'Saving…' : 'Save Report Costs'}
              </button>
            </>
          )}
        </Card>

        {/* Custom Fee Types */}
        <Card
          title="Custom Fee Types"
          subtitle="Define your fee menu — apply these to any vehicle from its detail page"
        >
          {loadingFees ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Loader2 size={18} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <>
              {feeTypes.length === 0 && !showAddForm && (
                <p style={{ fontSize: 13, color: '#CBD5E1', margin: '0 0 12px' }}>No custom fees defined yet.</p>
              )}

              {feeTypes.map(fee => (
                editingFee?.id === fee.id ? (
                  <div key={fee.id}>
                    <FeeForm
                      initial={editingFee}
                      onSave={handleUpdateFee}
                      onCancel={() => setEditingFee(null)}
                      saving={formSaving}
                    />
                  </div>
                ) : (
                  <FeeRow
                    key={fee.id}
                    fee={fee}
                    onEdit={() => { setShowAddForm(false); setEditingFee(fee) }}
                    onDelete={() => handleDeleteFee(fee.id)}
                  />
                )
              ))}

              {showAddForm ? (
                <FeeForm
                  onSave={handleAddFee}
                  onCancel={() => setShowAddForm(false)}
                  saving={formSaving}
                />
              ) : !editingFee && (
                <button onClick={() => setShowAddForm(true)}
                  style={{ marginTop: feeTypes.length > 0 ? 12 : 0, height: 38, padding: '0 16px', borderRadius: 9, border: '1.5px dashed #CBD5E1', background: '#F8FAFC', color: '#4A5568', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                  <Plus size={14} /> Add Fee Type
                </button>
              )}
            </>
          )}
        </Card>

        {/* Recurring note */}
        <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <RefreshCw size={14} color="#0097B2" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: '#0369A1', margin: 0, lineHeight: 1.6 }}>
              <strong>Recurring fees</strong> are not applied automatically — they can be re-applied to a vehicle manually each billing cycle. The "Recurring" flag is a reminder label only.
            </p>
          </div>
        </div>
      </div>

      <BottomNav />
    </>
  )
}

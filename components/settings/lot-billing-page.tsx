'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { createClient } from '@/lib/supabase/client'
import { saveLotBillingDefaultsAction } from '@/lib/lot-server-actions'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import { DollarSign, Check, FileText, ExternalLink, ChevronRight, Layers, Loader2 } from 'lucide-react'
import LoadingOverlay from '@/components/ui/loading-overlay'
import { getCompanyInvoices, getInvoiceSignedUrl, updateInvoiceStatus, type LotInvoice } from '@/lib/invoice-actions'
import { updateBulkInvoiceStatus, getBulkInvoiceSignedUrl } from '@/lib/bulk-invoice-actions'

type BillingType = 'daily' | 'monthly'

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: '#F0F4F8', color: '#4A5568' },
  sent:  { bg: '#E0F7FC', color: '#0097B2' },
  paid:  { bg: '#D1FAE5', color: '#065F46' },
}

export default function LotBillingPage() {
  const { effectiveCompany } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [defaultDailyRate, setDefaultDailyRate] = useState('')
  const [defaultMonthlyRate, setDefaultMonthlyRate] = useState('')
  const [defaultBillingType, setDefaultBillingType] = useState<BillingType>('daily')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const [invoices, setInvoices] = useState<LotInvoice[]>([])
  const [loadingInvoices, setLoadingInvoices] = useState(false)
  const [invoicesLoaded, setInvoicesLoaded] = useState(false)
  const [expandedBulk, setExpandedBulk] = useState<Set<string>>(new Set())

  const companyId = effectiveCompany?.id ?? ''

  useEffect(() => {
    if (!companyId) return
    createClient()
      .from('companies')
      .select('default_daily_rate, default_monthly_rate, default_billing_type')
      .eq('id', companyId)
      .single()
      .then(({ data }) => {
        if (data) {
          setDefaultDailyRate(data.default_daily_rate != null ? String(data.default_daily_rate) : '')
          setDefaultMonthlyRate(data.default_monthly_rate != null ? String(data.default_monthly_rate) : '')
          setDefaultBillingType((data.default_billing_type as BillingType) ?? 'daily')
        }
        setLoading(false)
      })
  }, [companyId])

  useEffect(() => {
    if (!companyId || invoicesLoaded) return
    setLoadingInvoices(true)
    getCompanyInvoices(companyId)
      .then(data => { setInvoices(data); setInvoicesLoaded(true) })
      .finally(() => setLoadingInvoices(false))
  }, [companyId, invoicesLoaded])

  const handleSave = async () => {
    if (!companyId) return
    setSaving(true)
    const { error } = await saveLotBillingDefaultsAction(companyId, {
      default_daily_rate: defaultDailyRate ? parseFloat(defaultDailyRate) : null,
      default_monthly_rate: defaultMonthlyRate ? parseFloat(defaultMonthlyRate) : null,
      default_billing_type: defaultBillingType,
    })
    setSaving(false)
    if (error) { setErrorMsg('Failed to save: ' + error); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: '#4A5568',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'block', marginBottom: 6,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, border: '1px solid #E1E8F0',
    borderRadius: 10, padding: '0 12px 0 32px',
    fontSize: 15, outline: 'none', fontFamily: 'inherit',
    background: '#FAFAFA', color: '#0D1B2A', boxSizing: 'border-box',
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: '#94A3B8',
    textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px',
  }

  // Build sorted display list (bulk groups + individuals, newest first)
  const bulkMap = new Map<string, LotInvoice[]>()
  const individual: LotInvoice[] = []
  for (const inv of invoices) {
    if (inv.bulk_invoice_id) {
      const group = bulkMap.get(inv.bulk_invoice_id) ?? []
      group.push(inv)
      bulkMap.set(inv.bulk_invoice_id, group)
    } else {
      individual.push(inv)
    }
  }

  type DisplayItem =
    | { kind: 'bulk'; bulkId: string; rows: LotInvoice[] }
    | { kind: 'single'; inv: LotInvoice }

  const items: (DisplayItem & { sortDate: string })[] = [
    ...Array.from(bulkMap.entries()).map(([bulkId, rows]) => ({
      kind: 'bulk' as const, bulkId, rows, sortDate: rows[0]?.created_at ?? '',
    })),
    ...individual.map(inv => ({ kind: 'single' as const, inv, sortDate: inv.created_at })),
  ].sort((a, b) => b.sortDate.localeCompare(a.sortDate))

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{
        padding: isDesktop ? '24px 28px' : '16px',
        paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))',
        maxWidth: 720, margin: '0 auto',
      }}>

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: isDesktop ? 22 : 20, fontWeight: 900, color: '#0D1B2A', margin: '0 0 4px' }}>Lot Billing</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>Billing defaults and invoice history</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── Section 1: Billing Defaults ── */}
          <div>
            <p style={sectionLabel}>Billing Defaults</p>
            {loading ? (
              <div style={{ position: 'relative', background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20, minHeight: 80 }}>
                <LoadingOverlay show />
              </div>
            ) : (
              <div style={{ position: 'relative', background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20 }}>
                <LoadingOverlay show={saving} />
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Default Billing Type</label>
                  <div style={{ display: 'flex', background: '#F0F4F8', borderRadius: 10, padding: 3 }}>
                    {(['daily', 'monthly'] as BillingType[]).map(type => (
                      <button key={type} onClick={() => setDefaultBillingType(type)} style={{
                        flex: 1, height: 38, borderRadius: 8, border: 'none',
                        background: defaultBillingType === type ? '#0D1B2A' : 'transparent',
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
                  <p style={{ fontSize: 11, color: '#94A3B8', margin: '5px 0 0' }}>Per vehicle, per day on lot</p>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>Default Monthly Rate</label>
                  <div style={{ position: 'relative' }}>
                    <DollarSign size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                    <input type="number" min="0" step="0.01" placeholder="e.g. 500.00" value={defaultMonthlyRate} onChange={e => setDefaultMonthlyRate(e.target.value)} style={inputStyle} />
                  </div>
                  <p style={{ fontSize: 11, color: '#94A3B8', margin: '5px 0 0' }}>Per vehicle, per 30 days on lot</p>
                </div>

                <button onClick={handleSave} disabled={saving} style={{
                  width: '100%', height: 46, borderRadius: 12, border: 'none',
                  background: saved ? '#10B981' : '#0D1B2A',
                  color: '#FFF', fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                  fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  opacity: saving ? 0.7 : 1, transition: 'background 300ms ease',
                }}>
                  {saved ? <><Check size={16} />Saved</> : saving ? 'Saving…' : 'Save Defaults'}
                </button>
              </div>
            )}
          </div>

          {/* ── Section 2: Invoice History ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ ...sectionLabel, margin: 0 }}>Invoice History</p>
              {invoices.length > 0 && (
                <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>
                  All-time: <strong style={{ color: '#0D1B2A' }}>${invoices.reduce((s, i) => s + (i.total_amount ?? 0), 0).toFixed(2)}</strong>
                </p>
              )}
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20 }}>
              {loadingInvoices ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                  <Loader2 size={20} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : invoices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <FileText size={28} color="#E1E8F0" style={{ display: 'block', margin: '0 auto 8px' }} />
                  <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No invoices generated yet.</p>
                  <p style={{ fontSize: 12, color: '#CBD5E1', margin: '4px 0 0' }}>Generate invoices from the vehicle detail page.</p>
                </div>
              ) : (
                <div>
                  {items.map((item, i) => {
                    if (item.kind === 'bulk') {
                      const { bulkId, rows } = item
                      const rep = rows[0]
                      const total = rows.reduce((s, r) => s + (r.total_amount ?? 0), 0)
                      const sc = STATUS_COLORS[rep.status] ?? STATUS_COLORS.draft
                      const isExp = expandedBulk.has(bulkId)
                      return (
                        <div key={bulkId} style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F4F8' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => setExpandedBulk(prev => {
                                const n = new Set<string>(Array.from(prev))
                                if (n.has(bulkId)) n.delete(bulkId); else n.add(bulkId)
                                return n
                              })}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}>
                              <ChevronRight size={14} color="#94A3B8" style={{ transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }} />
                            </button>
                            <div style={{ flex: 1, minWidth: 120 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0, fontFamily: 'monospace' }}>{rep.invoice_number}</p>
                                <span style={{ background: '#E0F7FC', color: '#0097B2', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <Layers size={9} />{rows.length} vehicles
                                </span>
                              </div>
                              <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                                {new Date(rep.invoice_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>${total.toFixed(2)}</p>
                            <select
                              value={rep.status}
                              onChange={async e => {
                                const newStatus = e.target.value as 'draft' | 'sent' | 'paid'
                                await updateBulkInvoiceStatus(bulkId, newStatus)
                                setInvoices(prev => prev.map(x => x.bulk_invoice_id === bulkId ? { ...x, status: newStatus } : x))
                              }}
                              style={{ height: 30, border: `1px solid ${sc.bg}`, borderRadius: 8, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', padding: '0 8px', cursor: 'pointer', outline: 'none' }}
                            >
                              <option value="draft">Draft</option>
                              <option value="sent">Sent</option>
                              <option value="paid">Paid</option>
                            </select>
                            {rep.storage_path && (
                              <button
                                onClick={async () => { const url = await getBulkInvoiceSignedUrl(rep.storage_path!); if (url) window.open(url, '_blank') }}
                                style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                                <ExternalLink size={13} color="#00B4D8" />
                              </button>
                            )}
                          </div>
                          {isExp && (
                            <div style={{ marginLeft: 24, marginBottom: 10, background: '#F8FAFC', border: '1px solid #F0F4F8', borderRadius: 10, overflow: 'hidden' }}>
                              {rows.map((r, ri) => (
                                <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderTop: ri === 0 ? 'none' : '1px solid #F0F4F8', flexWrap: 'wrap' }}>
                                  <div style={{ flex: 1, minWidth: 100 }}>
                                    <p style={{ fontSize: 12, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>{r.vehicle_description ?? r.vehicle_vin ?? '—'}</p>
                                    <p style={{ fontSize: 10, fontFamily: 'monospace', color: '#94A3B8', margin: '1px 0 0' }}>{r.vehicle_vin}</p>
                                  </div>
                                  <p style={{ fontSize: 12, color: '#4A5568', margin: 0 }}>{r.days_on_lot}d</p>
                                  <p style={{ fontSize: 12, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>${(r.total_amount ?? 0).toFixed(2)}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    }

                    const inv = item.inv
                    const sc = STATUS_COLORS[inv.status] ?? STATUS_COLORS.draft
                    return (
                      <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid #F0F4F8', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 120 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0, fontFamily: 'monospace' }}>{inv.invoice_number}</p>
                          <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                            {inv.vehicle_description ?? inv.vehicle_vin ?? '—'} · {new Date(inv.invoice_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        </div>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>${(inv.total_amount ?? 0).toFixed(2)}</p>
                        <select
                          value={inv.status}
                          onChange={async e => {
                            const newStatus = e.target.value as 'draft' | 'sent' | 'paid'
                            await updateInvoiceStatus(inv.id, newStatus)
                            setInvoices(prev => prev.map(x => x.id === inv.id ? { ...x, status: newStatus } : x))
                          }}
                          style={{ height: 30, border: `1px solid ${sc.bg}`, borderRadius: 8, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, fontFamily: 'inherit', padding: '0 8px', cursor: 'pointer', outline: 'none' }}
                        >
                          <option value="draft">Draft</option>
                          <option value="sent">Sent</option>
                          <option value="paid">Paid</option>
                        </select>
                        {inv.storage_path && (
                          <button
                            onClick={async () => { const url = await getInvoiceSignedUrl(inv.storage_path!); if (url) window.open(url, '_blank') }}
                            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                            <ExternalLink size={13} color="#00B4D8" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

        </div>

        <BottomNav />
      </div>

      {errorMsg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setErrorMsg(null)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 12px' }}>Something went wrong</h3>
            <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>{errorMsg}</p>
            <button onClick={() => setErrorMsg(null)} style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>OK</button>
          </div>
        </div>
      )}
    </>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { getAllCompanies, updateCompanyBilling, getCompanyInspections, getCompanyNotes, addCompanyNote } from '@/lib/admin-actions'
import { getFeatureFlags, upsertFeatureFlag } from '@/lib/feature-flags'
import type { FeatureFlags, FeatureKey } from '@/lib/feature-flags'
import { getPlan, getDefaultMemberCap, ADD_ONS, ADD_ON_ELIGIBLE_PLANS, type PlanKey } from '@/lib/pricing'
import { useAuth } from '@/contexts/auth-context'
import { Search, Ghost, X, Plus, ChevronRight, Lock, LayoutGrid } from 'lucide-react'

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  demo:           { bg: '#F0F4F8', color: '#94A3B8' },
  starter:        { bg: '#E0F7FC', color: '#0097B2' },
  growth:         { bg: '#D1FAE5', color: '#065F46' },
  pro:            { bg: '#EDE9FE', color: '#5B21B6' },
  enterprise:     { bg: '#FEF3C7', color: '#92400E' },
  legacy_starter: { bg: '#FFF0E8', color: '#C2410C' },
}

const STATUS_COLORS: Record<string, string> = {
  queued: '#94A3B8', pending_arrival: '#94A3B8', on_lot: '#00B4D8', in_progress: '#8B5CF6', one_off: '#F97316', released: '#10B981',
}

const CORE_FLAG_DEFS: { key: FeatureKey; label: string }[] = [
  { key: 'send_to_inspector', label: 'Send to Inspector' },
  { key: 'locations',         label: 'Locations'          },
  { key: 'team_members',      label: 'Team Members'        },
  { key: 'lot_map',           label: 'Lot Map'             },
  { key: 'white_label',       label: 'White Label PDF'     },
]

const TIERS = ['demo', 'legacy_starter', 'starter', 'growth', 'pro', 'enterprise']

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? '#00B4D8' : '#E1E8F0',
        border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 200ms', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2,
        width: 18, height: 18, borderRadius: 9, background: '#FFF',
        transition: 'left 200ms', boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }} />
    </button>
  )
}

export default function AdminCustomers() {
  const { setImpersonatedCompany } = useAuth()
  const [companies, setCompanies] = useState<Record<string, unknown>[]>([])
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null)
  const [inspections, setInspections] = useState<Record<string, unknown>[]>([])
  const [notes, setNotes] = useState<Record<string, unknown>[]>([])
  const [flags, setFlags] = useState<FeatureFlags | null>(null)
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editBilling, setEditBilling] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    getAllCompanies().then(data => { setCompanies(data as Record<string, unknown>[]); setLoading(false) })
  }, [])

  const openCompany = useCallback(async (company: Record<string, unknown>) => {
    setSelected(company)
    setEditBilling({
      reports_used: company.reports_used,
      reports_included: company.reports_included,
      subscription_tier: company.subscription_tier,
      billing_interval: (company.billing_interval as string) ?? 'monthly',
    })
    const [ins, n, f] = await Promise.all([
      getCompanyInspections(company.id as string),
      getCompanyNotes(company.id as string),
      getFeatureFlags(company.id as string),
    ])
    setInspections(ins as Record<string, unknown>[])
    setNotes(n as Record<string, unknown>[])
    setFlags(f)
  }, [])

  const saveBilling = async () => {
    if (!selected || !editBilling) return
    setSaving(true)
    // Auto-derive legacy_pricing from tier
    const legacy_pricing = editBilling.subscription_tier === 'legacy_starter'
    const payload = { ...editBilling, legacy_pricing } as Parameters<typeof updateCompanyBilling>[1]
    await updateCompanyBilling(selected.id as string, payload)
    const updated = { ...editBilling, legacy_pricing }
    setCompanies(prev => prev.map(c => c.id === selected.id ? { ...c, ...updated } : c))
    setSelected(prev => prev ? { ...prev, ...updated } : prev)
    setSaving(false)
  }

  const handleAddNote = async () => {
    if (!selected || !newNote.trim()) return
    await addCompanyNote(selected.id as string, newNote.trim())
    setNotes(prev => [{ id: Date.now(), note: newNote.trim(), created_at: new Date().toISOString() }, ...prev])
    setNewNote('')
  }

  const handleFlagToggle = async (key: FeatureKey, enabled: boolean) => {
    if (!selected || !flags) return
    const config = flags[key]?.config ?? {}
    if (key === 'team_members' && enabled && !config.cap) Object.assign(config, { cap: 3 })
    await upsertFeatureFlag(selected.id as string, key, enabled, config)
    setFlags(prev => prev ? { ...prev, [key]: { ...prev[key], enabled, config } } : prev)
  }

  const handleCapChange = async (cap: number) => {
    if (!selected || !flags) return
    const enabled = flags.team_members?.enabled ?? true
    await upsertFeatureFlag(selected.id as string, 'team_members', enabled, { cap })
    setFlags(prev => prev ? { ...prev, team_members: { ...prev.team_members, config: { cap } } } : prev)
  }

  const filtered = companies.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || (c.name as string)?.toLowerCase().includes(q)
    const matchTier = !tierFilter || c.subscription_tier === tierFilter
    return matchSearch && matchTier
  })

  // ── Derived billing display values ─────────────────────────────────────────
  const currentTier = (editBilling?.subscription_tier as string) ?? 'starter'
  const currentInterval = (editBilling?.billing_interval as string) ?? 'monthly'
  const currentPlan = getPlan(currentTier)
  const isLegacyBilling = currentTier === 'legacy_starter'
  const isAddOnEligible = !isLegacyBilling && ADD_ON_ELIGIBLE_PLANS.has(currentTier as PlanKey)
  const planCap = getDefaultMemberCap(currentTier)
  const planCostDisplay = currentTier === 'enterprise' ? 'Custom'
    : currentTier === 'demo' ? 'Free'
    : currentInterval === 'annual'
      ? `$${currentPlan.annualCost.toLocaleString()}/yr`
      : `$${currentPlan.monthlyCost}/mo`

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>Customers ({companies.length})</h1>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..."
            style={{ height: 38, paddingLeft: 32, paddingRight: 12, border: '1px solid #E1E8F0', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#FFF', width: 220 }}
          />
        </div>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          style={{ height: 38, padding: '0 10px', border: '1px solid #E1E8F0', borderRadius: 10, fontSize: 13, background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
          <option value="">All Plans</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Company list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 72, background: '#E2E8F0', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <Search size={32} color="#94A3B8" style={{ display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#0D1B2A', margin: '0 0 4px' }}>No customers found</p>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>Try adjusting your search or filter</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(company => {
            const tier = (company.subscription_tier as string) ?? 'starter'
            const pc = PLAN_COLORS[tier] ?? PLAN_COLORS.starter
            const used = (company.reports_used as number) ?? 0
            const inc = (company.reports_included as number) ?? 1
            const pct = Math.min(100, (used / Math.max(inc, 1)) * 100)
            const barColor = pct >= 100 ? '#EF4444' : pct >= 80 ? '#F4A62A' : '#00B4D8'
            const ageDays = Math.floor((Date.now() - new Date(company.created_at as string).getTime()) / 86400000)
            return (
              <div key={company.id as string}
                onClick={() => openCompany(company)}
                style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'box-shadow 150ms' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(13,27,42,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.name as string}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: pc.bg, color: pc.color, flexShrink: 0 }}>{tier.toUpperCase()}</span>
                    {(company.legacy_pricing as boolean) && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: '#FFF0E8', color: '#C2410C', flexShrink: 0 }}>LEGACY</span>
                    )}
                    <span style={{ fontSize: 12, color: '#94A3B8', flexShrink: 0 }}>{ageDays}d old</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: '#F0F4F8', borderRadius: 2, maxWidth: 200 }}>
                      <div style={{ height: 4, width: `${pct}%`, background: barColor, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#4A5568' }}>{used}/{inc} reports</span>
                  </div>
                </div>
                <ChevronRight size={16} color="#94A3B8" />
              </div>
            )
          })}
        </div>
      )}

      {/* Slide-over */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div style={{ flex: 1, background: 'rgba(13,27,42,0.4)' }} onClick={() => setSelected(null)} />
          <div style={{ width: 480, background: '#FFF', overflowY: 'auto', boxShadow: '-8px 0 32px rgba(13,27,42,0.12)' }}>

            {/* Header */}
            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #E1E8F0', position: 'sticky', top: 0, background: '#FFF', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>{selected.name as string}</h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: (PLAN_COLORS[selected.subscription_tier as string] ?? PLAN_COLORS.starter).bg, color: (PLAN_COLORS[selected.subscription_tier as string] ?? PLAN_COLORS.starter).color }}>
                      {(selected.subscription_tier as string ?? 'starter').toUpperCase()}
                    </span>
                    {(selected.legacy_pricing as boolean) && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FFF0E8', color: '#C2410C', border: '1px solid #FED7AA' }}>
                        LEGACY PRICING
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#94A3B8' }}>{Math.floor((Date.now() - new Date(selected.created_at as string).getTime()) / 86400000)} days old</span>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{ width: 32, height: 32, borderRadius: 16, background: '#F0F4F8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} color="#4A5568" />
                </button>
              </div>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Ghost Mode */}
              <button
                onClick={() => { setImpersonatedCompany(selected as Parameters<typeof setImpersonatedCompany>[0]); setSelected(null) }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', background: '#7C3AED', color: '#FFF', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}
              >
                <Ghost size={16} /> Enter Ghost Mode
              </button>

              {/* Billing Controls */}
              <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>Billing Controls</p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Reports Used</label>
                    <input type="number" value={(editBilling?.reports_used as number) ?? 0}
                      onChange={e => setEditBilling(b => ({ ...b!, reports_used: parseInt(e.target.value) }))}
                      style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Reports Included</label>
                    <input type="number" value={(editBilling?.reports_included as number) ?? 30}
                      onChange={e => setEditBilling(b => ({ ...b!, reports_included: parseInt(e.target.value) }))}
                      style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Plan</label>
                    <select value={(editBilling?.subscription_tier as string) ?? 'starter'}
                      onChange={e => setEditBilling(b => ({ ...b!, subscription_tier: e.target.value }))}
                      style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Billing Interval</label>
                    <select value={(editBilling?.billing_interval as string) ?? 'monthly'}
                      onChange={e => setEditBilling(b => ({ ...b!, billing_interval: e.target.value }))}
                      style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                      <option value="monthly">Monthly</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                </div>

                {/* Plan pricing info */}
                <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#64748B' }}>{currentPlan.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0D1B2A' }}>{planCostDisplay}</span>
                    {currentTier !== 'enterprise' && currentTier !== 'demo' && (
                      <span style={{ fontSize: 11, color: '#94A3B8' }}>
                        +${currentPlan.additionalReportCost}/report overage · {currentPlan.reportsIncluded} included
                      </span>
                    )}
                  </div>
                </div>

                {isLegacyBilling && (
                  <div style={{ background: '#FFF0E8', borderRadius: 8, padding: '7px 12px', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, color: '#C2410C', fontWeight: 600 }}>Legacy pricing applies — original rates locked for this account.</span>
                  </div>
                )}

                <button onClick={saveBilling} disabled={saving}
                  style={{ width: '100%', height: 40, background: saving ? '#E1E8F0' : '#F4A62A', color: saving ? '#94A3B8' : '#0D1B2A', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

              {/* Feature Flags */}
              <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Feature Flags</p>
                {!flags ? (
                  <p style={{ fontSize: 13, color: '#94A3B8', margin: '12px 0 0' }}>Loading...</p>
                ) : CORE_FLAG_DEFS.map(f => {
                  const flag = flags[f.key]
                  const isOn = flag?.enabled ?? (f.key !== 'lot_map')
                  const cap = (flag?.config?.cap as number) ?? planCap ?? 3
                  return (
                    <div key={f.key}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #F0F4F8' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {!isOn && <Lock size={12} color="#94A3B8" />}
                          <span style={{ fontSize: 14, color: '#0D1B2A' }}>{f.label}</span>
                        </div>
                        <Toggle checked={isOn} onChange={v => handleFlagToggle(f.key, v)} />
                      </div>

                      {f.key === 'lot_map' && isOn && selected && (
                        <div style={{ padding: '10px 0', paddingLeft: 20, borderBottom: '1px solid #F0F4F8' }}>
                          <a href="/lot" target="_blank" rel="noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid #E1E8F0', background: '#F8FAFC', color: '#0D1B2A', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                            <LayoutGrid size={13} /> Edit Lot Layout
                          </a>
                        </div>
                      )}

                      {f.key === 'team_members' && isOn && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', paddingLeft: 20, borderBottom: '1px solid #F0F4F8' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 12, color: '#4A5568' }}>Member Cap</span>
                            <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 6 }}>
                              (plan default: {planCap === null ? '∞' : planCap})
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            {[3, 5, 10].map(n => (
                              <button key={n} onClick={() => handleCapChange(n)}
                                style={{ width: 36, height: 28, borderRadius: 8, border: cap === n ? 'none' : '1px solid #E1E8F0', background: cap === n ? '#00B4D8' : '#FFF', color: cap === n ? '#FFF' : '#4A5568', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add-Ons — only for non-legacy starter/growth */}
              {isAddOnEligible && (
                <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Add-Ons</p>
                  {!flags ? (
                    <p style={{ fontSize: 13, color: '#94A3B8', margin: '12px 0 0' }}>Loading...</p>
                  ) : ADD_ONS.map(addon => {
                    const flagKey = addon.key as FeatureKey
                    const flag = flags[flagKey]
                    const isOn = flag?.enabled ?? (flagKey === 'white_label')
                    const price = currentInterval === 'annual'
                      ? `$${addon.annualCost}/yr`
                      : `$${addon.monthlyCost}/mo`
                    return (
                      <div key={addon.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #F0F4F8' }}>
                        <div>
                          <span style={{ fontSize: 14, color: '#0D1B2A' }}>{addon.name}</span>
                          <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 8 }}>{price}</span>
                          <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{addon.description}</p>
                        </div>
                        <Toggle checked={isOn} onChange={v => handleFlagToggle(flagKey, v)} />
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Recent Inspections */}
              <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>Recent Inspections</p>
                {inspections.length === 0 ? (
                  <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No inspections yet</p>
                ) : inspections.map(ins => {
                  const st = (ins.status as string) ?? 'queued'
                  return (
                    <div key={ins.id as string} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F0F4F8' }}>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: '#0D1B2A', margin: 0 }}>{ins.vin as string ?? '—'}</p>
                        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{[ins.year, ins.make, ins.model].filter(Boolean).join(' ') || '—'} · {new Date(ins.created_at as string).toLocaleDateString()}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${STATUS_COLORS[st] ?? '#94A3B8'}20`, color: STATUS_COLORS[st] ?? '#94A3B8' }}>{st}</span>
                        {ins.vehicle_score && <span style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A' }}>{ins.vehicle_score as number}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Notes */}
              <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>Notes</p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..."
                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                    style={{ flex: 1, height: 38, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                  <button onClick={handleAddNote}
                    style={{ width: 38, height: 38, background: '#00B4D8', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={16} color="#FFF" />
                  </button>
                </div>
                {notes.length === 0 ? <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No notes yet</p>
                  : notes.map(n => (
                    <div key={n.id as string} style={{ padding: '10px 0', borderBottom: '1px solid #F0F4F8' }}>
                      <p style={{ fontSize: 13, color: '#0D1B2A', margin: '0 0 4px' }}>{n.note as string}</p>
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{new Date(n.created_at as string).toLocaleDateString()}</p>
                    </div>
                  ))}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}

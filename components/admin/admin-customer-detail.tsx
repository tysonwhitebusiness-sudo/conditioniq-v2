'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getCompanyById, updateCompanyBilling, getCompanyInspections } from '@/lib/admin-actions'
import { getFeatureFlags, upsertFeatureFlag } from '@/lib/feature-flags'
import type { FeatureFlags, FeatureKey } from '@/lib/feature-flags'
import { getPlan, getDefaultMemberCap, ADD_ONS, type PlanKey } from '@/lib/pricing'
import { getPlanChangeRequests, updatePlanChangeRequestStatus } from '@/lib/billing-actions'
import type { PlanChangeRequest } from '@/lib/billing-actions'
import {
  logAdminActivity, getAccountActivityLog, getAccountNotes, addAccountNote,
  type AdminActivityRow, type AccountNote, type AdminActionType,
} from '@/lib/admin-activity-actions'
import { useAuth } from '@/contexts/auth-context'
import type { Company } from '@/contexts/auth-context'
import { ArrowLeft, Ghost, Plus, Lock, LayoutGrid, Clock } from 'lucide-react'

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  demo:           { bg: '#F0F4F8', color: '#94A3B8' },
  starter:        { bg: '#E0F7FC', color: '#0097B2' },
  growth:         { bg: '#D1FAE5', color: '#065F46' },
  pro:            { bg: '#EDE9FE', color: '#5B21B6' },
  enterprise:     { bg: '#FEF3C7', color: '#92400E' },
  legacy_starter: { bg: '#FFF0E8', color: '#C2410C' },
}

const STATUS_COLORS: Record<string, string> = {
  queued: '#94A3B8', pending_arrival: '#94A3B8', on_lot: '#00B4D8',
  pending_pickup: '#F59E0B', picked_up: '#10B981', completed: '#9333EA',
}

const CORE_FLAG_DEFS: { key: FeatureKey; label: string }[] = [
  { key: 'send_to_inspector', label: 'Send to Inspector' },
  { key: 'locations',         label: 'Locations'          },
  { key: 'team_members',      label: 'Team Members'        },
  { key: 'lot_map',           label: 'Lot Map'             },
  { key: 'lot_billing',       label: 'Lot Billing'         },
  { key: 'white_label',       label: 'White Label PDF'     },
  { key: 'dispatch',          label: 'Dispatch'            },
  { key: 'reporting_export',  label: 'Reporting & Export'  },
  { key: 'multi_location',    label: 'Multi-Location'      },
  { key: 'fmc_account',       label: 'FMC Account'         },
  { key: 'api_access',        label: 'API Access'          },
]

// Plan-gated/restricted flags show an amber lock (this is a paid-tier restriction,
// not just an admin-toggled-off feature) — other flags use a neutral lock color.
const RESTRICTED_FLAG_KEYS = new Set<FeatureKey>(['multi_location', 'fmc_account', 'api_access'])

const TIERS = ['demo', 'legacy_starter', 'starter', 'growth', 'pro', 'enterprise']

const ACTION_LABELS: Record<AdminActionType, string> = {
  flag_toggled: 'Feature Flag',
  plan_changed: 'Plan Change',
  report_limit_adjusted: 'Report Limits',
  member_cap_changed: 'Member Cap',
  ghost_mode_entered: 'Ghost Mode Entered',
  ghost_mode_exited: 'Ghost Mode Exited',
  role_changed: 'Role Change',
  note_added: 'Note Added',
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: checked ? '#00B4D8' : 'rgba(255,255,255,0.15)',
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

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#1B2D40', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
      {children}
    </div>
  )
}

function SH({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>{children}</p>
}

export default function AdminCustomerDetail() {
  const params = useParams()
  const router = useRouter()
  const { enterGhostMode, user } = useAuth()
  const companyId = params.id as string

  const [company, setCompany] = useState<Record<string, unknown> | null>(null)
  const [inspections, setInspections] = useState<Record<string, unknown>[]>([])
  const [notes, setNotes] = useState<AccountNote[]>([])
  const [flags, setFlags] = useState<FeatureFlags | null>(null)
  const [activity, setActivity] = useState<AdminActivityRow[]>([])
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editBilling, setEditBilling] = useState<Record<string, unknown> | null>(null)
  const [planRequests, setPlanRequests] = useState<PlanChangeRequest[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadingRequests(true)
    const c = await getCompanyById(companyId)
    setCompany(c as Record<string, unknown>)
    setEditBilling({
      reports_used: c.reports_used,
      reports_included: c.reports_included,
      subscription_tier: c.subscription_tier,
      billing_interval: (c as Record<string, unknown>).billing_interval ?? 'monthly',
    })
    const [ins, n, f, reqs, act] = await Promise.all([
      getCompanyInspections(companyId),
      getAccountNotes(companyId),
      getFeatureFlags(companyId),
      getPlanChangeRequests(companyId),
      getAccountActivityLog(companyId),
    ])
    setInspections(ins as Record<string, unknown>[])
    setNotes(n)
    setFlags(f)
    setPlanRequests(reqs)
    setActivity(act)
    setLoading(false)
    setLoadingRequests(false)
  }, [companyId])

  useEffect(() => { load() }, [load])

  const saveBilling = async () => {
    if (!company || !editBilling) return
    setSaving(true)
    const legacy_pricing = editBilling.subscription_tier === 'legacy_starter'
    const payload = { ...editBilling, legacy_pricing } as Parameters<typeof updateCompanyBilling>[1]
    await updateCompanyBilling(companyId, payload)

    const companyName = company.name as string
    const oldTier = company.subscription_tier as string
    const newTier = editBilling.subscription_tier as string
    const oldUsed = company.reports_used as number
    const newUsed = editBilling.reports_used as number
    const oldIncluded = company.reports_included as number
    const newIncluded = editBilling.reports_included as number

    if (newTier !== oldTier) {
      await logAdminActivity({
        accountId: companyId, actorId: user?.id ?? null, actionType: 'plan_changed',
        description: `Plan changed from ${oldTier} to ${newTier} for ${companyName}`,
        metadata: { oldTier, newTier },
      })
    }
    if (newUsed !== oldUsed || newIncluded !== oldIncluded) {
      await logAdminActivity({
        accountId: companyId, actorId: user?.id ?? null, actionType: 'report_limit_adjusted',
        description: `Report limits adjusted for ${companyName} (used ${oldUsed}→${newUsed}, included ${oldIncluded}→${newIncluded})`,
        metadata: { oldUsed, newUsed, oldIncluded, newIncluded },
      })
    }

    const updated = { ...editBilling, legacy_pricing }
    setCompany(prev => prev ? { ...prev, ...updated } : prev)
    setSaving(false)
    getAccountActivityLog(companyId).then(setActivity)
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    const note = await addAccountNote(companyId, user?.id ?? null, newNote.trim())
    if (note) setNotes(prev => [note, ...prev])
    setNewNote('')
    getAccountActivityLog(companyId).then(setActivity)
  }

  const handleFlagToggle = async (key: FeatureKey, enabled: boolean) => {
    if (!company || !flags) return
    const config = flags[key]?.config ?? {}
    if (key === 'team_members' && enabled && !config.cap) Object.assign(config, { cap: 3 })
    await upsertFeatureFlag(companyId, key, enabled, config)
    setFlags(prev => prev ? { ...prev, [key]: { ...prev[key], enabled, config } } : prev)
    const label = CORE_FLAG_DEFS.find(f => f.key === key)?.label ?? key
    await logAdminActivity({
      accountId: companyId, actorId: user?.id ?? null, actionType: 'flag_toggled',
      description: `${label} ${enabled ? 'enabled' : 'disabled'} for ${company.name as string}`,
      metadata: { flag: key, enabled },
    })
    getAccountActivityLog(companyId).then(setActivity)
  }

  const handleCapChange = async (cap: number) => {
    if (!company || !flags) return
    const enabled = flags.team_members?.enabled ?? true
    const oldCap = (flags.team_members?.config?.cap as number) ?? null
    await upsertFeatureFlag(companyId, 'team_members', enabled, { cap })
    setFlags(prev => prev ? { ...prev, team_members: { ...prev.team_members, config: { cap } } } : prev)
    await logAdminActivity({
      accountId: companyId, actorId: user?.id ?? null, actionType: 'member_cap_changed',
      description: `Member cap changed from ${oldCap ?? 'default'} to ${cap} for ${company.name as string}`,
      metadata: { oldCap, newCap: cap },
    })
    getAccountActivityLog(companyId).then(setActivity)
  }

  if (loading || !company) {
    return (
      <div style={{ padding: 24, maxWidth: 800 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 100, background: 'rgba(255,255,255,0.06)', borderRadius: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      </div>
    )
  }

  const currentTier = (editBilling?.subscription_tier as string) ?? 'starter'
  const currentInterval = (editBilling?.billing_interval as string) ?? 'monthly'
  const currentPlan = getPlan(currentTier)
  const isLegacyBilling = currentTier === 'legacy_starter'
  const planAddOns = ADD_ONS.filter(a => a.eligiblePlans.includes(currentTier as PlanKey))
  const isAddOnEligible = !isLegacyBilling && planAddOns.length > 0
  const planCap = getDefaultMemberCap(currentTier)
  const planCostDisplay = currentTier === 'enterprise' ? 'Custom'
    : currentTier === 'demo' ? 'Free'
    : currentInterval === 'annual'
      ? `$${currentPlan.annualCost.toLocaleString()}/yr`
      : `$${currentPlan.monthlyCost}/mo`

  return (
    <div style={{ padding: 24, maxWidth: 800 }}>
      <button
        onClick={() => router.push('/admin/customers')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 16, color: '#94A3B8', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
      >
        <ArrowLeft size={15} /> Back to Customers
      </button>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#F1F5F9', margin: 0 }}>{company.name as string}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: (PLAN_COLORS[company.subscription_tier as string] ?? PLAN_COLORS.starter).bg, color: (PLAN_COLORS[company.subscription_tier as string] ?? PLAN_COLORS.starter).color }}>
            {(company.subscription_tier as string ?? 'starter').toUpperCase()}
          </span>
          {(company.legacy_pricing as boolean) && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FFF0E8', color: '#C2410C', border: '1px solid #FED7AA' }}>
              LEGACY PRICING
            </span>
          )}
          <span style={{ fontSize: 12, color: '#94A3B8' }}>{Math.floor((Date.now() - new Date(company.created_at as string).getTime()) / 86400000)} days old</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Ghost Mode */}
        <button
          onClick={() => enterGhostMode(company as unknown as Company)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', background: '#0D1B2A', color: '#FFF', borderRadius: 12, border: '1.5px solid #00B4D8', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}
        >
          <Ghost size={16} color="#00B4D8" /> Enter Ghost Mode
        </button>

        {/* Billing Controls */}
        <SectionCard>
          <SH>Billing Controls</SH>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Reports Used</label>
              <input type="number" value={(editBilling?.reports_used as number) ?? 0}
                onChange={e => setEditBilling(b => ({ ...b!, reports_used: parseInt(e.target.value) }))}
                style={{ width: '100%', height: 38, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#0D1B2A', color: '#F1F5F9' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Reports Included</label>
              <input type="number" value={(editBilling?.reports_included as number) ?? 30}
                onChange={e => setEditBilling(b => ({ ...b!, reports_included: parseInt(e.target.value) }))}
                style={{ width: '100%', height: 38, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: '#0D1B2A', color: '#F1F5F9' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Plan</label>
              <select value={(editBilling?.subscription_tier as string) ?? 'starter'}
                onChange={e => setEditBilling(b => ({ ...b!, subscription_tier: e.target.value }))}
                style={{ width: '100%', height: 38, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#0D1B2A', color: '#F1F5F9', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Billing Interval</label>
              <select value={(editBilling?.billing_interval as string) ?? 'monthly'}
                onChange={e => setEditBilling(b => ({ ...b!, billing_interval: e.target.value }))}
                style={{ width: '100%', height: 38, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#0D1B2A', color: '#F1F5F9', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#94A3B8' }}>{currentPlan.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#F1F5F9' }}>{planCostDisplay}</span>
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
            style={{ width: '100%', height: 40, background: saving ? 'rgba(255,255,255,0.1)' : '#00B4D8', color: saving ? '#94A3B8' : '#FFFFFF', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </SectionCard>

        {/* Feature Flags */}
        <SectionCard>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Feature Flags</p>
          {!flags ? (
            <p style={{ fontSize: 13, color: '#94A3B8', margin: '12px 0 0' }}>Loading...</p>
          ) : CORE_FLAG_DEFS.map(f => {
            const flag = flags[f.key]
            const isOn = flag?.enabled ?? (f.key !== 'lot_map' && f.key !== 'lot_billing')
            const cap = (flag?.config?.cap as number) ?? planCap ?? 3
            const isRestricted = RESTRICTED_FLAG_KEYS.has(f.key)
            return (
              <div key={f.key}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!isOn && <Lock size={12} color={isRestricted ? '#F4A62A' : '#94A3B8'} />}
                    <span style={{ fontSize: 14, color: '#F1F5F9' }}>{f.label}</span>
                  </div>
                  <Toggle checked={isOn} onChange={v => handleFlagToggle(f.key, v)} />
                </div>

                {f.key === 'lot_map' && isOn && (
                  <div style={{ padding: '10px 0', paddingLeft: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <a href="/lot" target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#F1F5F9', fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                      <LayoutGrid size={13} /> Edit Lot Layout
                    </a>
                  </div>
                )}

                {f.key === 'team_members' && isOn && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', paddingLeft: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>Member Cap</span>
                      <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 6 }}>
                        (plan default: {planCap === null ? '∞' : planCap})
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[3, 5, 10].map(n => (
                        <button key={n} onClick={() => handleCapChange(n)}
                          style={{ width: 36, height: 28, borderRadius: 8, border: cap === n ? 'none' : '1px solid rgba(255,255,255,0.1)', background: cap === n ? '#00B4D8' : 'transparent', color: cap === n ? '#FFF' : '#94A3B8', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </SectionCard>

        {/* Add-Ons */}
        {isAddOnEligible && (
          <SectionCard>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Add-Ons</p>
            {!flags ? (
              <p style={{ fontSize: 13, color: '#94A3B8', margin: '12px 0 0' }}>Loading...</p>
            ) : planAddOns.map(addon => {
              const flagKey = addon.key as FeatureKey
              const flag = flags[flagKey]
              const isOn = flag?.enabled ?? false
              const price = currentInterval === 'annual'
                ? `$${addon.annualCost}/yr`
                : `$${addon.monthlyCost}/mo`
              return (
                <div key={addon.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div>
                    <span style={{ fontSize: 14, color: '#F1F5F9' }}>{addon.name}</span>
                    <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 8 }}>{price}</span>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{addon.description}</p>
                  </div>
                  <Toggle checked={isOn} onChange={v => handleFlagToggle(flagKey, v)} />
                </div>
              )
            })}
          </SectionCard>
        )}

        {/* Plan Change Requests */}
        <SectionCard>
          <SH>Plan Change Requests</SH>
          {loadingRequests ? (
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Loading...</p>
          ) : planRequests.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No requests</p>
          ) : planRequests.map((req, i) => (
            <div key={req.id} style={{ padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>→ {req.requested_plan}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: req.status === 'pending' ? '#FEF3C7' : req.status === 'reviewed' ? '#E0F7FC' : '#D1FAE5', color: req.status === 'pending' ? '#92400E' : req.status === 'reviewed' ? '#0097B2' : '#065F46' }}>
                    {req.status.toUpperCase()}
                  </span>
                </div>
                <select
                  value={req.status}
                  onChange={async e => {
                    const newStatus = e.target.value as 'pending' | 'reviewed' | 'completed'
                    await updatePlanChangeRequestStatus(req.id, newStatus)
                    setPlanRequests(prev => prev.map(r => r.id === req.id ? { ...r, status: newStatus } : r))
                  }}
                  style={{ height: 28, padding: '0 6px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11, background: '#0D1B2A', color: '#F1F5F9', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              {req.notes && <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 4px', lineHeight: 1.5 }}>{req.notes}</p>}
              <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>
                Requested {new Date(req.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          ))}
        </SectionCard>

        {/* Recent Inspections */}
        <SectionCard>
          <SH>Recent Inspections</SH>
          {inspections.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No inspections yet</p>
          ) : inspections.map(ins => {
            const st = (ins.status as string) ?? 'queued'
            return (
              <div key={ins.id as string} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: '#F1F5F9', margin: 0 }}>{ins.vin as string ?? '—'}</p>
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{[ins.year, ins.make, ins.model].filter(Boolean).join(' ') || '—'} · {new Date(ins.created_at as string).toLocaleDateString()}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${STATUS_COLORS[st] ?? '#94A3B8'}20`, color: STATUS_COLORS[st] ?? '#94A3B8' }}>{st}</span>
                  {Boolean(ins.vehicle_score) && <span style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>{ins.vehicle_score as number}</span>}
                </div>
              </div>
            )
          })}
        </SectionCard>

        {/* Activity Log */}
        <SectionCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Clock size={14} color="#94A3B8" />
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Activity Log</p>
          </div>
          {activity.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No activity recorded yet</p>
          ) : activity.map(a => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', color: '#CBD5E1' }}>
                  {ACTION_LABELS[a.action_type] ?? a.action_type}
                </span>
                <span style={{ fontSize: 11, color: '#94A3B8' }}>{a.actorName ?? 'System'}</span>
              </div>
              <p style={{ fontSize: 13, color: '#F1F5F9', margin: '0 0 2px' }}>{a.description}</p>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{new Date(a.created_at).toLocaleString()}</p>
            </div>
          ))}
        </SectionCard>

        {/* Notes */}
        <SectionCard>
          <SH>Notes</SH>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..."
              onKeyDown={e => e.key === 'Enter' && handleAddNote()}
              style={{ flex: 1, height: 38, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#0D1B2A', color: '#F1F5F9' }} />
            <button onClick={handleAddNote}
              style={{ width: 38, height: 38, background: '#00B4D8', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={16} color="#FFF" />
            </button>
          </div>
          {notes.length === 0 ? <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No notes yet</p>
            : notes.map(n => (
              <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <p style={{ fontSize: 13, color: '#F1F5F9', margin: '0 0 4px' }}>{n.note_text}</p>
                <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{n.authorName ?? 'Unknown'} · {new Date(n.created_at).toLocaleDateString()}</p>
              </div>
            ))}
        </SectionCard>

      </div>
    </div>
  )
}

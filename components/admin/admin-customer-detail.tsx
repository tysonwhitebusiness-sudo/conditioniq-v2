'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getCompanyById, updateCompanyBilling, getCompanyInspections, getCompanyUsage, getPayPerUseStatement, type PayPerUseMonth } from '@/lib/admin-actions'
import type { UsageState } from '@/lib/usage-state'
import { getFeatureFlags, upsertFeatureFlag } from '@/lib/feature-flags'
import type { FeatureFlags, FeatureKey } from '@/lib/feature-flags'
import { getPlan, getDefaultMemberCap, normalizePlanKey, effectiveMonthlyPrice, effectiveAnnualPrice, formatPlanPrice, PUBLIC_PLAN_ORDER } from '@/lib/pricing'
import { getPlanChangeRequests, updatePlanChangeRequestStatus } from '@/lib/billing-actions'
import type { PlanChangeRequest } from '@/lib/billing-actions'
import {
  logAdminActivity, getAccountActivityLog, getAccountNotes, addAccountNote,
  type AdminActivityRow, type AccountNote, type AdminActionType,
} from '@/lib/admin-activity-actions'
import { useAuth } from '@/contexts/auth-context'
import type { Company } from '@/contexts/auth-context'
import { ArrowLeft, Ghost, Plus, Lock, LayoutGrid, Clock } from 'lucide-react'
import { PRIMARY, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  demo:       { bg: '#F0F4F8', color: GRAY_500 },
  pay_per_use: { bg: '#DCFCE7', color: '#166534' },
  operations: { bg: '#E0F7FC', color: '#0097B2' },
  pro:        { bg: '#EDE9FE', color: '#5B21B6' },
  enterprise: { bg: '#FEF3C7', color: '#92400E' },
}

// UTC to match how the month is counted.
const monthName = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

// Empty input means "use the plan default" (null in the database).
function parseOptionalNumber(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

const STATUS_COLORS: Record<string, string> = {
  queued: GRAY_500, pending_arrival: GRAY_500, on_lot: '#00B4D8',
  pending_pickup: '#F59E0B', picked_up: '#10B981', completed: '#9333EA',
}

const CORE_FLAG_DEFS: { key: FeatureKey; label: string }[] = [
  { key: 'locations',         label: 'Locations'          },
  { key: 'team_members',      label: 'Team Members'        },
  { key: 'lot_map',           label: 'Lot Map'             },
  { key: 'lot_billing',       label: 'Lot Billing'         },
  { key: 'white_label',       label: 'White Label PDF'     },
  { key: 'reporting_export',  label: 'Reporting & Export'  },
  { key: 'multi_location',    label: 'Multi-Location'      },
  { key: 'fmc_account',       label: 'FMC Account'         },
  { key: 'api_access',        label: 'API Access'          },
]

// Plan-gated/restricted flags show an amber lock (this is a paid-tier restriction,
// not just an admin-toggled-off feature) — other flags use a neutral lock color.
const RESTRICTED_FLAG_KEYS = new Set<FeatureKey>(['multi_location', 'fmc_account', 'api_access'])

const TIERS = PUBLIC_PLAN_ORDER

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
        background: checked ? '#00B4D8' : GRAY_300,
        border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 200ms', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2,
        width: 18, height: 18, borderRadius: 9, background: '#FFF',
        transition: 'left 200ms', boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
      }} />
    </button>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 16, padding: 20 }}>
      {children}
    </div>
  )
}

function SH({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>{children}</p>
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
  const [usage, setUsage] = useState<UsageState | null>(null)
  const [ppu, setPpu] = useState<{ lastMonth: PayPerUseMonth; thisMonth: PayPerUseMonth } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadingRequests(true)
    const c = await getCompanyById(companyId)
    setCompany(c as Record<string, unknown>)
    setEditBilling({
      reports_included: c.reports_included ?? null,
      subscription_tier: normalizePlanKey(c.subscription_tier),
      billing_interval: (c as Record<string, unknown>).billing_interval ?? 'monthly',
      price_override_monthly: c.price_override_monthly ?? null,
      price_override_annual: c.price_override_annual ?? null,
    })
    const [ins, n, f, reqs, act, u] = await Promise.all([
      getCompanyInspections(companyId),
      getAccountNotes(companyId),
      getFeatureFlags(companyId),
      getPlanChangeRequests(companyId),
      getAccountActivityLog(companyId),
      getCompanyUsage(companyId),
    ])
    setUsage(u)
    setPpu(u.usageBased ? await getPayPerUseStatement(companyId) : null)
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
    setSaveError(null)
    try {
      await updateCompanyBilling(companyId, editBilling as Parameters<typeof updateCompanyBilling>[1])
    } catch (e: any) {
      setSaveError(e?.message ?? 'Could not save billing changes')
      setSaving(false)
      return
    }

    const companyName = company.name as string
    const oldTier = normalizePlanKey(company.subscription_tier as string)
    const newTier = editBilling.subscription_tier as string
    const oldIncluded = (company.reports_included as number | null) ?? null
    const newIncluded = (editBilling.reports_included as number | null) ?? null
    const oldPrice = (company.price_override_monthly as number | null) ?? null
    const newPrice = (editBilling.price_override_monthly as number | null) ?? null

    if (newTier !== oldTier) {
      await logAdminActivity({
        accountId: companyId, actorId: user?.id ?? null, actionType: 'plan_changed',
        description: `Plan changed from ${oldTier} to ${newTier} for ${companyName}`,
        metadata: { oldTier, newTier },
      })
    }
    if (newIncluded !== oldIncluded) {
      await logAdminActivity({
        accountId: companyId, actorId: user?.id ?? null, actionType: 'report_limit_adjusted',
        description: `Included reports for ${companyName}: ${oldIncluded ?? 'plan default'} → ${newIncluded ?? 'plan default'}`,
        metadata: { oldIncluded, newIncluded },
      })
    }
    if (newPrice !== oldPrice) {
      await logAdminActivity({
        accountId: companyId, actorId: user?.id ?? null, actionType: 'plan_changed',
        description: `Held monthly price for ${companyName}: ${oldPrice ?? 'list price'} → ${newPrice ?? 'list price'}`,
        metadata: { oldPrice, newPrice },
      })
    }

    // Reload rather than patching local state: saving may also have started a
    // demo trial clock, which only the server sets.
    await load()
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
      <div className="adm-page" style={{ maxWidth: 800 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: 100, background: GRAY_300, borderRadius: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      </div>
    )
  }

  const currentTier = normalizePlanKey(editBilling?.subscription_tier as string)
  const currentInterval = (editBilling?.billing_interval as string) ?? 'monthly'
  const currentPlan = getPlan(currentTier)
  const planCap = getDefaultMemberCap(currentTier)
  const billingFields = {
    subscription_tier: currentTier,
    price_override_monthly: (editBilling?.price_override_monthly as number | null) ?? null,
    price_override_annual: (editBilling?.price_override_annual as number | null) ?? null,
  }
  const hasHeldPrice = billingFields.price_override_monthly != null || billingFields.price_override_annual != null
  const effectivePrice = currentInterval === 'annual' ? effectiveAnnualPrice(billingFields) : effectiveMonthlyPrice(billingFields)
  const planCostDisplay = currentPlan.usageBased ? formatPlanPrice(currentPlan)
    : currentTier === 'demo' ? 'Free'
    : effectivePrice === null ? 'Custom'
    : `$${effectivePrice.toLocaleString()}/${currentInterval === 'annual' ? 'yr' : 'mo'}`
  const companyPlanKey = normalizePlanKey(company.subscription_tier as string)
  const companyHasHeldPrice = company.price_override_monthly != null || company.price_override_annual != null
  const trialEnds = company.trial_expires_at ? new Date(company.trial_expires_at as string) : null

  return (
    <div className="adm-page" style={{ maxWidth: 800 }}>
      <button
        onClick={() => router.push('/admin/customers')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 16, color: GRAY_500, fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
      >
        <ArrowLeft size={15} /> Back to Customers
      </button>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: GRAY_900, margin: 0, overflowWrap: 'anywhere' }}>{company.name as string}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: PLAN_COLORS[companyPlanKey].bg, color: PLAN_COLORS[companyPlanKey].color }}>
            {getPlan(companyPlanKey).name.toUpperCase()}
          </span>
          {companyHasHeldPrice && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#FFF0E8', color: '#C2410C', border: '1px solid #FED7AA' }}>
              HELD PRICE
            </span>
          )}
          {companyPlanKey === 'demo' && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: usage?.demo.expired ? '#FEE2E2' : '#E0F7FC', color: usage?.demo.expired ? '#991B1B' : '#0097B2' }}>
              {trialEnds ? `${usage?.demo.expired ? 'DEMO ENDED' : 'DEMO ENDS'} ${trialEnds.toLocaleDateString()}` : 'NO TRIAL END SET'}
            </span>
          )}
          <span style={{ fontSize: 12, color: GRAY_500 }}>{Math.floor((Date.now() - new Date(company.created_at as string).getTime()) / 86400000)} days old</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Ghost Mode */}
        <button
          onClick={() => enterGhostMode(company as unknown as Company)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', background: GRAY_900, color: WHITE, borderRadius: 12, border: '1.5px solid #00B4D8', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}
        >
          <Ghost size={16} color={PRIMARY} /> Enter Ghost Mode
        </button>

        {/* Billing Controls */}
        <SectionCard>
          <SH>Billing Controls</SH>

          {/* Usage this cycle — derived from generated reports and vehicle arrivals/releases, not editable */}
          {usage?.usageBased && ppu && (
            <div className="adm-g2" style={{ gap: 12, marginBottom: 12 }}>
              {[
                { label: `Last month (${monthName(ppu.lastMonth.start)}) to invoice`, m: ppu.lastMonth },
                { label: `This month (${monthName(ppu.thisMonth.start)}) so far`, m: ppu.thisMonth },
              ].map(({ label, m }) => (
                <div key={label} style={{ background: GRAY_100, borderRadius: 8, padding: '8px 12px' }}>
                  <p style={{ fontSize: 11, color: GRAY_500, margin: '0 0 2px' }}>{label}</p>
                  <p style={{ fontSize: 15, fontWeight: 700, color: GRAY_900, margin: 0 }}>
                    ${m.amount.toFixed(2)}
                    <span style={{ fontSize: 11, fontWeight: 500, color: GRAY_500, marginLeft: 6 }}>
                      {m.reports} {m.reports === 1 ? 'report' : 'reports'} × ${m.rate.toFixed(2)}
                    </span>
                  </p>
                </div>
              ))}
              <p style={{ gridColumn: '1 / -1', fontSize: 11, color: GRAY_500, margin: 0 }}>
                Pay Per Use: every generated report in the calendar month (UTC), invoiced manually.
              </p>
            </div>
          )}
          {usage && !usage.usageBased && (
            <div className="adm-g2" style={{ gap: 12, marginBottom: 12 }}>
              <div style={{ background: GRAY_100, borderRadius: 8, padding: '8px 12px' }}>
                <p style={{ fontSize: 11, color: GRAY_500, margin: '0 0 2px' }}>
                  Reports {usage.demo.isDemo ? 'this trial' : 'this cycle'}
                </p>
                <p style={{ fontSize: 15, fontWeight: 700, color: usage.isOverage ? '#F4A62A' : GRAY_900, margin: 0 }}>
                  {usage.used} / {usage.included === null ? '∞' : usage.included}
                </p>
              </div>
              <div style={{ background: GRAY_100, borderRadius: 8, padding: '8px 12px' }}>
                <p style={{ fontSize: 11, color: GRAY_500, margin: '0 0 2px' }}>Peak vehicles this cycle</p>
                <p style={{ fontSize: 15, fontWeight: 700, color: usage.vehicles.isOverage ? '#F4A62A' : GRAY_900, margin: 0 }}>
                  {usage.vehicles.used} / {usage.vehicles.included === null ? '∞' : usage.vehicles.included}
                  <span style={{ fontSize: 11, fontWeight: 500, color: GRAY_500, marginLeft: 6 }}>({usage.vehicles.current} now)</span>
                </p>
              </div>
              <p style={{ gridColumn: '1 / -1', fontSize: 11, color: GRAY_500, margin: 0 }}>
                Cycle {new Date(usage.cycle.start).toLocaleDateString()} to {new Date(usage.cycle.end).toLocaleDateString()}
              </p>
            </div>
          )}

          <div className="adm-g3" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <label htmlFor="billing-reports-included" style={{ fontSize: 11, color: GRAY_500, display: 'block', marginBottom: 4 }}>Reports included</label>
              <input id="billing-reports-included" type="number" min={0}
                placeholder={currentPlan.reportsIncluded === null ? 'Unlimited' : `${currentPlan.reportsIncluded} (plan)`}
                value={(editBilling?.reports_included as number | null) ?? ''}
                onChange={e => setEditBilling(b => ({ ...b!, reports_included: parseOptionalNumber(e.target.value) }))}
                style={{ width: '100%', height: 38, border: `1px solid ${GRAY_300}`, borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: WHITE, color: GRAY_900 }} />
            </div>
            <div>
              <label htmlFor="billing-held-monthly" style={{ fontSize: 11, color: GRAY_500, display: 'block', marginBottom: 4 }}>Held monthly price</label>
              <input id="billing-held-monthly" type="number" min={0} step="0.01"
                placeholder={currentPlan.monthlyCost === null ? 'Custom' : `$${currentPlan.monthlyCost} (list)`}
                value={(editBilling?.price_override_monthly as number | null) ?? ''}
                onChange={e => setEditBilling(b => ({ ...b!, price_override_monthly: parseOptionalNumber(e.target.value) }))}
                style={{ width: '100%', height: 38, border: `1px solid ${GRAY_300}`, borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: WHITE, color: GRAY_900 }} />
            </div>
            <div>
              <label htmlFor="billing-held-annual" style={{ fontSize: 11, color: GRAY_500, display: 'block', marginBottom: 4 }}>Held annual price</label>
              <input id="billing-held-annual" type="number" min={0} step="0.01"
                placeholder={currentPlan.annualCost === null ? 'Custom' : `$${currentPlan.annualCost} (list)`}
                value={(editBilling?.price_override_annual as number | null) ?? ''}
                onChange={e => setEditBilling(b => ({ ...b!, price_override_annual: parseOptionalNumber(e.target.value) }))}
                style={{ width: '100%', height: 38, border: `1px solid ${GRAY_300}`, borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: WHITE, color: GRAY_900 }} />
            </div>
          </div>

          <div className="adm-g2" style={{ gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: GRAY_500, display: 'block', marginBottom: 4 }}>Plan</label>
              <select value={currentTier}
                onChange={e => setEditBilling(b => ({ ...b!, subscription_tier: e.target.value }))}
                style={{ width: '100%', height: 38, border: `1px solid ${GRAY_300}`, borderRadius: 8, padding: '0 10px', fontSize: 13, background: WHITE, color: GRAY_900, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                {TIERS.map(t => <option key={t} value={t}>{getPlan(t).name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: GRAY_500, display: 'block', marginBottom: 4 }}>Billing Interval</label>
              <select value={(editBilling?.billing_interval as string) ?? 'monthly'}
                onChange={e => setEditBilling(b => ({ ...b!, billing_interval: e.target.value }))}
                style={{ width: '100%', height: 38, border: `1px solid ${GRAY_300}`, borderRadius: 8, padding: '0 10px', fontSize: 13, background: WHITE, color: GRAY_900, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>

          <div style={{ background: GRAY_100, borderRadius: 8, padding: '8px 12px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 12px', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: GRAY_500 }}>{currentPlan.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: GRAY_900 }}>{planCostDisplay}</span>
              {currentTier !== 'enterprise' && currentTier !== 'demo' && !currentPlan.usageBased && (
                <span style={{ fontSize: 11, color: GRAY_500 }}>
                  {currentPlan.reportsIncluded} reports + ${currentPlan.additionalReportCost}/report · {currentPlan.vehiclesIncluded} vehicles + ${currentPlan.additionalVehicleCost}/vehicle
                </span>
              )}
            </div>
          </div>

          {hasHeldPrice && (
            <div style={{ background: '#FFF0E8', borderRadius: 8, padding: '7px 12px', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#C2410C', fontWeight: 600 }}>Held price: this account pays less than the {currentPlan.name} list price. Overage still applies at plan rates.</span>
            </div>
          )}

          {currentTier === 'demo' && normalizePlanKey(company.subscription_tier as string) !== 'demo' && (
            <div style={{ background: 'rgba(0,180,216,0.1)', borderRadius: 8, padding: '7px 12px', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#0891B2', fontWeight: 600 }}>Saving starts a 14-day demo. After 14 days or 5 reports, new inspections are blocked with an upgrade message.</span>
            </div>
          )}

          {saveError && (
            <div role="alert" style={{ background: '#FEE2E2', borderRadius: 8, padding: '7px 12px', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#991B1B', fontWeight: 600 }}>{saveError}</span>
            </div>
          )}

          <button onClick={saveBilling} disabled={saving}
            style={{ width: '100%', height: 40, background: saving ? GRAY_300 : '#00B4D8', color: saving ? GRAY_500 : '#FFFFFF', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </SectionCard>

        {/* Feature Flags */}
        <SectionCard>
          <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Feature Flags</p>
          {!flags ? (
            <p style={{ fontSize: 13, color: GRAY_500, margin: '12px 0 0' }}>Loading...</p>
          ) : CORE_FLAG_DEFS.map(f => {
            const flag = flags[f.key]
            const isOn = flag?.enabled ?? (f.key !== 'lot_map' && f.key !== 'lot_billing')
            const cap = (flag?.config?.cap as number) ?? planCap ?? 3
            const isRestricted = RESTRICTED_FLAG_KEYS.has(f.key)
            return (
              <div key={f.key}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${GRAY_300}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {!isOn && <Lock size={12} color={isRestricted ? '#F4A62A' : GRAY_500} />}
                    <span style={{ fontSize: 14, color: GRAY_900 }}>{f.label}</span>
                  </div>
                  <Toggle checked={isOn} onChange={v => handleFlagToggle(f.key, v)} />
                </div>

                {f.key === 'lot_map' && isOn && (
                  <div style={{ padding: '10px 0', paddingLeft: 20, borderBottom: `1px solid ${GRAY_300}` }}>
                    <a href="/lot" target="_blank" rel="noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: 8, border: `1px solid ${GRAY_300}`, background: GRAY_100, color: GRAY_900, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>
                      <LayoutGrid size={13} /> Edit Lot Layout
                    </a>
                  </div>
                )}

                {f.key === 'team_members' && isOn && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', paddingLeft: 20, borderBottom: `1px solid ${GRAY_300}` }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, color: GRAY_500 }}>Member Cap</span>
                      <span style={{ fontSize: 11, color: GRAY_500, marginLeft: 6 }}>
                        (plan default: {planCap === null ? '∞' : planCap})
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[3, 5, 10].map(n => (
                        <button key={n} onClick={() => handleCapChange(n)}
                          style={{ width: 36, height: 28, borderRadius: 8, border: cap === n ? 'none' : `1px solid ${GRAY_300}`, background: cap === n ? '#00B4D8' : 'transparent', color: cap === n ? '#FFF' : GRAY_500, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
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

        {/* Plan Change Requests */}
        <SectionCard>
          <SH>Plan Change Requests</SH>
          {loadingRequests ? (
            <p style={{ fontSize: 13, color: GRAY_500, margin: 0 }}>Loading...</p>
          ) : planRequests.length === 0 ? (
            <p style={{ fontSize: 13, color: GRAY_500, margin: 0 }}>No requests</p>
          ) : planRequests.map((req, i) => (
            <div key={req.id} style={{ padding: '12px 0', borderTop: i === 0 ? 'none' : `1px solid ${GRAY_300}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: GRAY_900 }}>→ {req.requested_plan}</span>
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
                  style={{ height: 28, padding: '0 6px', border: `1px solid ${GRAY_300}`, borderRadius: 8, fontSize: 11, background: WHITE, color: GRAY_900, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
                >
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              {req.notes && <p style={{ fontSize: 12, color: GRAY_500, margin: '0 0 4px', lineHeight: 1.5 }}>{req.notes}</p>}
              <p style={{ fontSize: 11, color: GRAY_500, margin: 0 }}>
                Requested {new Date(req.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          ))}
        </SectionCard>

        {/* Recent Inspections */}
        <SectionCard>
          <SH>Recent Inspections</SH>
          {inspections.length === 0 ? (
            <p style={{ fontSize: 13, color: GRAY_500, margin: 0 }}>No inspections yet</p>
          ) : inspections.map(ins => {
            const st = (ins.status as string) ?? 'queued'
            return (
              <div key={ins.id as string} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${GRAY_300}` }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: GRAY_900, margin: 0 }}>{ins.vin as string ?? '—'}</p>
                  <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>{[ins.year, ins.make, ins.model].filter(Boolean).join(' ') || '—'} · {new Date(ins.created_at as string).toLocaleDateString()}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: `${STATUS_COLORS[st] ?? GRAY_500}20`, color: STATUS_COLORS[st] ?? GRAY_500 }}>{st}</span>
                  {Boolean(ins.vehicle_score) && <span style={{ fontSize: 13, fontWeight: 700, color: GRAY_900 }}>{ins.vehicle_score as number}</span>}
                </div>
              </div>
            )
          })}
        </SectionCard>

        {/* Activity Log */}
        <SectionCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Clock size={14} color={GRAY_500} />
            <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Activity Log</p>
          </div>
          {activity.length === 0 ? (
            <p style={{ fontSize: 13, color: GRAY_500, margin: 0 }}>No activity recorded yet</p>
          ) : activity.map(a => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: `1px solid ${GRAY_300}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: GRAY_300, color: GRAY_700 }}>
                  {ACTION_LABELS[a.action_type] ?? a.action_type}
                </span>
                <span style={{ fontSize: 11, color: GRAY_500 }}>{a.actorName ?? 'System'}</span>
              </div>
              <p style={{ fontSize: 13, color: GRAY_900, margin: '0 0 2px' }}>{a.description}</p>
              <p style={{ fontSize: 11, color: GRAY_500, margin: 0 }}>{new Date(a.created_at).toLocaleString()}</p>
            </div>
          ))}
        </SectionCard>

        {/* Notes */}
        <SectionCard>
          <SH>Notes</SH>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..."
              onKeyDown={e => e.key === 'Enter' && handleAddNote()}
              style={{ flex: 1, height: 38, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: WHITE, color: GRAY_900 }} />
            <button onClick={handleAddNote}
              style={{ width: 38, height: 38, background: '#00B4D8', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={16} color="#FFF" />
            </button>
          </div>
          {notes.length === 0 ? <p style={{ fontSize: 13, color: GRAY_500, margin: 0 }}>No notes yet</p>
            : notes.map(n => (
              <div key={n.id} style={{ padding: '10px 0', borderBottom: `1px solid ${GRAY_300}` }}>
                <p style={{ fontSize: 13, color: GRAY_900, margin: '0 0 4px' }}>{n.note_text}</p>
                <p style={{ fontSize: 11, color: GRAY_500, margin: 0 }}>{n.authorName ?? 'Unknown'} · {new Date(n.created_at).toLocaleDateString()}</p>
              </div>
            ))}
        </SectionCard>

      </div>
    </div>
  )
}

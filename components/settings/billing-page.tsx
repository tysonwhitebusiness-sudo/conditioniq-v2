'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import {
  getPlan, normalizePlanKey, calcOverage, effectiveMonthlyPrice, effectiveAnnualPrice, hasPriceOverride,
  planHighlights, formatPlanPrice, planCrossovers, PLANS, PUBLIC_PLAN_ORDER,
} from '@/lib/pricing'
import {
  getBillingPageData, submitPlanChangeRequest,
  type UsageLogEntry,
} from '@/lib/billing-actions'
import { Check, ChevronDown, ChevronUp, X, Loader2, AlertTriangle } from 'lucide-react'

// ── Plan config ────────────────────────────────────────────────────────────────

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  demo:       { bg: '#F0F4F8', color: '#94A3B8' },
  pay_per_use: { bg: '#DCFCE7', color: '#166534' },
  operations: { bg: '#E0F7FC', color: '#0097B2' },
  pro:        { bg: '#EDE9FE', color: '#5B21B6' },
  enterprise: { bg: '#FEF3C7', color: '#92400E' },
}

// Plan names come from lib/pricing, so the request form cannot offer a plan that
// no longer exists.
const AVAILABLE_PLANS = [...PUBLIC_PLAN_ORDER.filter(k => k !== 'demo').map(k => PLANS[k].name), 'Custom']

const REQUEST_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  pending:   { bg: '#FEF3C7', color: '#92400E' },
  reviewed:  { bg: '#E0F7FC', color: '#0097B2' },
  completed: { bg: '#D1FAE5', color: '#065F46' },
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function resetLabel(cycleEnd: string | null | undefined): string {
  if (!cycleEnd) return 'Resets monthly'
  return `Resets ${new Date(cycleEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function Meter({ label, used, included, unit, rate, over, cost, note }: {
  label: string; used: number; included: number | null; unit: string
  rate: number; over: number; cost: number; note?: string
}) {
  const pct = included === null ? 0 : Math.min(100, included > 0 ? (used / included) * 100 : 100)
  const near = included !== null && pct >= 80
  const barColor = pct >= 100 ? '#EF4444' : near ? '#F4A62A' : '#00B4D8'
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', margin: 0 }}>{label}</p>
        <p style={{ margin: 0 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: '#0D1B2A' }}>{used}</span>
          <span style={{ fontSize: 14, color: '#94A3B8', marginLeft: 6 }}>{included === null ? 'unlimited' : `/ ${included}`}</span>
        </p>
      </div>
      {included !== null && (
        <div style={{ height: 8, background: '#F0F4F8', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: 8, width: `${pct}%`, background: barColor, borderRadius: 4, transition: 'width 400ms ease' }} />
        </div>
      )}
      {note && <p style={{ fontSize: 12, color: '#94A3B8', margin: '6px 0 0' }}>{note}</p>}
      {over > 0 ? (
        <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 10, padding: '10px 14px', marginTop: 10 }}>
          <p style={{ fontSize: 13, color: '#B45309', margin: 0 }}>
            {over} {unit}{over !== 1 ? 's' : ''} over the allowance × ${rate.toFixed(2)} = <strong>${cost.toFixed(2)}</strong> this cycle
          </p>
        </div>
      ) : near ? (
        <div role="status" style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 10, padding: '8px 14px', marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} color="#D97706" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: '#92400E', margin: 0 }}>You have used {Math.round(pct)}% of this allowance.</p>
        </div>
      ) : null}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>
      {children}
    </p>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20, ...style }}>
      {children}
    </div>
  )
}

// ── Plan Change Modal ──────────────────────────────────────────────────────────

interface PlanChangeModalProps {
  currentPlan: string
  companyId: string
  userId: string
  onClose: () => void
  onSubmitted: () => void
}

function PlanChangeModal({ currentPlan, companyId, userId, onClose, onSubmitted }: PlanChangeModalProps) {
  const [requestedPlan, setRequestedPlan] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!requestedPlan) { setError('Please select a plan.'); return }
    setSubmitting(true)
    setError('')
    try {
      await submitPlanChangeRequest({ companyId, requestedBy: userId, currentPlan, requestedPlan, notes })
      onSubmitted()
    } catch (e: any) {
      setError(e.message ?? 'Failed to submit request')
      setSubmitting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(13,27,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#FFF', borderRadius: 20, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 20px 60px rgba(13,27,42,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Request Plan Change</h3>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 15, background: '#F0F4F8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color="#4A5568" />
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
            Desired Plan <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <select
            value={requestedPlan}
            onChange={e => setRequestedPlan(e.target.value)}
            style={{ width: '100%', height: 44, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">Select a plan…</option>
            {AVAILABLE_PLANS.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
            Additional Details <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 400 }}>Optional</span>
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Tell us more about your needs — report volume, number of users, or anything else…"
            rows={3}
            style={{ width: '100%', border: '1px solid #E1E8F0', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.5, boxSizing: 'border-box' }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 12 }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !requestedPlan}
            style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: submitting || !requestedPlan ? '#E1E8F0' : '#00B4D8', color: submitting || !requestedPlan ? '#94A3B8' : '#FFFFFF', fontSize: 14, fontWeight: 700, cursor: submitting || !requestedPlan ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {submitting ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />Submitting…</> : 'Send Request'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Usage Log ──────────────────────────────────────────────────────────────────

function UsageLog({ entries, isDesktop }: { entries: UsageLogEntry[]; isDesktop: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? entries : entries.slice(0, 5)

  if (entries.length === 0) {
    return <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, padding: '8px 0' }}>No usage recorded this cycle.</p>
  }

  return (
    <div>
      {visible.map((e, i) => {
        const isComplete = e.usage_status === 'completed'
        const isAbandoned = e.usage_status === 'initiated' && e.status !== 'completed'
        return (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid #F0F4F8', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, fontFamily: 'monospace', color: '#0D1B2A', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.vin ?? '—'}
              </p>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
                {[e.year, e.make, e.model].filter(Boolean).join(' ') || 'Vehicle'} · {formatDate(e.created_at)}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {isAbandoned && (
                <span title="Credit used — inspection not completed" style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#F59E0B', background: '#FEF3C7', padding: '3px 7px', borderRadius: 20 }}>
                  <AlertTriangle size={10} />INCOMPLETE
                </span>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: isComplete ? '#D1FAE5' : '#F0F4F8', color: isComplete ? '#065F46' : '#94A3B8' }}>
                {isComplete ? 'Completed' : isAbandoned ? 'Abandoned' : e.status}
              </span>
            </div>
          </div>
        )
      })}
      {entries.length > 5 && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#00B4D8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
        >
          {expanded ? <><ChevronUp size={14} />Show less</> : <><ChevronDown size={14} />Show {entries.length - 5} more</>}
        </button>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function BillingPage() {
  const { user, effectiveCompany, companyRole, platformRole, isOwnerUser } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [loading, setLoading] = useState(true)
  const [billingData, setBillingData] = useState<Awaited<ReturnType<typeof getBillingPageData>> | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const canRequest = isOwnerUser || companyRole === 'admin'
  const companyId = effectiveCompany?.id ?? ''

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      setBillingData(await getBillingPageData(companyId))
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const handleSubmitted = () => {
    setShowModal(false)
    setSubmitted(true)
    load()
  }


  const company = billingData?.company
  const usageLog = billingData?.usageLog ?? []
  const hasPendingRequest = billingData?.hasPendingRequest ?? false

  const usage = billingData?.usage
  const tier = normalizePlanKey(company?.subscription_tier ?? effectiveCompany?.subscription_tier)
  const plan = getPlan(tier)
  const planFields = company ?? effectiveCompany ?? { subscription_tier: tier }
  const heldPrice = hasPriceOverride(planFields)
  const billingInterval = (company?.billing_interval ?? 'monthly') as 'monthly' | 'annual'
  const planColor = PLAN_COLORS[tier]
  const features = planHighlights(plan)
  const overage = usage
    ? calcOverage(planFields, { reportsUsed: usage.used, peakVehicles: usage.vehicles.used })
    : null

  const price = billingInterval === 'annual' ? effectiveAnnualPrice(planFields) : effectiveMonthlyPrice(planFields)
  const priceDisplay = plan.usageBased ? formatPlanPrice(plan)
    : tier === 'demo' ? 'Free'
    : price === null ? 'Custom'
    : `$${price.toLocaleString()}/${billingInterval === 'annual' ? 'yr' : 'mo'}`

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div style={{ padding: isDesktop ? '28px 32px' : '16px', paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))', maxWidth: 720, margin: '0 auto' }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: isDesktop ? 22 : 20, fontWeight: 800, color: '#0D1B2A', margin: '0 0 4px' }}>Billing & Plan</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>{effectiveCompany?.name}</p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
            <Loader2 size={24} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── 1. Current Plan ── */}
            <Card>
              <SectionLabel>Current Plan</SectionLabel>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: planColor.bg, color: planColor.color }}>
                      {plan.name.toUpperCase()}
                    </span>
                    {heldPrice && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: '#FFF0E8', color: '#C2410C', border: '1px solid #FED7AA' }}>
                        GRANDFATHERED PRICE
                      </span>
                    )}
                  </div>
                  {usage?.demo.isDemo && usage.demo.expiresAt && (
                    <p style={{ fontSize: 13, fontWeight: 600, color: usage.demo.expired ? '#B91C1C' : '#0097B2', margin: '0 0 10px' }}>
                      {usage.demo.expired
                        ? `Your demo ended ${formatDate(usage.demo.expiresAt)}.`
                        : `Your demo runs until ${formatDate(usage.demo.expiresAt)}.`}
                    </p>
                  )}
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {features.map(f => (
                      <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: '#374151' }}>
                        <Check size={13} color="#10B981" strokeWidth={2.5} />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 26, fontWeight: 800, color: '#0D1B2A', margin: 0, lineHeight: 1 }}>{priceDisplay}</p>
                  {plan.usageBased && (
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>no monthly fee</p>
                  )}
                  {billingInterval === 'annual' && tier !== 'enterprise' && tier !== 'demo' && !plan.usageBased && (
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>billed annually</p>
                  )}
                </div>
              </div>
            </Card>

            {/* ── 2. Usage ── */}
            <Card>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <SectionLabel>{usage?.demo.isDemo ? 'Demo Usage' : plan.usageBased ? 'Usage This Month' : 'Usage This Cycle'}</SectionLabel>
                {!usage?.demo.isDemo && <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{resetLabel(usage?.cycle.end)}</p>}
              </div>

              {usage?.usageBased ? (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>
                      {usage.used} {usage.used === 1 ? 'report' : 'reports'} this month
                    </p>
                    <p style={{ fontSize: 20, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>
                      ${(usage.estimatedCharge ?? 0).toFixed(2)}
                    </p>
                  </div>
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: '4px 0 0', lineHeight: 1.5 }}>
                    Estimated charge at ${usage.overageRate.toFixed(2)} per report, invoiced at the end of the month.
                  </p>
                  {usage.used > planCrossovers().payPerUseReports && (
                    <p style={{ fontSize: 12, color: '#0097B2', margin: '8px 0 0', lineHeight: 1.5 }}>
                      Above {planCrossovers().payPerUseReports} reports a month, {PLANS.operations.name} at {formatPlanPrice(PLANS.operations)} costs less and adds the lot platform.
                    </p>
                  )}
                </div>
              ) : usage && overage ? (
                <>
                  <Meter
                    label="Reports" unit="report"
                    used={usage.used} included={usage.included}
                    rate={overage.reports.rate} over={overage.reports.over} cost={overage.reports.cost}
                  />
                  {!usage.demo.isDemo && (
                    <Meter
                      label="Vehicles on lot" unit="vehicle"
                      used={usage.vehicles.used} included={usage.vehicles.included}
                      rate={overage.vehicles.rate} over={overage.vehicles.over} cost={overage.vehicles.cost}
                      note={`Billed on the most vehicles on your lot at one time this cycle. ${usage.vehicles.current} on the lot now.`}
                    />
                  )}
                </>
              ) : (
                <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 14px' }}>Usage is unavailable right now.</p>
              )}

              {/* Usage log */}
              <div style={{ borderTop: '1px solid #F0F4F8', paddingTop: 14, marginTop: 4 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Usage Log</p>
                <UsageLog entries={usageLog} isDesktop={isDesktop} />
              </div>
            </Card>

            {/* ── 3. Need Something Different ── */}
            <Card>
              <SectionLabel>Need Something Different?</SectionLabel>
              <p style={{ fontSize: 14, color: '#4A5568', margin: '0 0 16px', lineHeight: 1.6 }}>
                Need more reports, more users, or a different plan? Let us know and we'll be in touch.
              </p>

              {submitted || hasPendingRequest ? (
                <div style={{ background: '#D1FAE5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={16} color="#065F46" />
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#065F46', margin: 0 }}>
                    {submitted ? 'Request sent. We\'ll be in touch shortly.' : 'A plan change request is pending review.'}
                  </p>
                </div>
              ) : canRequest ? (
                <button
                  onClick={() => setShowModal(true)}
                  style={{ height: 44, padding: '0 20px', borderRadius: 10, border: '1.5px solid #00B4D8', background: '#FFF', color: '#00B4D8', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Request Plan Change
                </button>
              ) : (
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Contact your account admin to request a plan change.</p>
              )}
            </Card>


          </div>
        )}
      </div>

      {!isDesktop && <BottomNav />}

      {showModal && user && (
        <PlanChangeModal
          currentPlan={tier}
          companyId={companyId}
          userId={user.id}
          onClose={() => setShowModal(false)}
          onSubmitted={handleSubmitted}
        />
      )}
    </>
  )
}

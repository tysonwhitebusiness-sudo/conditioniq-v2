'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAdminStats, getOverageTracker, getMRRByMonth, getRecentCustomerActivity, getPayPerUseOverview, type PayPerUseAccountRow } from '@/lib/admin-actions'
import dynamic from 'next/dynamic'
import AiKillSwitch from './ai-kill-switch'
// Loaded on demand (see components/admin/admin-charts.tsx).
const MrrChart = dynamic(() => import('./admin-charts').then(m => m.MrrChart), {
  ssr: false,
  loading: () => <div style={{ height: 220, background: '#F0F4F8', borderRadius: 8 }} />,
})
const PlanBreakdownChart = dynamic(() => import('./admin-charts').then(m => m.PlanBreakdownChart), {
  ssr: false,
  loading: () => <div style={{ height: 160, background: '#F0F4F8', borderRadius: 8 }} />,
})
import { DollarSign, Users, FileText, TrendingUp, Activity, AlertTriangle, CheckCircle, ChevronRight, Receipt } from 'lucide-react'
import { PRIMARY, AMBER_DARK, SUCCESS, SUCCESS_DARK, SUCCESS_LIGHT, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'

// Keyed by current plan; retired names are normalized server-side first.
const PLAN_COLORS: Record<string, string> = {
  demo: GRAY_500, pay_per_use: '#10B981', operations: '#00B4D8', pro: '#8B5CF6', enterprise: '#F4A62A',
}
const PLAN_LABELS: Record<string, string> = {
  demo: 'DEMO', pay_per_use: 'PPU', operations: 'OPS', pro: 'PRO', enterprise: 'ENT',
}
const ACT_COLORS: Record<string, string> = { signup: '#10B981', upgrade: '#00B4D8', downgrade: '#F4A62A', cancel: '#EF4444' }

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const monthName = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 16, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', padding: 20, minWidth: 0, ...style }}>
      {children}
    </div>
  )
}
function SH({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>{children}</p>
}

type PayPerUseOverview = Awaited<ReturnType<typeof getPayPerUseOverview>>

// Pay Per Use is billed by hand at month end, so it is tracked apart from
// subscription MRR: what last month comes to (to invoice now) and how this
// month is running, per account.
function PayPerUsePanel({ data, onOpen }: { data: PayPerUseOverview; onOpen: (id: string) => void }) {
  const totals = data.accounts.reduce((t, a) => ({
    thisReports: t.thisReports + a.thisMonthReports, thisAmount: t.thisAmount + a.thisMonthAmount,
    lastReports: t.lastReports + a.lastMonthReports, lastAmount: t.lastAmount + a.lastMonthAmount,
  }), { thisReports: 0, thisAmount: 0, lastReports: 0, lastAmount: 0 })

  const summary = [
    { label: 'Accounts', value: String(data.accounts.length), sub: `$${data.rate.toFixed(2)} per report` },
    { label: `${monthName(data.lastMonth.start)} to invoice`, value: money(totals.lastAmount), sub: `${totals.lastReports} reports` },
    { label: `${monthName(data.thisMonth.start)} so far`, value: money(totals.thisAmount), sub: `${totals.thisReports} reports` },
  ]

  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Receipt size={15} color={SUCCESS} />
        <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Pay Per Use</p>
      </div>

      <div className="adm-g3" style={{ gap: 12, marginBottom: 16 }}>
        {summary.map(s => (
          <div key={s.label} style={{ background: GRAY_100, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: '12px 14px', minWidth: 0 }}>
            <p style={{ fontSize: 11, color: GRAY_500, margin: '0 0 4px' }}>{s.label}</p>
            <p style={{ fontSize: 22, fontWeight: 800, color: GRAY_900, margin: 0, lineHeight: 1.1 }}>{s.value}</p>
            <p style={{ fontSize: 12, color: GRAY_500, margin: '2px 0 0' }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {data.accounts.length === 0 ? (
        <p style={{ fontSize: 13, color: GRAY_500, margin: 0 }}>No accounts on Pay Per Use yet. Set a customer's plan to Pay Per Use from their page.</p>
      ) : (
        <div>
          <div className="adm-hide-mobile" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 16px', gap: 12, padding: '0 0 8px', borderBottom: `1px solid ${GRAY_300}` }}>
            {['Account', `${monthName(data.lastMonth.start)} (invoice)`, `${monthName(data.thisMonth.start)} so far`, ''].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
            ))}
          </div>
          {data.accounts.map((a: PayPerUseAccountRow) => (
            <button key={a.id} onClick={() => onOpen(a.id)}
              style={{ width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', padding: '12px 0', background: 'none', border: 'none', borderBottom: `1px solid ${GRAY_300}`, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <span style={{ flex: '2 1 160px', minWidth: 0, fontSize: 14, fontWeight: 600, color: GRAY_900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              <span style={{ flex: '1 1 110px', fontSize: 13, color: GRAY_900 }}>
                <strong>{money(a.lastMonthAmount)}</strong>
                <span style={{ color: GRAY_500 }}> · {a.lastMonthReports}</span>
                <span className="adm-show-mobile" style={{ fontSize: 11, color: GRAY_500 }}>last month (invoice)</span>
              </span>
              <span style={{ flex: '1 1 110px', fontSize: 13, color: GRAY_700 }}>
                {money(a.thisMonthAmount)}
                <span style={{ color: GRAY_500 }}> · {a.thisMonthReports}</span>
                <span className="adm-show-mobile" style={{ fontSize: 11, color: GRAY_500 }}>this month so far</span>
              </span>
              <ChevronRight size={16} color={GRAY_500} style={{ flexShrink: 0 }} />
            </button>
          ))}
          <p style={{ fontSize: 11, color: GRAY_500, margin: '10px 0 0' }}>Generated reports in each calendar month (UTC) × ${data.rate.toFixed(2)}.</p>
        </div>
      )}
    </Card>
  )
}

export default function AdminOverview() {
  const router = useRouter()
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const [overage, setOverage] = useState<Record<string, unknown>[]>([])
  const [mrrHistory, setMrrHistory] = useState<{ month: string; mrr: number }[]>([])
  const [recentActivity, setRecentActivity] = useState<Record<string, unknown>[]>([])
  const [payPerUse, setPayPerUse] = useState<PayPerUseOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getAdminStats(), getOverageTracker(), getMRRByMonth(), getRecentCustomerActivity(), getPayPerUseOverview()])
      .then(([s, o, mrr, act, ppu]) => {
        setStats(s as Record<string, unknown>)
        setOverage(o as Record<string, unknown>[])
        setMrrHistory(mrr)
        setRecentActivity(act)
        setPayPerUse(ppu)
      })
      .catch(e => setLoadError(e?.message ?? 'Could not load the overview'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="adm-page">
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      <div className="adm-g5" style={{ gap: 16, marginBottom: 24 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ height: 120, background: GRAY_300, borderRadius: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    </div>
  )

  if (loadError) return (
    <div className="adm-page"><Card><p style={{ fontSize: 14, color: GRAY_900, margin: 0 }}>{loadError}</p></Card></div>
  )

  const topCustomers = (stats?.topCustomers ?? []) as Record<string, unknown>[]
  // Every account, counted on the server (this used to count only the top ten).
  const planData = Object.entries((stats?.planBreakdown ?? {}) as Record<string, number>).map(([name, value]) => ({ name, value }))

  const statCards = [
    { icon: DollarSign, label: 'MRR', value: `$${(stats?.mrr as number ?? 0).toLocaleString()}`, color: '#00B4D8' },
    { icon: Users, label: 'Active Customers', value: String(stats?.activeCustomers ?? 0), color: '#00B4D8' },
    { icon: FileText, label: 'Reports This Month', value: String(stats?.reportsThisMonth ?? 0), color: '#8B5CF6' },
    { icon: TrendingUp, label: 'Trial Accounts', value: String(stats?.trialAccounts ?? 0), color: '#10B981' },
    { icon: Activity, label: 'Churn This Month', value: '0', color: '#EF4444' },
  ]

  return (
    <div className="adm-page" style={{ maxWidth: 1200 }}>
      <div className="adm-g5" style={{ gap: 16, marginBottom: 24 }}>
        {statCards.map(({ icon: Icon, label, value, color }) => (
          <div key={label} style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 16, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', padding: 16, minWidth: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon size={18} color={color} />
            </div>
            <p style={{ fontSize: 28, fontWeight: 800, color: GRAY_900, margin: '0 0 4px', lineHeight: 1, overflowWrap: 'anywhere' }}>{value}</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      <AiKillSwitch />

      {payPerUse && <PayPerUsePanel data={payPerUse} onOpen={id => router.push(`/admin/customers/${id}`)} />}

      <div className="adm-g32" style={{ gap: 16, marginBottom: 24 }}>
        <Card>
          <SH>Subscription MRR, Last 12 Months</SH>
          <MrrChart data={mrrHistory} />
        </Card>
        <Card>
          <SH>Plan Breakdown</SH>
          <PlanBreakdownChart data={planData} colors={PLAN_COLORS} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 8 }}>
            {planData.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: PLAN_COLORS[p.name] ?? GRAY_500 }} />
                <span style={{ fontSize: 11, color: GRAY_500 }}>{PLAN_LABELS[p.name] ?? p.name} ({p.value})</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="adm-g55" style={{ gap: 16, marginBottom: 24 }}>
        <Card>
          <SH>Top Customers by Usage</SH>
          {topCustomers.length === 0 ? <p style={{ fontSize: 14, color: GRAY_500 }}>No customers yet</p> : topCustomers.map(c => {
            const u = c.usage as { reportsUsed: number; reportsIncluded: number | null; planKey: string; hasPriceOverride: boolean }
            const used = u.reportsUsed
            const inc = u.reportsIncluded
            const tier = u.planKey
            const isPayPerUse = tier === 'pay_per_use'
            const pct = inc === null ? 0 : Math.min(100, (used / Math.max(inc, 1)) * 100)
            const barColor = pct >= 100 ? '#EF4444' : pct >= 80 ? '#F4A62A' : '#00B4D8'
            return (
              <div key={c.id as string} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${GRAY_300}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: GRAY_900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name as string}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: `${PLAN_COLORS[tier] ?? GRAY_500}20`, color: PLAN_COLORS[tier] ?? GRAY_500, flexShrink: 0 }}>{PLAN_LABELS[tier] ?? tier}</span>
                    {u.hasPriceOverride && <span className="adm-hide-mobile" style={{ fontSize: 10, fontWeight: 700, color: GRAY_500, flexShrink: 0 }}>HELD PRICE</span>}
                  </div>
                  {!isPayPerUse && (
                    <div style={{ height: 4, background: GRAY_300, borderRadius: 2 }}>
                      <div style={{ height: 4, width: `${pct}%`, background: barColor, borderRadius: 2 }} />
                    </div>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: GRAY_900, flexShrink: 0 }}>
                  {isPayPerUse ? `${used} · ${money(used * (payPerUse?.rate ?? 0))}` : `${used}/${inc === null ? '∞' : inc}`}
                </span>
              </div>
            )
          })}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <AlertTriangle size={15} color="#F4A62A" />
            <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Overage Tracker</p>
          </div>
          {overage.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: SUCCESS_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                <CheckCircle size={22} color={SUCCESS_DARK} />
              </div>
              <p style={{ fontSize: 13, color: SUCCESS_DARK, fontWeight: 600, margin: 0 }}>No overages this cycle</p>
            </div>
          ) : overage.map(c => (
            <div key={c.id as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${GRAY_300}` }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: GRAY_900, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name as string}</p>
                <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>{c.planName as string}</p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: AMBER_DARK, margin: 0 }}>
                  {[
                    (c.overageCount as number) > 0 ? `${c.overageCount} reports` : null,
                    (c.vehicleOverageCount as number) > 0 ? `${c.vehicleOverageCount} vehicles` : null,
                  ].filter(Boolean).join(' · ')} over
                </p>
                <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>${(c.overageRevenue as number).toFixed(2)}</p>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <SH>Recent Activity</SH>
        {recentActivity.length === 0 ? <p style={{ fontSize: 14, color: GRAY_500, margin: 0 }}>No recent activity</p>
          : recentActivity.map(ev => (
            <div key={ev.id as string} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 12px', padding: '10px 0', borderBottom: `1px solid ${GRAY_300}` }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: ACT_COLORS[ev.event as string] ?? GRAY_500, flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: GRAY_900, flex: '1 1 140px', minWidth: 0 }}>{ev.company_name as string}</span>
              <span style={{ fontSize: 12, color: GRAY_500 }}>{ev.description as string}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${PLAN_COLORS[ev.plan as string] ?? GRAY_500}20`, color: PLAN_COLORS[ev.plan as string] ?? GRAY_500 }}>
                {PLAN_LABELS[ev.plan as string] ?? ev.plan as string}
              </span>
              <span style={{ fontSize: 11, color: GRAY_500, flexShrink: 0 }}>{new Date(ev.timestamp as string).toLocaleDateString()}</span>
            </div>
          ))}
      </Card>
    </div>
  )
}

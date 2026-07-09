'use client'

import { useState, useEffect } from 'react'
import { getAdminStats, getOverageTracker, getMRRByMonth, getRecentCustomerActivity } from '@/lib/admin-actions'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { DollarSign, Users, FileText, TrendingUp, Activity, AlertTriangle, CheckCircle } from 'lucide-react'

const PLAN_COLORS: Record<string, string> = {
  demo: '#94A3B8', starter: '#00B4D8', growth: '#10B981', pro: '#8B5CF6', enterprise: '#F4A62A', legacy_starter: '#64748B',
}
const PLAN_LABELS: Record<string, string> = {
  demo: 'DEMO', starter: 'STARTER', growth: 'GROWTH', pro: 'PRO', enterprise: 'ENT', legacy_starter: 'LEGACY',
}
const ACT_COLORS: Record<string, string> = { signup: '#10B981', upgrade: '#00B4D8', downgrade: '#F4A62A', cancel: '#EF4444' }

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#1B2D40', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', padding: 20, ...style }}>
      {children}
    </div>
  )
}
function SH({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>{children}</p>
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const [overage, setOverage] = useState<Record<string, unknown>[]>([])
  const [mrrHistory, setMrrHistory] = useState<{ month: string; mrr: number }[]>([])
  const [recentActivity, setRecentActivity] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getAdminStats(), getOverageTracker(), getMRRByMonth(), getRecentCustomerActivity()])
      .then(([s, o, mrr, act]) => {
        setStats(s as Record<string, unknown>)
        setOverage(o as Record<string, unknown>[])
        setMrrHistory(mrr)
        setRecentActivity(act)
        setLoading(false)
      })
  }, [])

  if (loading) return (
    <div style={{ padding: 24 }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginBottom: 24 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ height: 120, background: 'rgba(255,255,255,0.06)', borderRadius: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
        ))}
      </div>
    </div>
  )

  const topCustomers = (stats?.topCustomers ?? []) as Record<string, unknown>[]
  const planCounts: Record<string, number> = {}
  topCustomers.forEach(c => { const t = (c.subscription_tier as string) ?? 'demo'; planCounts[t] = (planCounts[t] ?? 0) + 1 })
  const planData = Object.entries(planCounts).map(([name, value]) => ({ name, value }))

  const statCards = [
    { icon: DollarSign, label: 'MRR', value: `$${(stats?.mrr as number ?? 0).toLocaleString()}`, color: '#00B4D8' },
    { icon: Users, label: 'Active Customers', value: String(stats?.activeCustomers ?? 0), color: '#00B4D8' },
    { icon: FileText, label: 'Reports This Month', value: String(stats?.reportsThisMonth ?? 0), color: '#8B5CF6' },
    { icon: TrendingUp, label: 'Trial Accounts', value: String(stats?.trialAccounts ?? 0), color: '#10B981' },
    { icon: Activity, label: 'Churn This Month', value: '0', color: '#EF4444' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 16, marginBottom: 24 }}>
        {statCards.map(({ icon: Icon, label, value, color }) => (
          <div key={label} style={{ background: '#1B2D40', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.2)', padding: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Icon size={18} color={color} />
            </div>
            <p style={{ fontSize: 32, fontWeight: 800, color: '#F1F5F9', margin: '0 0 4px', lineHeight: 1 }}>{value}</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 24 }}>
        <Card>
          <SH>MRR Last 12 Months</SH>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={mrrHistory} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={52} />
              <Tooltip formatter={(v) => typeof v === 'number' ? [`$${v.toLocaleString()}`, 'MRR'] as [string, string] : ''} contentStyle={{ background: '#0D1B2A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#FFF', fontSize: 12 }} />
              <Bar dataKey="mrr" fill="#00B4D8" activeBar={{ fill: '#0097B2' }} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <SH>Plan Breakdown</SH>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={planData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
                {planData.map((entry, i) => <Cell key={i} fill={PLAN_COLORS[entry.name] ?? '#94A3B8'} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0D1B2A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#FFF', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 8 }}>
            {planData.map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: PLAN_COLORS[p.name] ?? '#94A3B8' }} />
                <span style={{ fontSize: 11, color: '#94A3B8' }}>{PLAN_LABELS[p.name] ?? p.name} ({p.value})</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '55fr 45fr', gap: 16, marginBottom: 24 }}>
        <Card>
          <SH>Top Customers by Usage</SH>
          {topCustomers.length === 0 ? <p style={{ fontSize: 14, color: '#94A3B8' }}>No customers yet</p> : topCustomers.map(c => {
            const used = (c.reports_used as number) ?? 0
            const inc = (c.reports_included as number) ?? 1
            const pct = Math.min(100, (used / Math.max(inc, 1)) * 100)
            const barColor = pct >= 100 ? '#EF4444' : pct >= 80 ? '#F4A62A' : '#00B4D8'
            const tier = (c.subscription_tier as string) ?? 'demo'
            return (
              <div key={c.id as string} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name as string}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: `${PLAN_COLORS[tier] ?? '#94A3B8'}20`, color: PLAN_COLORS[tier] ?? '#94A3B8', flexShrink: 0 }}>{PLAN_LABELS[tier] ?? tier}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
                    <div style={{ height: 4, width: `${pct}%`, background: barColor, borderRadius: 2 }} />
                  </div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9', flexShrink: 0 }}>{used}/{inc}</span>
              </div>
            )
          })}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <AlertTriangle size={15} color="#F4A62A" />
            <SH>Overage Tracker</SH>
          </div>
          {overage.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <CheckCircle size={28} color="#10B981" style={{ display: 'block', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: '#10B981', fontWeight: 600, margin: 0 }}>No overages this month</p>
            </div>
          ) : overage.map(c => (
            <div key={c.id as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9', margin: 0 }}>{c.name as string}</p>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{c.planName as string}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#F4A62A', margin: 0 }}>{c.overageCount as number} over</p>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>${(c.overageRevenue as number).toFixed(2)}</p>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <Card>
        <SH>Recent Activity</SH>
        {recentActivity.length === 0 ? <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>No recent activity</p>
          : recentActivity.map(ev => (
            <div key={ev.id as string} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: ACT_COLORS[ev.event as string] ?? '#94A3B8', flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9', flex: 1 }}>{ev.company_name as string}</span>
              <span style={{ fontSize: 12, color: '#94A3B8' }}>{ev.description as string}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: `${PLAN_COLORS[ev.plan as string] ?? '#94A3B8'}20`, color: PLAN_COLORS[ev.plan as string] ?? '#94A3B8' }}>
                {PLAN_LABELS[ev.plan as string] ?? ev.plan as string}
              </span>
              <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>{new Date(ev.timestamp as string).toLocaleDateString()}</span>
            </div>
          ))}
      </Card>
    </div>
  )
}

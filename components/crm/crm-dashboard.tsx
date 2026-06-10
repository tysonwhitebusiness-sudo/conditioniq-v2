'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  getCRMDashboardStats, getTodayGoals, getStreak,
  getWeeklyEmailVolume, getReplyRateTrend, getPipelineStageSummary,
  getCompanyBreakdown, updateGoalTargets,
} from '@/lib/crm-actions'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { Mail, Phone, Linkedin, Check, ChevronDown, ChevronRight } from 'lucide-react'

const COMPANY_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  storage_facility: { bg: '#E0F7FC', color: '#0097B2' },
  tow_impound:      { bg: '#FFF0E8', color: '#C2410C' },
  fleet:            { bg: '#EDE9FE', color: '#5B21B6' },
  fmc:              { bg: '#EFF6FF', color: '#1D4ED8' },
  other:            { bg: '#F0F4F8', color: '#4A5568' },
}

const STAGE_LABELS: Record<string, string> = {
  new: 'New Leads', contacted: 'Contacted', demo_sent: 'Demo Sent',
  trial_active: 'Trial Active', proposal: 'Proposal', converted: 'Converted', not_interested: 'Not Interested',
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, boxShadow: '0 1px 3px rgba(13,27,42,0.06)', padding: 20, ...style }}>{children}</div>
}
function SH({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>{children}</p>
}

function GoalBar({ label, current, target, color, onTargetEdit }: { label: string; current: number; target: number; color: string; onTargetEdit: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(target))
  const pct = Math.min(100, target > 0 ? (current / target) * 100 : 0)
  const hit = current >= target
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: hit ? '#10B981' : '#0D1B2A', textDecoration: hit ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          {hit && <Check size={13} color="#10B981" />}{label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: hit ? '#10B981' : '#0D1B2A' }}>
          {current} /{' '}
          {editing ? (
            <input autoFocus value={val} onChange={e => setVal(e.target.value)}
              onBlur={() => { setEditing(false); const n = parseInt(val); if (!isNaN(n)) onTargetEdit(n) }}
              onKeyDown={e => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
              style={{ width: 36, fontSize: 13, fontWeight: 700, border: 'none', borderBottom: `2px solid ${color}`, outline: 'none', background: 'transparent', textAlign: 'center' }} />
          ) : (
            <span onClick={() => setEditing(true)} style={{ cursor: 'pointer', textDecoration: 'underline dotted', color: '#94A3B8' }}>{target}</span>
          )}
        </span>
      </div>
      <div style={{ height: 8, background: '#F0F4F8', borderRadius: 4 }}>
        <div style={{ height: 8, width: `${pct}%`, background: hit ? '#10B981' : color, borderRadius: 4, transition: 'width 400ms' }} />
      </div>
    </div>
  )
}

export default function CRMDashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)
  const [goals, setGoals] = useState<Record<string, unknown>>({ emails_sent: 0, calls_made: 0, linkedin_requests: 0, email_goal: 25, call_goal: 10, linkedin_goal: 15 })
  const [streak, setStreak] = useState<{ date: string; goalHit: boolean }[]>([])
  const [weeklyVol, setWeeklyVol] = useState<{ week: string; count: number }[]>([])
  const [replyTrend, setReplyTrend] = useState<{ week: string; rate: number }[]>([])
  const [pipelineSummary, setPipelineSummary] = useState<{ stage: string; count: number }[]>([])
  const [companyBreakdown, setCompanyBreakdown] = useState<Record<string, unknown>[]>([])
  const [pipelineOpen, setPipelineOpen] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getCRMDashboardStats(), getTodayGoals(), getStreak(),
      getWeeklyEmailVolume(), getReplyRateTrend(), getPipelineStageSummary(), getCompanyBreakdown(),
    ]).then(([s, g, sk, wv, rt, ps, cb]) => {
      setStats(s as Record<string, unknown>)
      setGoals(g as Record<string, unknown>)
      setStreak(sk)
      setWeeklyVol(wv)
      setReplyTrend(rt)
      setPipelineSummary(ps)
      setCompanyBreakdown(cb as Record<string, unknown>[])
      setLoading(false)
    })
  }, [])

  const today = new Date().toISOString().split('T')[0]
  const updateTarget = useCallback(async (field: string, val: number) => {
    setGoals(g => ({ ...g, [field]: val }))
    await updateGoalTargets(today, { [field]: val } as Parameters<typeof updateGoalTargets>[1])
  }, [today])

  if (loading) return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
        {Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 120, background: '#E2E8F0', borderRadius: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  )

  const statCards = [
    { label: 'Emails This Week', value: stats?.emailsThisWeek, icon: Mail, color: '#00B4D8' },
    { label: 'Emails This Month', value: stats?.emailsThisMonth, icon: Mail, color: '#8B5CF6' },
    { label: 'Reply Rate', value: `${stats?.replyRate ?? 0}%`, icon: Check, color: '#10B981' },
    { label: 'LinkedIn This Month', value: '—', icon: Linkedin, color: '#0077B5' },
    { label: 'Demo Calls Booked', value: '—', icon: Phone, color: '#F4A62A' },
    { label: 'Total Converted', value: stats?.totalConverted, icon: Check, color: '#10B981' },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Today's Goals */}
      <Card style={{ marginBottom: 20 }}>
        <SH>Today&apos;s Goals</SH>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', maxWidth: 600, gap: 4 }}>
          <GoalBar label="Emails Today" current={goals.emails_sent as number ?? 0} target={goals.email_goal as number ?? 25} color="#00B4D8"
            onTargetEdit={v => updateTarget('email_goal', v)} />
          <GoalBar label="Calls Today" current={goals.calls_made as number ?? 0} target={goals.call_goal as number ?? 10} color="#F4A62A"
            onTargetEdit={v => updateTarget('call_goal', v)} />
          <GoalBar label="LinkedIn Today" current={goals.linkedin_requests as number ?? 0} target={goals.linkedin_goal as number ?? 15} color="#0077B5"
            onTargetEdit={v => updateTarget('linkedin_goal', v)} />
        </div>
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>7-Day Streak</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {streak.map(d => (
              <div key={d.date} title={d.date} style={{ width: 20, height: 20, borderRadius: 10, background: d.goalHit ? '#10B981' : '#E2E8F0' }} />
            ))}
          </div>
        </div>
      </Card>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 20 }}>
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} style={{ padding: 16 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
              <Icon size={15} color={color} />
            </div>
            <p style={{ fontSize: 24, fontWeight: 800, color: '#0D1B2A', margin: '0 0 2px', lineHeight: 1 }}>{value ?? '0'}</p>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{label}</p>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Card>
          <SH>Weekly Email Volume</SH>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyVol}>
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={{ background: '#0D1B2A', border: 'none', borderRadius: 8, color: '#FFF', fontSize: 12 }} />
              <Bar dataKey="count" fill="#00B4D8" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <SH>Reply Rate Trend</SH>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={replyTrend}>
              <defs>
                <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} width={30} tickFormatter={v => `${v}%`} />
              <Tooltip formatter={(v: number) => [`${v}%`, 'Reply Rate']} contentStyle={{ background: '#0D1B2A', border: 'none', borderRadius: 8, color: '#FFF', fontSize: 12 }} />
              <Area type="monotone" dataKey="rate" stroke="#10B981" strokeWidth={2} fill="url(#rg)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Pipeline Summary */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: pipelineOpen ? 16 : 0 }} onClick={() => setPipelineOpen(o => !o)}>
          <SH>Pipeline Summary</SH>
          {pipelineOpen ? <ChevronDown size={16} color="#94A3B8" /> : <ChevronRight size={16} color="#94A3B8" />}
        </div>
        {pipelineOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pipelineSummary.map(({ stage, count }) => {
              const isDay5 = stage === 'contacted'
              const isDay12 = stage === 'demo_sent'
              const bg = count > 0 && isDay5 ? '#FEF3C7' : count > 0 && isDay12 ? '#FEE2E2' : 'transparent'
              return (
                <button key={stage} onClick={() => router.push(`/admin/crm/queue?stage=${stage}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: bg, border: `1px solid ${bg === 'transparent' ? '#F0F4F8' : 'transparent'}`, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                  <span style={{ fontSize: 14, color: '#0D1B2A', fontWeight: 500 }}>{STAGE_LABELS[stage] ?? stage}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: count > 0 && isDay12 ? '#EF4444' : count > 0 && isDay5 ? '#D97706' : '#0D1B2A' }}>{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {/* Company Breakdown */}
      <Card>
        <SH>Company Breakdown</SH>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F0F4F8' }}>
                {['Company', 'Type', 'Total Leads', 'Contacted', 'Converted'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companyBreakdown.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '32px 12px', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>No data yet</td></tr>
              ) : companyBreakdown.map((row, i) => {
                const ct = (row.company_type as string) ?? 'other'
                const ctc = COMPANY_TYPE_COLORS[ct] ?? COMPANY_TYPE_COLORS.other
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #F0F4F8' }}>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#0D1B2A' }}>{row.company as string}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: ctc.bg, color: ctc.color }}>{ct.replace('_', ' ')}</span>
                    </td>
                    <td style={{ padding: '12px', fontWeight: 700, color: '#0D1B2A' }}>{row.total as number}</td>
                    <td style={{ padding: '12px', color: '#00B4D8', fontWeight: 600 }}>{row.contacted as number}</td>
                    <td style={{ padding: '12px', color: '#10B981', fontWeight: 600 }}>{row.converted as number}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

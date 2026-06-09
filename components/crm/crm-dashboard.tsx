'use client'

import { useState, useEffect } from 'react'
import { getCRMDashboardStats } from '@/lib/crm-actions'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Mail, TrendingUp, Link2, Users, CheckCircle } from 'lucide-react'

export default function CRMDashboard() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCRMDashboardStats().then(s => { setStats(s); setLoading(false) })
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>

  const statCards = [
    { label: 'Emails This Week', value: stats.emailsThisWeek, icon: Mail, color: 'text-blue-400' },
    { label: 'Emails This Month', value: stats.emailsThisMonth, icon: Mail, color: 'text-blue-300' },
    { label: 'Reply Rate', value: `${stats.replyRate}%`, icon: TrendingUp, color: 'text-green-400' },
    { label: 'Total Converted', value: stats.totalConverted, icon: CheckCircle, color: 'text-emerald-400' },
  ]

  const weeklyGoals = stats.weeklyGoals ?? []

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white">CRM Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-gray-800 rounded-2xl p-4">
            <card.icon size={20} className={card.color + ' mb-2'} />
            <p className="text-2xl font-bold text-white">{card.value}</p>
            <p className="text-xs text-gray-400 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {weeklyGoals.length > 0 && (
        <div className="bg-gray-800 rounded-2xl p-5">
          <p className="text-sm font-semibold text-gray-300 mb-4">Weekly Email Volume</p>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={weeklyGoals.reverse()}>
              <Bar dataKey="emails_sent" fill="#dc5010" radius={[3, 3, 0, 0]} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v: any) => [`${v} emails`, '']} contentStyle={{ background: '#1f2937', border: 'none', color: '#fff' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

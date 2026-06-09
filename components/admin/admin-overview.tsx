'use client'

import { useState, useEffect } from 'react'
import { getAdminStats, getOverageTracker } from '@/lib/admin-actions'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, Users, FileText, Zap, AlertTriangle } from 'lucide-react'

const COLORS = ['#1e3a5f', '#dc5010', '#16a34a', '#d97706', '#6b7280']

export default function AdminOverview() {
  const [stats, setStats] = useState<any>(null)
  const [overage, setOverage] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getAdminStats(), getOverageTracker()]).then(([s, o]) => {
      setStats(s)
      setOverage(o)
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>

  const statCards = [
    { label: 'MRR', value: `$${(stats.mrr).toLocaleString()}`, icon: TrendingUp, color: 'text-green-400' },
    { label: 'Active Customers', value: stats.activeCustomers, icon: Users, color: 'text-blue-400' },
    { label: 'Reports This Month', value: stats.reportsThisMonth, icon: FileText, color: 'text-purple-400' },
    { label: 'Avg Reports/Customer', value: stats.avgReportsPerCustomer, icon: Zap, color: 'text-yellow-400' },
    { label: 'Trial Accounts', value: stats.trialAccounts, icon: Users, color: 'text-orange-400' },
  ]

  const planBreakdown = Object.entries(
    stats.topCustomers.reduce((acc: any, c: any) => {
      acc[c.subscription_tier ?? 'unknown'] = (acc[c.subscription_tier ?? 'unknown'] ?? 0) + 1
      return acc
    }, {})
  ).map(([name, value]) => ({ name, value }))

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white">Admin Overview</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-gray-800 rounded-2xl p-4">
            <card.icon size={20} className={card.color + ' mb-2'} />
            <p className="text-2xl font-bold text-white">{String(card.value)}</p>
            <p className="text-xs text-gray-400 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-2xl p-4">
          <p className="text-sm font-semibold text-gray-300 mb-4">Plan Breakdown</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={planBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, value }) => `${name} (${value})`}>
                {planBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-gray-800 rounded-2xl p-4">
          <p className="text-sm font-semibold text-gray-300 mb-4">Top Customers by Usage</p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {stats.topCustomers.slice(0, 8).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="text-gray-300 truncate max-w-[160px]">{c.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 capitalize">{c.subscription_tier}</span>
                  <span className="text-white font-medium">{c.reportsThisMonth}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overage Tracker */}
      {overage.length > 0 && (
        <div className="bg-gray-800 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-gray-700 flex items-center gap-2">
            <AlertTriangle size={16} className="text-orange-400" />
            <p className="text-sm font-semibold text-gray-300">Overage Tracker</p>
          </div>
          <div className="divide-y divide-gray-700">
            {overage.map(c => (
              <div key={c.id} className="flex items-center justify-between p-4 text-sm">
                <div>
                  <p className="text-white font-medium">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.planName}</p>
                </div>
                <div className="text-right">
                  <p className="text-orange-400 font-medium">{c.overageCount} over</p>
                  <p className="text-xs text-gray-400">${c.overageRevenue.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="bg-gray-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <p className="text-sm font-semibold text-gray-300">Recent Activity</p>
        </div>
        <div className="divide-y divide-gray-700">
          {stats.recentActivity.slice(0, 10).map((item: any) => (
            <div key={item.id} className="flex items-center justify-between p-4 text-sm">
              <div>
                <p className="text-white font-mono">{item.vin ?? 'Unknown'}</p>
                <p className="text-xs text-gray-400">{(item as any).companies?.name ?? item.company_id}</p>
              </div>
              <p className="text-xs text-gray-500">{new Date(item.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

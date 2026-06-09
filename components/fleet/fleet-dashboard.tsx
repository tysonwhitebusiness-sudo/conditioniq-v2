'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { getFMCDashboardStats, getFMCInspectionRequests } from '@/lib/fleet-actions'
import { MapPin, Clock, CheckCircle, Car, BarChart2 } from 'lucide-react'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-700 text-gray-300',
  link_opened: 'bg-yellow-900 text-yellow-300',
  in_progress: 'bg-blue-900 text-blue-300',
  completed: 'bg-green-900 text-green-300',
  expired: 'bg-red-900 text-red-300',
}

export default function FleetDashboard() {
  const { effectiveCompany } = useAuth()
  const [stats, setStats] = useState<any>(null)
  const [requests, setRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!effectiveCompany) return
    Promise.all([
      getFMCDashboardStats(effectiveCompany.id),
      getFMCInspectionRequests(effectiveCompany.id),
    ]).then(([s, r]) => { setStats(s); setRequests(r.slice(0, 10)); setLoading(false) })
  }, [effectiveCompany])

  if (loading || !stats) return <div className="p-8 text-center text-[#1e3a5f]">Loading fleet data...</div>

  const statCards = [
    { label: 'Active Locations', value: stats.totalActiveLocations, icon: MapPin, color: 'text-blue-600' },
    { label: 'Pending Inspections', value: stats.pendingInspections, icon: Clock, color: 'text-yellow-600' },
    { label: 'Completed This Month', value: stats.completedThisMonth, icon: CheckCircle, color: 'text-green-600' },
    { label: 'Active Vehicles', value: stats.totalActiveVehicles, icon: Car, color: 'text-purple-600' },
    { label: 'Avg Condition Score', value: stats.avgConditionScore ? `${stats.avgConditionScore}/100` : 'N/A', icon: BarChart2, color: 'text-[#dc5010]' },
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Fleet Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-2xl p-4">
            <card.icon size={20} className={card.color + ' mb-2'} />
            <p className="text-2xl font-bold text-gray-900">{String(card.value)}</p>
            <p className="text-xs text-gray-400 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900">Recent Dispatch Activity</p>
        </div>
        {requests.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No recent activity</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {requests.map(req => (
              <div key={req.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{req.vin ?? 'No VIN'}</p>
                  <p className="text-xs text-gray-400">{req.fmc_locations?.name ?? 'No location'} · {new Date(req.dispatched_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_BADGE[req.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {req.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

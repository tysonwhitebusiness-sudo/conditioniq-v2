'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { getFMCReports, getFMCLocations } from '@/lib/fleet-actions'
import { Search, Download } from 'lucide-react'
import { generateInspectionPDF } from '@/lib/pdf-generator'
import { calculateVehicleScore } from '@/lib/vehicle-score'

export default function FleetReports() {
  const { effectiveCompany } = useAuth()
  const [reports, setReports] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!effectiveCompany) return
    const [rep, loc] = await Promise.all([
      getFMCReports(effectiveCompany.id, { search: search || undefined }),
      getFMCLocations(effectiveCompany.id),
    ])
    setReports(rep)
    setLocations(loc)
    setLoading(false)
  }

  useEffect(() => { load() }, [effectiveCompany, search])

  const handleDownload = async (report: any) => {
    const score = calculateVehicleScore(report)
    await generateInspectionPDF(report, score, report.signature_url ?? '')
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Fleet Reports</h1>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-3 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search VIN..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
        </div>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
          <option value="">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : reports.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No reports found</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {reports.map(r => (
              <div key={r.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium font-mono text-gray-900 text-sm">{r.vin}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(r.created_at).toLocaleDateString()} · {(r as any).user_profiles?.full_name ?? 'Unknown inspector'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {r.vehicle_score && <span className="text-sm font-medium text-gray-700">{r.vehicle_score}/100</span>}
                  <button onClick={() => handleDownload(r)} className="p-2 text-gray-500 hover:text-[#1e3a5f]">
                    <Download size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { getFMCInventory, getFMCLocations, upsertFMCVehicle } from '@/lib/fleet-actions'
import { Search, Plus } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700', pending_inspection: 'bg-yellow-100 text-yellow-700',
  inspected: 'bg-blue-100 text-blue-700', released: 'bg-gray-100 text-gray-500',
}

export default function FleetInventory() {
  const { effectiveCompany } = useAuth()
  const [inventory, setInventory] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [addVin, setAddVin] = useState('')
  const [addLocation, setAddLocation] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!effectiveCompany) return
    const [inv, loc] = await Promise.all([
      getFMCInventory(effectiveCompany.id, { search: search || undefined, status: statusFilter || undefined, locationId: locationFilter || undefined }),
      getFMCLocations(effectiveCompany.id),
    ])
    setInventory(inv)
    setLocations(loc)
    setLoading(false)
  }

  useEffect(() => { load() }, [effectiveCompany, search, statusFilter, locationFilter])

  const handleAdd = async () => {
    if (!effectiveCompany || !addVin.trim()) return
    await upsertFMCVehicle({ fmc_account_id: effectiveCompany.id, vin: addVin.trim().toUpperCase(), location_id: addLocation || null, status: 'active' })
    setAddVin('')
    setAddLocation('')
    load()
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Vehicle Inventory</h1>

      {/* Add vehicle */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 flex gap-3">
        <input value={addVin} onChange={e => setAddVin(e.target.value.toUpperCase())} placeholder="VIN" className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm uppercase" />
        <select value={addLocation} onChange={e => setAddLocation(e.target.value)} className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm">
          <option value="">No location</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <button onClick={handleAdd} disabled={!addVin.trim()} className="flex items-center gap-1 px-4 py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-medium disabled:opacity-50">
          <Plus size={15} /> Add
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-3 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search VIN..." className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
          <option value="">All Status</option>
          {['active', 'pending_inspection', 'inspected', 'released'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm">
          <option value="">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : inventory.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No vehicles found</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {inventory.map(v => (
              <div key={v.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium font-mono text-gray-900">{v.vin}</p>
                  <p className="text-xs text-gray-400">{v.fmc_locations?.name ?? 'No location'}</p>
                </div>
                <div className="flex items-center gap-3">
                  {v.vehicle_inspections?.vehicle_score && (
                    <span className="text-sm text-gray-500">{v.vehicle_inspections.vehicle_score}/100</span>
                  )}
                  <span className={`text-xs px-2 py-1 rounded-full capitalize ${STATUS_COLORS[v.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {v.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

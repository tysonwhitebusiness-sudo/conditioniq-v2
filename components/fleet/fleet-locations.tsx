'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { getFMCLocations, upsertFMCLocation, toggleFMCLocation } from '@/lib/fleet-actions'
import { Plus, ToggleLeft, ToggleRight, MapPin } from 'lucide-react'

export default function FleetLocations() {
  const { effectiveCompany, user } = useAuth()
  const [locations, setLocations] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', city: '', state: '' })
  const [adding, setAdding] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!effectiveCompany) return
    const data = await getFMCLocations(effectiveCompany.id)
    setLocations(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [effectiveCompany])

  const handleAdd = async () => {
    if (!effectiveCompany || !user || !form.name.trim()) return
    setAdding(true)
    await upsertFMCLocation({ ...form, fmc_account_id: user.id })
    setForm({ name: '', city: '', state: '' })
    setAdding(false)
    load()
  }

  const handleToggle = async (id: string, active: boolean) => {
    await toggleFMCLocation(id, !active)
    setLocations(prev => prev.map(l => l.id === id ? { ...l, active: !active } : l))
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Locations</h1>
        <span className="text-gray-400 text-sm">{locations.filter(l => l.active).length} active</span>
      </div>

      {/* Add form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h2 className="font-semibold text-gray-900">Add Location</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Location name *" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
          </div>
          <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="City" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
          <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="ST" maxLength={2} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm uppercase" />
        </div>
        <button onClick={handleAdd} disabled={adding || !form.name.trim()} className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-medium disabled:opacity-50">
          <Plus size={16} /> Add Location
        </button>
      </div>

      {/* List */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : locations.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No locations yet</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {locations.map(loc => (
              <div key={loc.id} className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <MapPin size={18} className={loc.active ? 'text-[#1e3a5f]' : 'text-gray-300'} />
                  <div>
                    <p className="font-medium text-gray-900">{loc.name}</p>
                    <p className="text-xs text-gray-400">{[loc.city, loc.state].filter(Boolean).join(', ')}</p>
                  </div>
                </div>
                <button onClick={() => handleToggle(loc.id, loc.active)} className={loc.active ? 'text-green-500' : 'text-gray-300'}>
                  {loc.active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

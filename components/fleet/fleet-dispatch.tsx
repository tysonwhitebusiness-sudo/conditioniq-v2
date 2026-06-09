'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { getFMCInspectionRequests, getFMCLocations, createFMCDispatchLink } from '@/lib/fleet-actions'
import { Send, Copy, Check, Link } from 'lucide-react'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700', link_opened: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-purple-100 text-purple-700', completed: 'bg-green-100 text-green-700', expired: 'bg-red-100 text-red-700',
}

export default function FleetDispatch() {
  const { effectiveCompany } = useAuth()
  const [requests, setRequests] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [form, setForm] = useState({ vin: '', locationId: '', notes: '', expiresInDays: 7 })
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!effectiveCompany) return
    const [req, loc] = await Promise.all([getFMCInspectionRequests(effectiveCompany.id), getFMCLocations(effectiveCompany.id)])
    setRequests(req)
    setLocations(loc.filter((l: any) => l.active))
    setLoading(false)
  }

  useEffect(() => { load() }, [effectiveCompany])

  const handleCreate = async () => {
    if (!effectiveCompany) return
    setCreating(true)
    try {
      const token = await createFMCDispatchLink({
        fmcAccountId: effectiveCompany.id,
        locationId: form.locationId || undefined,
        vin: form.vin || undefined,
        notes: form.notes || undefined,
        expiresInDays: form.expiresInDays,
      })
      const link = `${window.location.origin}/fleet/inspect/${token}`
      await navigator.clipboard.writeText(link)
      setCopied(token)
      setTimeout(() => setCopied(null), 3000)
      setForm({ vin: '', locationId: '', notes: '', expiresInDays: 7 })
      load()
    } finally {
      setCreating(false)
    }
  }

  const copyLink = async (token: string) => {
    const link = `${window.location.origin}/fleet/inspect/${token}`
    await navigator.clipboard.writeText(link)
    setCopied(token)
    setTimeout(() => setCopied(null), 3000)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Dispatch</h1>

      {/* Create form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-900">Create Dispatch Link</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">VIN (optional)</label>
            <input value={form.vin} onChange={e => setForm(f => ({ ...f, vin: e.target.value.toUpperCase() }))} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="VIN" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Location</label>
            <select value={form.locationId} onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm">
              <option value="">No location</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-xs text-gray-500 mb-1 block">Notes (optional)</label>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" placeholder="Special instructions..." />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Expires in (days)</label>
            <input type="number" value={form.expiresInDays} onChange={e => setForm(f => ({ ...f, expiresInDays: parseInt(e.target.value) }))} className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" min={1} max={30} />
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full flex items-center justify-center gap-2 py-3 bg-[#1e3a5f] text-white rounded-xl font-medium disabled:opacity-50"
        >
          {creating ? 'Creating...' : <><Send size={16} /> Create & Copy Link</>}
        </button>
        {copied === 'new' && <p className="text-green-600 text-sm text-center">Link copied to clipboard!</p>}
      </div>

      {/* Requests table */}
      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-gray-100 font-semibold text-gray-900">Active Requests</div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No dispatch requests</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {requests.map(req => (
              <div key={req.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">{req.vin ?? 'No VIN'}</p>
                  <p className="text-xs text-gray-400">{req.fmc_locations?.name ?? 'No location'} · {new Date(req.dispatched_at).toLocaleDateString()}</p>
                  {req.notes && <p className="text-xs text-gray-400 mt-0.5">{req.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_BADGE[req.status] ?? 'bg-gray-100'}`}>{req.status}</span>
                  <button onClick={() => copyLink(req.link_token)} className={`p-2 rounded-lg ${copied === req.link_token ? 'text-green-600 bg-green-50' : 'text-gray-500 hover:bg-gray-50'}`}>
                    {copied === req.link_token ? <Check size={16} /> : <Copy size={16} />}
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

'use client'

import { useState, useEffect } from 'react'
import { getAllCompanies, updateCompanyBilling, getCompanyInspections, getCompanyNotes, addCompanyNote } from '@/lib/admin-actions'
import { useAuth } from '@/contexts/auth-context'
import { getPlan } from '@/lib/pricing'
import { Search, Ghost, X, Plus } from 'lucide-react'

const TIER_COLORS: Record<string, string> = {
  demo: 'bg-gray-700 text-gray-300',
  legacy_starter: 'bg-blue-900 text-blue-300',
  starter: 'bg-blue-800 text-blue-200',
  growth: 'bg-purple-800 text-purple-200',
  pro: 'bg-orange-900 text-orange-300',
  enterprise: 'bg-green-900 text-green-300',
}

export default function AdminCustomers() {
  const { setImpersonatedCompany } = useAuth()
  const [companies, setCompanies] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [selected, setSelected] = useState<any>(null)
  const [inspections, setInspections] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editBilling, setEditBilling] = useState<any>(null)

  useEffect(() => {
    getAllCompanies().then(data => { setCompanies(data); setLoading(false) })
  }, [])

  const openCompany = async (company: any) => {
    setSelected(company)
    setEditBilling({ reports_used: company.reports_used, reports_included: company.reports_included, subscription_tier: company.subscription_tier })
    const [ins, n] = await Promise.all([getCompanyInspections(company.id), getCompanyNotes(company.id)])
    setInspections(ins)
    setNotes(n)
  }

  const saveBilling = async () => {
    if (!selected || !editBilling) return
    setSaving(true)
    await updateCompanyBilling(selected.id, editBilling)
    setCompanies(prev => prev.map(c => c.id === selected.id ? { ...c, ...editBilling } : c))
    setSaving(false)
  }

  const handleAddNote = async () => {
    if (!selected || !newNote.trim()) return
    await addCompanyNote(selected.id, newNote.trim())
    setNotes(prev => [{ id: Date.now(), note: newNote.trim(), created_at: new Date().toISOString() }, ...prev])
    setNewNote('')
  }

  const filtered = companies.filter(c => {
    const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase())
    const matchTier = !tierFilter || c.subscription_tier === tierFilter
    return matchSearch && matchTier
  })

  const TIERS = ['demo', 'legacy_starter', 'starter', 'growth', 'pro', 'enterprise']

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-white">Customers</h1>
        <span className="text-gray-400 text-sm">({companies.length})</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-3 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm" />
        </div>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm">
          <option value="">All Plans</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : (
          <div className="divide-y divide-gray-700">
            {filtered.map(company => {
              const plan = getPlan(company.subscription_tier)
              const pct = plan.reportsIncluded > 0 ? (company.reports_used / plan.reportsIncluded) * 100 : 0
              const ageDays = Math.floor((Date.now() - new Date(company.created_at).getTime()) / 86400000)
              return (
                <div key={company.id} onClick={() => openCompany(company)} className="flex items-center justify-between p-4 hover:bg-gray-750 cursor-pointer">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-white font-medium">{company.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${TIER_COLORS[company.subscription_tier ?? 'starter'] ?? 'bg-gray-700'}`}>
                        {company.subscription_tier ?? 'starter'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{ageDays} days old</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">{company.reports_used}/{company.reports_included}</p>
                    <div className="w-24 bg-gray-700 rounded-full h-1.5 mt-1">
                      <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-orange-400' : pct >= 80 ? 'bg-yellow-400' : 'bg-blue-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Company Drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/50" onClick={() => setSelected(null)} />
          <div className="w-full max-w-md bg-gray-900 overflow-y-auto">
            <div className="p-5 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{selected.name}</h2>
              <button onClick={() => setSelected(null)}><X size={20} className="text-gray-400" /></button>
            </div>

            <div className="p-5 space-y-5">
              {/* Ghost Mode */}
              <button
                onClick={() => { setImpersonatedCompany(selected); setSelected(null) }}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-purple-700 text-white rounded-xl text-sm font-medium"
              >
                <Ghost size={16} /> Enter Ghost Mode
              </button>

              {/* Billing Controls */}
              <div className="bg-gray-800 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-300">Billing Controls</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400">Reports Used</label>
                    <input type="number" value={editBilling?.reports_used ?? 0} onChange={e => setEditBilling((b: any) => ({ ...b, reports_used: parseInt(e.target.value) }))} className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Reports Included</label>
                    <input type="number" value={editBilling?.reports_included ?? 30} onChange={e => setEditBilling((b: any) => ({ ...b, reports_included: parseInt(e.target.value) }))} className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Plan</label>
                  <select value={editBilling?.subscription_tier ?? 'starter'} onChange={e => setEditBilling((b: any) => ({ ...b, subscription_tier: e.target.value }))} className="w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                    {['demo', 'legacy_starter', 'starter', 'growth', 'pro', 'enterprise'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button onClick={saveBilling} disabled={saving} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>

              {/* Notes */}
              <div>
                <p className="text-sm font-semibold text-gray-300 mb-2">Notes</p>
                <div className="flex gap-2 mb-3">
                  <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add note..." className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm" onKeyDown={e => e.key === 'Enter' && handleAddNote()} />
                  <button onClick={handleAddNote} className="p-2 bg-blue-600 text-white rounded-lg"><Plus size={16} /></button>
                </div>
                {notes.map(n => (
                  <div key={n.id} className="bg-gray-800 rounded-lg p-3 mb-2">
                    <p className="text-sm text-gray-300">{n.note}</p>
                    <p className="text-xs text-gray-500 mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>

              {/* Recent Inspections */}
              <div>
                <p className="text-sm font-semibold text-gray-300 mb-2">Recent Inspections</p>
                {inspections.slice(0, 8).map(ins => (
                  <div key={ins.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                    <div>
                      <p className="text-sm font-mono text-white">{ins.vin}</p>
                      <p className="text-xs text-gray-400">{new Date(ins.created_at).toLocaleDateString()}</p>
                    </div>
                    {ins.vehicle_score && <span className="text-sm text-gray-300">{ins.vehicle_score}/100</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { getCRMLeads, upsertCRMLead, updateLeadStatus } from '@/lib/crm-actions'
import EmailGenerator from './email-generator'
import { Search, Plus, Filter, ChevronRight } from 'lucide-react'

const STATUSES = ['new', 'contacted', 'demo_sent', 'trial_active', 'converted', 'not_interested']
const EMAIL_STATUSES = ['verified', 'predicted', 'bounced', 'unverified']
const STATUS_BADGE: Record<string, string> = {
  new: 'bg-gray-700 text-gray-300', contacted: 'bg-blue-900 text-blue-300', demo_sent: 'bg-purple-900 text-purple-300',
  trial_active: 'bg-green-900 text-green-300', converted: 'bg-emerald-900 text-emerald-300', not_interested: 'bg-red-900 text-red-300',
}
const EMAIL_BADGE: Record<string, string> = {
  verified: 'bg-green-900 text-green-300', predicted: 'bg-yellow-900 text-yellow-300',
  bounced: 'bg-red-900 text-red-300', unverified: 'bg-gray-700 text-gray-300',
}

export default function AllLeads() {
  const [leads, setLeads] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newLead, setNewLead] = useState({ first_name: '', last_name: '', email: '', company: '', job_title: '', company_type: 'storage_facility' })

  const load = useCallback(async () => {
    setLoading(true)
    const { leads: data, total: t } = await getCRMLeads({ search: search || undefined, status: statusFilter || undefined, email_status: emailFilter || undefined, limit: 100 })
    setLeads(data)
    setTotal(t)
    setLoading(false)
  }, [search, statusFilter, emailFilter])

  useEffect(() => { load() }, [load])

  const handleAdd = async () => {
    if (!newLead.email) return
    await upsertCRMLead(newLead)
    setShowAddForm(false)
    setNewLead({ first_name: '', last_name: '', email: '', company: '', job_title: '', company_type: 'storage_facility' })
    load()
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Leads <span className="text-gray-500 font-normal text-lg">({total})</span></h1>
        <button onClick={() => setShowAddForm(v => !v)} className="flex items-center gap-2 px-4 py-2 bg-[#dc5010] text-white rounded-xl text-sm font-medium">
          <Plus size={16} /> Add Lead
        </button>
      </div>

      {showAddForm && (
        <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {(['first_name', 'last_name', 'email', 'company', 'job_title'] as const).map(field => (
              <input
                key={field}
                placeholder={field.replace('_', ' ')}
                value={newLead[field]}
                onChange={e => setNewLead(n => ({ ...n, [field]: e.target.value }))}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            ))}
            <select value={newLead.company_type} onChange={e => setNewLead(n => ({ ...n, company_type: e.target.value }))} className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
              <option value="storage_facility">Storage Facility</option>
              <option value="tow_impound">Tow & Impound</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button onClick={handleAdd} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium">Add Lead</button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 border border-gray-600 text-gray-300 rounded-xl text-sm">Cancel</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..." className="w-full pl-9 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
          <option value="">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={emailFilter} onChange={e => setEmailFilter(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm">
          <option value="">All Email</option>
          {EMAIL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No leads found</div>
        ) : (
          <div className="divide-y divide-gray-700">
            {leads.map(lead => (
              <div key={lead.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium">{lead.first_name} {lead.last_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[lead.status] ?? 'bg-gray-700'}`}>{lead.status}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${EMAIL_BADGE[lead.email_status] ?? 'bg-gray-700'}`}>{lead.email_status}</span>
                    </div>
                    <p className="text-sm text-gray-400">{lead.company} · {lead.email}</p>
                  </div>
                  <div className="flex gap-2 ml-3">
                    <button
                      onClick={() => setSelectedLead(selectedLead?.id === lead.id ? null : lead)}
                      className="px-3 py-1.5 bg-[#dc5010] text-white rounded-lg text-xs font-medium"
                    >
                      Email
                    </button>
                    <a href={`/admin/crm/leads/${lead.id}`} className="p-1.5 text-gray-400 hover:text-white">
                      <ChevronRight size={16} />
                    </a>
                  </div>
                </div>
                {selectedLead?.id === lead.id && (
                  <div className="mt-4">
                    <EmailGenerator lead={lead} onSent={() => { setSelectedLead(null); load() }} onClose={() => setSelectedLead(null)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

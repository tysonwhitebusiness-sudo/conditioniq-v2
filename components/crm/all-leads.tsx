'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getCRMLeads, updateLeadStatus, updateLeadField } from '@/lib/crm-actions'
import { Search, Plus, X, Filter } from 'lucide-react'

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  new:            { label: 'New',            bg: '#F0F4F8', color: '#4A5568' },
  contacted:      { label: 'Contacted',      bg: '#E0F7FC', color: '#0097B2' },
  demo_sent:      { label: 'Demo Sent',      bg: '#EFF6FF', color: '#1D4ED8' },
  trial_active:   { label: 'Trial Active',   bg: '#EDE9FE', color: '#5B21B6' },
  proposal:       { label: 'Proposal',       bg: '#FEF3C7', color: '#D97706' },
  converted:      { label: 'Converted',      bg: '#D1FAE5', color: '#065F46' },
  not_interested: { label: 'Not Interested', bg: '#F0F4F8', color: '#94A3B8' },
}

const PRIORITY_CFG: Record<string, { label: string; bg: string; color: string }> = {
  P0: { label: 'P0', bg: '#FEE2E2', color: '#DC2626' },
  P1: { label: 'P1', bg: '#FEF3C7', color: '#D97706' },
  P2: { label: 'P2', bg: '#F0F4F8', color: '#4A5568' },
}

const CT_CFG: Record<string, { label: string; bg: string; color: string }> = {
  storage_facility: { label: 'Storage',    bg: '#E0F7FC', color: '#0097B2' },
  tow_impound:      { label: 'Tow/Impound',bg: '#FFF0E8', color: '#C2410C' },
  fleet:            { label: 'Fleet',      bg: '#EDE9FE', color: '#5B21B6' },
  fmc:              { label: 'FMC',        bg: '#EFF6FF', color: '#1D4ED8' },
  other:            { label: 'Other',      bg: '#F0F4F8', color: '#4A5568' },
}

const STATUSES = Object.keys(STATUS_CFG)
const CT_KEYS = Object.keys(CT_CFG)

export default function AllLeads() {
  const router = useRouter()
  const [leads, setLeads] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ctFilter, setCtFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [newLead, setNewLead] = useState({ first_name: '', last_name: '', email: '', company: '', job_title: '', company_type: 'storage_facility', priority: 'P1' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { leads: data, total: t } = await getCRMLeads({
        status: statusFilter || undefined,
        company_type: ctFilter || undefined,
        search: search || undefined,
        limit: 100,
      })
      setLeads(data as Record<string, unknown>[])
      setTotal(t)
    } finally { setLoading(false) }
  }, [search, statusFilter, ctFilter])

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t) }, [load])

  const toggleSelect = (id: string) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  const toggleAll = () => {
    selected.size === leads.length ? setSelected(new Set()) : setSelected(new Set(leads.map(l => l.id as string)))
  }

  const handleAddLead = async () => {
    if (!newLead.first_name || !newLead.email) return
    setSaving(true)
    try {
      const { upsertCRMLead } = await import('@/lib/crm-actions')
      await upsertCRMLead({ ...newLead, status: 'new', email_status: 'unverified' })
      setShowAdd(false)
      setNewLead({ first_name: '', last_name: '', email: '', company: '', job_title: '', company_type: 'storage_facility', priority: 'P1' })
      await load()
    } finally { setSaving(false) }
  }

  const handleStatusChange = async (leadId: string, status: string) => {
    await updateLeadStatus(leadId, status)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l))
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>All Leads ({total})</h1>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads..."
            style={{ height: 38, paddingLeft: 32, paddingRight: 12, border: '1px solid #E1E8F0', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#FFF', width: 200 }} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ height: 38, padding: '0 10px', border: '1px solid #E1E8F0', borderRadius: 10, fontSize: 13, background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
        </select>
        <select value={ctFilter} onChange={e => setCtFilter(e.target.value)}
          style={{ height: 38, padding: '0 10px', border: '1px solid #E1E8F0', borderRadius: 10, fontSize: 13, background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
          <option value="">All Types</option>
          {CT_KEYS.map(k => <option key={k} value={k}>{CT_CFG[k].label}</option>)}
        </select>
        <button onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Plus size={14} /> Add Lead
        </button>
      </div>

      {/* Table */}
      <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(13,27,42,0.06)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F0F4F8' }}>
              <th style={{ padding: '12px 16px', width: 40 }}>
                <input type="checkbox" checked={selected.size === leads.length && leads.length > 0} onChange={toggleAll} style={{ accentColor: '#00B4D8' }} />
              </th>
              {['Name', 'Company Type', 'Company', 'Job Title', 'Email', 'Priority', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={9} style={{ padding: '14px 16px' }}>
                    <div style={{ height: 14, background: '#E2E8F0', borderRadius: 7, animation: 'pulse 1.5s ease-in-out infinite', width: `${60 + Math.random() * 30}%` }} />
                  </td>
                </tr>
              ))
            ) : leads.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: '48px 16px', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>No leads found</td></tr>
            ) : leads.map((lead, idx) => {
              const status = (lead.status as string) ?? 'new'
              const priority = (lead.priority as string) ?? 'P2'
              const ct = (lead.company_type as string) ?? 'other'
              const sc = STATUS_CFG[status] ?? STATUS_CFG.new
              const pc = PRIORITY_CFG[priority] ?? PRIORITY_CFG.P2
              const ctc = CT_CFG[ct] ?? CT_CFG.other
              return (
                <tr key={lead.id as string}
                  style={{ borderTop: '1px solid #F0F4F8', background: idx % 2 === 0 ? '#FFF' : '#FAFBFC' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F5F8FA')}
                  onMouseLeave={e => (e.currentTarget.style.background = idx % 2 === 0 ? '#FFF' : '#FAFBFC')}
                >
                  <td style={{ padding: '12px 16px' }}>
                    <input type="checkbox" checked={selected.has(lead.id as string)} onChange={() => toggleSelect(lead.id as string)} style={{ accentColor: '#00B4D8' }} />
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0D1B2A', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    onClick={() => router.push(`/admin/crm/leads/${lead.id}`)}>
                    {lead.first_name as string} {lead.last_name as string}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: ctc.bg, color: ctc.color }}>{ctc.label}</span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#4A5568', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>{lead.company as string ?? '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#4A5568' }}>{lead.job_title as string ?? '—'}</td>
                  <td style={{ padding: '12px 16px', color: '#94A3B8', fontSize: 12 }}>{lead.email as string}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 20, background: pc.bg, color: pc.color }}>{pc.label}</span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <select value={status} onChange={e => handleStatusChange(lead.id as string, e.target.value)}
                      style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: sc.bg, color: sc.color, border: 'none', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}>
                      {STATUSES.map(s => <option key={s} value={s}>{STATUS_CFG[s].label}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <button onClick={() => router.push(`/admin/crm/leads/${lead.id}`)}
                      style={{ fontSize: 12, fontWeight: 600, color: '#00B4D8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      Open →
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1B2A', borderRadius: 14, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 32px rgba(13,27,42,0.3)', zIndex: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#FFF' }}>{selected.size} selected</span>
          <button style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Change Status</button>
          <button style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#00B4D8', color: '#FFF', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Export CSV</button>
          <button onClick={() => setSelected(new Set())}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex' }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* Add lead modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.4)' }} onClick={() => setShowAdd(false)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: 480, maxWidth: '90vw' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>Add Lead</h2>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={16} color="#4A5568" /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              {([['first_name', 'First Name'], ['last_name', 'Last Name'], ['email', 'Email'], ['company', 'Company'], ['job_title', 'Job Title']] as const).map(([k, lbl]) => (
                <div key={k} style={{ gridColumn: k === 'email' ? '1 / -1' : 'auto' }}>
                  <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>{lbl}</label>
                  <input value={newLead[k]} onChange={e => setNewLead(p => ({ ...p, [k]: e.target.value }))}
                    style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Company Type</label>
                <select value={newLead.company_type} onChange={e => setNewLead(p => ({ ...p, company_type: e.target.value }))}
                  style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                  {CT_KEYS.map(k => <option key={k} value={k}>{CT_CFG[k].label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Priority</label>
                <select value={newLead.priority} onChange={e => setNewLead(p => ({ ...p, priority: e.target.value }))}
                  style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 10px', fontSize: 13, background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                  <option value="P0">P0</option>
                  <option value="P1">P1</option>
                  <option value="P2">P2</option>
                </select>
              </div>
            </div>
            <button onClick={handleAddLead} disabled={saving || !newLead.first_name || !newLead.email}
              style={{ width: '100%', height: 42, background: newLead.first_name && newLead.email ? '#F4A62A' : '#E1E8F0', color: newLead.first_name && newLead.email ? '#0D1B2A' : '#94A3B8', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: newLead.first_name && newLead.email ? 'pointer' : 'default', fontFamily: 'inherit' }}>
              {saving ? 'Adding...' : 'Add Lead'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

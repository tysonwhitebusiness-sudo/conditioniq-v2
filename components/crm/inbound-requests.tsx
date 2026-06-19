'use client'

import { useState, useEffect, useCallback } from 'react'
import { getContactRequests, updateContactRequestStatus } from '@/lib/contact-actions'
import { Check, Clock, User, Mail, Building2, ChevronDown } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
  storage_facility: 'Storage Yard',
  tow_impound:      'Tow & Impound',
  fleet:            'Fleet Manager',
  other:            'Other',
}

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  new:        { label: 'New',        bg: '#E0F7FC', color: '#0097B2' },
  contacted:  { label: 'Contacted',  bg: '#FEF3C7', color: '#D97706' },
  converted:  { label: 'Converted',  bg: '#D1FAE5', color: '#059669' },
  not_interested: { label: 'Not Interested', bg: '#FEE2E2', color: '#DC2626' },
}

interface ContactRequest {
  id: string
  name?: string
  email?: string
  company_name?: string
  company_type?: string
  message?: string
  status?: string
  source?: string
  created_at: string
}

function StatusDropdown({ id, current, onChange }: { id: string; current: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const cfg = STATUS_CFG[current] ?? STATUS_CFG.new
  const options = Object.entries(STATUS_CFG)

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
          padding: '4px 9px', borderRadius: 20, border: 'none', cursor: 'pointer',
          background: cfg.bg, color: cfg.color, fontFamily: 'inherit',
        }}
      >
        {cfg.label}
        <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 10, background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 10, boxShadow: '0 4px 16px rgba(13,27,42,0.12)', overflow: 'hidden', minWidth: 140 }}>
            {options.map(([val, c]) => (
              <button
                key={val}
                onClick={() => { onChange(val); setOpen(false) }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px',
                  border: 'none', background: val === current ? '#F0F4F8' : '#FFF',
                  fontSize: 12, fontWeight: val === current ? 700 : 400, cursor: 'pointer',
                  color: c.color, fontFamily: 'inherit',
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function InboundRequests() {
  const [requests, setRequests] = useState<ContactRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  const load = useCallback(async () => {
    try {
      const data = await getContactRequests()
      setRequests(data as ContactRequest[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleStatusChange = async (id: string, status: string) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    await updateContactRequestStatus(id, status)
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => (r.status ?? 'new') === filter)

  const counts = requests.reduce<Record<string, number>>((acc, r) => {
    const s = r.status ?? 'new'
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D1B2A', margin: '0 0 4px' }}>Inbound Requests</h1>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Contact requests submitted from the public landing page.</p>
      </div>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { key: 'all',      label: 'All',          count: requests.length },
          { key: 'new',      label: 'New',           count: counts.new ?? 0 },
          { key: 'contacted',label: 'Contacted',     count: counts.contacted ?? 0 },
          { key: 'converted',label: 'Converted',     count: counts.converted ?? 0 },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
              borderRadius: 20, border: filter === f.key ? 'none' : '1px solid #E1E8F0',
              background: filter === f.key ? '#0D1B2A' : '#FFF',
              color: filter === f.key ? '#FFF' : '#4A5568',
              fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {f.label}
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
              background: filter === f.key ? 'rgba(255,255,255,0.15)' : '#F0F4F8',
              color: filter === f.key ? '#FFF' : '#94A3B8',
            }}>{f.count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, border: '3px solid #E1E8F0', borderTopColor: '#00B4D8', borderRadius: 16, animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <Clock size={32} color="#E1E8F0" style={{ display: 'block', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: '0 0 4px' }}>No requests yet</p>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              {filter === 'all' ? 'Landing page contact requests will appear here.' : `No requests with "${STATUS_CFG[filter]?.label}" status.`}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 100px 130px', gap: 12, padding: '10px 16px', background: '#F8FAFC', borderBottom: '1px solid #E1E8F0' }}>
              {['Name', 'Email', 'Company', 'Type', 'Date', 'Status'].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>
            {filtered.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 120px 100px 130px',
                  gap: 12, padding: '14px 16px', alignItems: 'center',
                  borderBottom: i < filtered.length - 1 ? '1px solid #F0F4F8' : 'none',
                  background: (r.status ?? 'new') === 'new' ? 'rgba(0,180,216,0.02)' : '#FFF',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 15, background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <User size={14} color="#94A3B8" />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A' }}>{r.name ?? '—'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Mail size={12} color="#94A3B8" />
                  <a href={`mailto:${r.email}`} style={{ fontSize: 12, color: '#00B4D8', textDecoration: 'none' }}>{r.email ?? '—'}</a>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Building2 size={12} color="#94A3B8" />
                  <span style={{ fontSize: 13, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.company_name ?? '—'}</span>
                </div>
                <span style={{ fontSize: 12, color: '#4A5568' }}>{TYPE_LABELS[r.company_type ?? ''] ?? r.company_type ?? '—'}</span>
                <span style={{ fontSize: 12, color: '#94A3B8' }}>
                  {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <StatusDropdown id={r.id} current={r.status ?? 'new'} onChange={s => handleStatusChange(r.id, s)} />
              </div>
            ))}
          </>
        )}
      </div>

      {/* Message expansion — show below table if any messages exist */}
      {filtered.some(r => r.message) && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Notes / Messages</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.filter(r => r.message).map(r => (
              <div key={r.id} style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A' }}>{r.name ?? '—'}</span>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>{r.company_name}</span>
                </div>
                <p style={{ fontSize: 13, color: '#4A5568', margin: 0, lineHeight: 1.6 }}>{r.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

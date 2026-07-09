'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import {
  getStorageLocations, addStorageLocation, toggleLocationActive,
  type StorageLocation,
} from '@/lib/storage-actions'
import { MapPin, Plus, X, ToggleLeft, ToggleRight, Phone, Mail, User } from 'lucide-react'

function Skeleton({ h = 40, r = 8 }: { h?: number; r?: number }) {
  return <div style={{ height: h, borderRadius: r, background: '#F0F4F8', animation: 'pulse 1.5s ease infinite' }} />
}

function AddLocationSlider({ companyId, onClose, onAdded }: {
  companyId: string; onClose: () => void; onAdded: (l: StorageLocation) => void
}) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, background: '#F5F8FA', border: '1px solid #E1E8F0',
    borderRadius: 10, padding: '0 12px', fontSize: 14, color: '#0D1B2A',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const loc = await addStorageLocation(companyId, {
        name: name.trim(), address, city, state,
        contact_name: contactName, contact_email: contactEmail, contact_phone: contactPhone,
      })
      onAdded(loc)
    } catch (e: any) {
      setError(e.message ?? 'Failed to add location')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(13,27,42,0.4)' }} onClick={onClose} />
      <div style={{ width: 420, background: '#FFFFFF', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(13,27,42,0.12)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E1E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Add Location</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} color="#94A3B8" /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Location Name <span style={{ color: '#EF4444' }}>*</span></label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Phoenix Lot A" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>Address</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Storage Rd" style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>City</label>
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Phoenix" style={{ ...inputStyle, height: 40 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>State</label>
              <input value={state} onChange={e => setState(e.target.value.slice(0, 2).toUpperCase())} placeholder="AZ" style={{ ...inputStyle, height: 40, textAlign: 'center', letterSpacing: '0.1em' }} maxLength={2} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #F0F4F8', paddingTop: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Contact (Optional)</p>
            {[
              { icon: <User size={14} />, label: 'Contact Name', val: contactName, set: setContactName, ph: 'John Smith' },
              { icon: <Mail size={14} />, label: 'Email', val: contactEmail, set: setContactEmail, ph: 'john@example.com' },
              { icon: <Phone size={14} />, label: 'Phone', val: contactPhone, set: setContactPhone, ph: '+1 (555) 000-0000' },
            ].map(({ icon, label, val, set, ph }) => (
              <div key={label} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }}>{label}</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }}>{icon}</div>
                  <input value={val} onChange={e => set(e.target.value)} placeholder={ph}
                    style={{ ...inputStyle, paddingLeft: 34 }} />
                </div>
              </div>
            ))}
          </div>

          {error && <p style={{ fontSize: 13, color: '#EF4444', margin: 0 }}>{error}</p>}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #E1E8F0', display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, height: 44, borderRadius: 10, border: '1.5px solid #E1E8F0', background: '#fff', color: '#4A5568', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: saving || !name.trim() ? '#E1E8F0' : '#00B4D8', color: saving || !name.trim() ? '#94A3B8' : '#FFFFFF', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Adding…' : 'Add Location'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StorageLocationsPage() {
  const { effectiveCompany } = useAuth()
  const router = useRouter()
  const isFMC = effectiveCompany?.account_type === 'fmc'
  const companyId = effectiveCompany?.id ?? ''

  const [locations, setLocations] = useState<StorageLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    if (!isFMC) { router.replace('/storage/inventory'); return }
  }, [isFMC])

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      setLocations(await getStorageLocations(companyId))
    } finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const handleToggle = async (loc: StorageLocation) => {
    setTogglingId(loc.id)
    try {
      await toggleLocationActive(loc.id, !loc.active)
      setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, active: !l.active } : l))
    } finally { setTogglingId(null) }
  }

  return (
    <div style={{ padding: 24, paddingBottom: 40, maxWidth: 1000 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0D1B2A', margin: 0 }}>Locations</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: '4px 0 0' }}>
            {loading ? '…' : `${locations.length} location${locations.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ height: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: '#00B4D8', color: '#FFFFFF', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
          <Plus size={14} /> Add Location
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E1E8F0', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F5F8FA' }}>
              {['Name', 'City', 'State', 'Contact', 'Phone / Email', 'Active'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} style={{ padding: '12px 16px' }}><Skeleton h={20} r={4} /></td>
                ))}
              </tr>
            )) : locations.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 48, textAlign: 'center' }}>
                  <MapPin size={36} color="#E1E8F0" style={{ margin: '0 auto 10px', display: 'block' }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', margin: 0 }}>No locations yet</p>
                  <p style={{ fontSize: 13, color: '#CBD5E1', margin: '4px 0 0' }}>Add your first storage location</p>
                </td>
              </tr>
            ) : locations.map(loc => (
              <tr key={loc.id} style={{ borderTop: '1px solid #F0F4F8' }}>
                <td style={{ padding: '14px 16px', fontWeight: 700, color: '#0D1B2A' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#E0F7FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MapPin size={14} color="#00B4D8" />
                    </div>
                    {loc.name}
                  </div>
                </td>
                <td style={{ padding: '14px 16px', color: '#4A5568' }}>{loc.city || '—'}</td>
                <td style={{ padding: '14px 16px', color: '#4A5568' }}>{loc.state || '—'}</td>
                <td style={{ padding: '14px 16px', color: '#4A5568' }}>{loc.contact_name || '—'}</td>
                <td style={{ padding: '14px 16px' }}>
                  {loc.contact_phone && <div style={{ fontSize: 13, color: '#4A5568' }}>{loc.contact_phone}</div>}
                  {loc.contact_email && <div style={{ fontSize: 12, color: '#94A3B8' }}>{loc.contact_email}</div>}
                  {!loc.contact_phone && !loc.contact_email && <span style={{ color: '#CBD5E1' }}>—</span>}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  <button onClick={() => handleToggle(loc)} disabled={togglingId === loc.id}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: togglingId === loc.id ? 0.5 : 1 }}>
                    {loc.active !== false
                      ? <ToggleRight size={26} color="#10B981" />
                      : <ToggleLeft size={26} color="#CBD5E1" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddLocationSlider
          companyId={companyId}
          onClose={() => setShowAdd(false)}
          onAdded={l => { setLocations(prev => [l, ...prev]); setShowAdd(false) }}
        />
      )}
    </div>
  )
}

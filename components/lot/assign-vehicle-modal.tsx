'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Search } from 'lucide-react'
import { getAvailableVehicles, assignVehicleToSpot } from '@/lib/lot-actions'
import type { AvailableVehicle, LotSpot } from '@/lib/lot-actions'

const STATUS_LABEL: Record<string, string> = {
  pending_arrival: 'Pending Arrival',
  on_lot: 'On Lot',
  pending_pickup: 'Pending Pickup',
  picked_up: 'Picked Up',
  completed: 'Completed',
}

interface Props {
  spot: LotSpot
  companyId: string
  userId: string
  onClose: () => void
  onAssigned: () => void
}

export default function AssignVehicleModal({ spot, companyId, userId, onClose, onAssigned }: Props) {
  const [vehicles, setVehicles] = useState<AvailableVehicle[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getAvailableVehicles(companyId).then(v => { setVehicles(v); setLoading(false) })
    inputRef.current?.focus()
  }, [companyId])

  const filtered = search
    ? vehicles.filter(v => {
        const q = search.toLowerCase()
        return v.vin.toLowerCase().includes(q) ||
          (v.year ?? '').toLowerCase().includes(q) ||
          (v.make ?? '').toLowerCase().includes(q) ||
          (v.model ?? '').toLowerCase().includes(q)
      })
    : vehicles

  const handleAssign = async (v: AvailableVehicle) => {
    setSaving(true)
    await assignVehicleToSpot(spot.id, v.id, userId)
    onAssigned()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(13,27,42,0.5)',
    }}>
      <div style={{
        background: '#FFF', borderRadius: 16, width: 440, maxWidth: '90vw',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(13,27,42,0.2)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #E1E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Assign Vehicle to Spot {spot.label}</h3>
            {spot.notes && <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>{spot.notes}</p>}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, background: '#F0F4F8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#4A5568" />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 20px', flexShrink: 0 }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search VIN, make, model..."
              style={{ width: '100%', height: 38, paddingLeft: 32, paddingRight: 12, border: '1px solid #E1E8F0', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {loading ? (
            <p style={{ fontSize: 14, color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>Loading vehicles...</p>
          ) : filtered.length === 0 ? (
            <p style={{ fontSize: 14, color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>
              {search ? 'No vehicles match your search.' : 'No available vehicles.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(v => (
                <button
                  key={v.id}
                  onClick={() => !saving && handleAssign(v)}
                  disabled={saving}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    border: '1px solid #E1E8F0', borderRadius: 10, background: '#FFF',
                    cursor: saving ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    transition: 'background 120ms',
                    opacity: saving ? 0.6 : 1,
                  }}
                  onMouseEnter={e => { if (!saving) e.currentTarget.style.background = '#F8FAFC' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#FFF' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {[v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin}
                    </p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{v.vin}</p>
                  </div>
                  {v.lifecycle_status && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#F0F4F8', color: '#4A5568', flexShrink: 0 }}>
                      {STATUS_LABEL[v.lifecycle_status] ?? v.lifecycle_status}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

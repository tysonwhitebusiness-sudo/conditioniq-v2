'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle } from 'lucide-react'
import { unassignVehicleFromSpot } from '@/lib/lot-actions'
import type { LotSpot } from '@/lib/lot-actions'

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  pending_arrival: { label: 'Pending Arrival', bg: '#F0F4F8', color: '#94A3B8' },
  on_lot:          { label: 'On Lot',          bg: '#E0F7FC', color: '#0097B2' },
  one_off:         { label: 'One-Off',         bg: '#FFF0E8', color: '#C2410C' },
  releasing:       { label: 'Releasing',       bg: '#FEF3C7', color: '#92400E' },
  released:        { label: 'Released',        bg: '#D1FAE5', color: '#065F46' },
}

interface Props {
  spot: LotSpot
  onClose: () => void
  onUnassigned: () => void
}

export default function VehicleDetailSlideOver({ spot, onClose, onUnassigned }: Props) {
  const router = useRouter()
  const [confirmUnassign, setConfirmUnassign] = useState(false)
  const [unassigning, setUnassigning] = useState(false)

  const assignment = spot.active_assignment
  const vehicle = assignment?.vehicle
  if (!assignment || !vehicle) return null

  const status = vehicle.lifecycle_status ?? ''
  const cfg = STATUS_CFG[status]

  const daysOnLot = vehicle.arrived_at
    ? Math.floor((Date.now() - new Date(vehicle.arrived_at).getTime()) / 86400000)
    : null

  const handleUnassign = async () => {
    setUnassigning(true)
    await unassignVehicleFromSpot(assignment.id)
    onUnassigned()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(13,27,42,0.4)' }} onClick={onClose} />
      <div style={{
        width: 380, maxWidth: '90vw', background: '#FFF',
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 32px rgba(13,27,42,0.15)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #E1E8F0', position: 'sticky', top: 0, background: '#FFF' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Spot {spot.label}</p>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: '2px 0 0' }}>
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Unknown Vehicle'}
              </h3>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, background: '#F0F4F8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#4A5568" />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Vehicle info */}
          <div style={{ background: '#F8FAFC', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row label="VIN" value={vehicle.vin} mono />
            {cfg && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: '#94A3B8' }}>Status</span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
              </div>
            )}
            {daysOnLot !== null && <Row label="Days on lot" value={`${daysOnLot} day${daysOnLot === 1 ? '' : 's'}`} />}
            {vehicle.latest_score !== null && vehicle.latest_score !== undefined && (
              <Row label="Last score" value={`${vehicle.latest_score}%`} />
            )}
          </div>

          {/* Spot notes */}
          {spot.notes && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Spot Notes</p>
              <p style={{ fontSize: 13, color: '#4A5568', margin: 0, lineHeight: 1.5 }}>{spot.notes}</p>
            </div>
          )}

          {/* Actions */}
          <button
            onClick={() => router.push(`/inventory/${vehicle.id}`)}
            style={{ height: 42, background: '#00B4D8', color: '#FFF', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            View Full Detail
          </button>

          {!confirmUnassign ? (
            <button
              onClick={() => setConfirmUnassign(true)}
              style={{ height: 42, background: '#FFF', color: '#EF4444', border: '1px solid #FECACA', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Unassign Vehicle
            </button>
          ) : (
            <div style={{ border: '1px solid #FECACA', borderRadius: 10, padding: 14, background: '#FFF5F5' }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 13, color: '#991B1B', margin: 0 }}>
                  Remove this vehicle from spot {spot.label}?
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmUnassign(false)}
                  disabled={unassigning}
                  style={{ flex: 1, height: 36, background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnassign}
                  disabled={unassigning}
                  style={{ flex: 1, height: 36, background: '#EF4444', color: '#FFF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: unassigning ? 'default' : 'pointer', fontFamily: 'inherit', opacity: unassigning ? 0.7 : 1 }}
                >
                  {unassigning ? 'Removing...' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, color: '#94A3B8' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  )
}

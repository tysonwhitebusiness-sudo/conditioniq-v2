'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, AlertTriangle } from 'lucide-react'
import { unassignVehicleFromSpot } from '@/lib/lot-actions'
import type { LotSpot } from '@/lib/lot-actions'
import { useAuth } from '@/contexts/auth-context'
import { EMPTY_COLOR } from './lot-grid'
import { getSpotPinColor, WORK_ORDER_STATUS_LABEL } from '@/lib/work-order-status'
import { PRIMARY, AMBER, WHITE, GRAY_100, GRAY_300, GRAY_500, GRAY_900 } from '@/lib/design-tokens'

interface Props {
  spot: LotSpot
  onClose: () => void
  onUnassigned: () => void
}

export default function VehicleDetailSlideOver({ spot, onClose, onUnassigned }: Props) {
  const router = useRouter()
  const { user } = useAuth()
  const [confirmUnassign, setConfirmUnassign] = useState(false)
  const [unassigning, setUnassigning] = useState(false)

  const assignment = spot.active_assignment
  const vehicle = assignment?.vehicle
  if (!assignment || !vehicle) return null

  const statusColor = getSpotPinColor(vehicle.work_order_status) ?? EMPTY_COLOR
  const statusLabel = WORK_ORDER_STATUS_LABEL[vehicle.work_order_status]

  const daysOnLot = vehicle.arrived_at
    ? Math.floor((Date.now() - new Date(vehicle.arrived_at).getTime()) / 86400000)
    : null

  const handleUnassign = async () => {
    setUnassigning(true)
    await unassignVehicleFromSpot(assignment.id, user?.id)
    onUnassigned()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <style>{`
        @keyframes vds-backdrop-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes vds-panel-in { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
      <div style={{ flex: 1, background: 'rgba(15,23,42,0.4)', animation: 'vds-backdrop-in 200ms ease-out' }} onClick={onClose} />
      <div style={{
        width: 380, maxWidth: '90vw', background: WHITE,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-12px 0 40px rgba(15,23,42,0.15)',
        animation: 'vds-panel-in 260ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: `1px solid ${GRAY_300}`, position: 'sticky', top: 0, background: WHITE }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Spot {spot.label}</p>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: GRAY_900, margin: '2px 0 0' }}>
                {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Unknown Vehicle'}
              </h3>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, background: GRAY_100, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <X size={16} color={GRAY_900} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Vehicle info */}
          <div style={{ background: GRAY_100, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Row label="VIN" value={vehicle.vin} mono />
            {statusLabel && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Status</p>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: `${statusColor}22`, color: statusColor }}>{statusLabel}</span>
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
              <p style={{ fontSize: 11, fontWeight: 600, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Spot Notes</p>
              <p style={{ fontSize: 13, color: GRAY_900, margin: 0, lineHeight: 1.5 }}>{spot.notes}</p>
            </div>
          )}

          {/* Actions */}
          <button
            onClick={() => router.push(`/inventory/${vehicle.id}`)}
            style={{ height: 42, background: PRIMARY, color: WHITE, border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            View Full Detail
          </button>

          {!confirmUnassign ? (
            <button
              onClick={() => setConfirmUnassign(true)}
              style={{ height: 42, background: 'transparent', color: AMBER, border: `1.5px solid ${AMBER}80`, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Unassign Vehicle
            </button>
          ) : (
            <div style={{ border: `1px solid ${AMBER}4D`, borderRadius: 10, padding: 14, background: `${AMBER}14` }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={16} color={AMBER} style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 13, color: GRAY_900, margin: 0 }}>
                  Remove this vehicle from spot {spot.label}?
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmUnassign(false)}
                  disabled={unassigning}
                  style={{ flex: 1, height: 36, background: 'transparent', color: GRAY_900, border: `1px solid ${GRAY_300}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnassign}
                  disabled={unassigning}
                  style={{ flex: 1, height: 36, background: AMBER, color: WHITE, border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: unassigning ? 'default' : 'pointer', fontFamily: 'inherit', opacity: unassigning ? 0.7 : 1 }}
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
    <div>
      <p style={{ fontSize: 10, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: GRAY_900, margin: 0, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</p>
    </div>
  )
}

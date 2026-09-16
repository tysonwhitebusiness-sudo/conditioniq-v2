'use client'

import { useDraggable } from '@dnd-kit/core'
import { AlertTriangle, GripVertical, Wand2 } from 'lucide-react'
import type { AvailableVehicle, LotSpot, LotShape } from '@/lib/lot-actions'
import { suggestSpotForVehicle } from '@/lib/lot-actions'
import { WORK_ORDER_STATUS_LABEL } from '@/lib/work-order-status'
import { PRIMARY, AMBER, AMBER_TINT, WHITE, GRAY_300, GRAY_500, GRAY_700, GRAY_900, GRAY_100 } from '@/lib/design-tokens'

interface Props {
  vehicles: AvailableVehicle[]
  emptySpots: LotSpot[]
  allSpots: LotSpot[]
  shapes: LotShape[]
  onAssign: (vehicleId: string, spotId: string) => void
}

export default function OffLotSideList({ vehicles, emptySpots, allSpots, shapes, onAssign }: Props) {
  if (vehicles.length === 0) return null

  const pendingArrival = vehicles.filter(v => v.work_order_status === 'pending_arrival')
  const needsSpot = vehicles.filter(v => v.work_order_status !== 'pending_arrival')
  const overCapacity = pendingArrival.length > emptySpots.length

  return (
    <div style={{
      background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Off Lot · Awaiting a Spot
        </span>
        <span style={{ fontSize: 11, color: GRAY_500 }}>Drag onto an empty spot</span>
      </div>

      {overCapacity && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
          background: AMBER_TINT, border: `1px solid ${AMBER}4D`, borderRadius: 10,
        }}>
          <AlertTriangle size={14} color={AMBER} style={{ flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: GRAY_900 }}>
            {pendingArrival.length} vehicle{pendingArrival.length === 1 ? '' : 's'} pending arrival but only {emptySpots.length} spot{emptySpots.length === 1 ? '' : 's'} free.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {[...pendingArrival, ...needsSpot].map(v => (
          <VehicleCard
            key={v.id}
            vehicle={v}
            suggested={suggestSpotForVehicle(v, emptySpots, allSpots, shapes)}
            onAssign={onAssign}
          />
        ))}
      </div>
    </div>
  )
}

function VehicleCard({ vehicle, suggested, onAssign }: { vehicle: AvailableVehicle; suggested: LotSpot | null; onAssign: (vehicleId: string, spotId: string) => void }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `vehicle:${vehicle.id}`,
    data: { type: 'vehicle', vehicleId: vehicle.id },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        flexShrink: 0, width: 168, background: WHITE, borderRadius: 12, padding: 10,
        display: 'flex', flexDirection: 'column', gap: 6,
        border: `1px solid ${GRAY_300}`,
        cursor: 'grab', touchAction: 'none',
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <GripVertical size={13} color={GRAY_500} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: GRAY_900, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin}
          </p>
          <p style={{ fontSize: 10, color: GRAY_500, margin: '1px 0 0', fontFamily: 'monospace' }}>{vehicle.vin}</p>
        </div>
      </div>
      <span style={{
        fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, alignSelf: 'flex-start',
        background: GRAY_100, color: GRAY_700,
      }}>
        {WORK_ORDER_STATUS_LABEL[vehicle.work_order_status]}
      </span>
      {suggested && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => onAssign(vehicle.id, suggested.id)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            height: 26, borderRadius: 7, border: 'none', background: PRIMARY, color: WHITE,
            fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 2,
          }}
        >
          <Wand2 size={11} /> Suggest: {suggested.label}
        </button>
      )}
    </div>
  )
}

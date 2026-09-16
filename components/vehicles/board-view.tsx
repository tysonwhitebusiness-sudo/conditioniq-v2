'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  useDroppable, useDraggable, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { updateWorkOrderStatus, getSpotPinColor, type WorkOrderStatus } from '@/lib/work-order-status'
import ChangeStatus from '@/components/status/change-status'
import { PRIMARY, PRIMARY_LIGHT, WHITE, DANGER_TEXT, DANGER_LIGHT, DANGER_BORDER, GRAY_100, GRAY_300, GRAY_500, GRAY_700, GRAY_900 } from '@/lib/design-tokens'

interface BoardVehicle {
  id: string
  vin: string
  year: string | null
  make: string | null
  model: string | null
  work_order_status: WorkOrderStatus
}

// 6 buckets — operationally grouped for a kanban workflow, distinct from
// getSpotPinColor()'s simpler 2-color pin scheme (which folds pending_release
// into "attention"; here it reads better as its own "about to leave" column).
// Dropping a card into a column sets it to that column's representative
// status — for the finer distinctions within a column (e.g. checked_in vs.
// in_storage) use the status picker on the card itself.
const COLUMNS: { key: string; label: string; statuses: WorkOrderStatus[]; dropStatus: WorkOrderStatus }[] = [
  { key: 'pending_arrival', label: 'Pending Arrival', statuses: ['pending_arrival'], dropStatus: 'pending_arrival' },
  { key: 'on_lot', label: 'On Lot', statuses: ['checked_in', 'in_storage', 'on_lot_repairs_complete'], dropStatus: 'checked_in' },
  { key: 'needs_attention', label: 'Needs Attention', statuses: ['on_lot_pending_repairs', 'on_hold'], dropStatus: 'on_lot_pending_repairs' },
  { key: 'ready_for_release', label: 'Ready for Release', statuses: ['pending_release', 'ready_for_release'], dropStatus: 'pending_release' },
  { key: 'off_lot', label: 'Off Lot', statuses: ['off_lot'], dropStatus: 'off_lot' },
  { key: 'released', label: 'Released', statuses: ['released'], dropStatus: 'released' },
]

function vehicleTitle(v: BoardVehicle) {
  return [v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin
}

function Card({ vehicle, userId, onChanged }: { vehicle: BoardVehicle; userId: string; onChanged: () => void }) {
  const router = useRouter()
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: vehicle.id })
  const color = getSpotPinColor(vehicle.work_order_status) ?? GRAY_500

  return (
    <div
      ref={setNodeRef}
      style={{
        background: WHITE, border: `1px solid ${GRAY_300}`, borderLeft: `3px solid ${color}`, borderRadius: 10,
        padding: 10, boxShadow: isDragging ? '0 8px 24px rgba(15,23,42,0.18)' : '0 1px 3px rgba(15,23,42,0.06)',
        opacity: isDragging ? 0.5 : 1, userSelect: 'none',
      }}
    >
      <div {...listeners} {...attributes} onClick={() => router.push(`/inventory/${vehicle.id}`)} style={{ cursor: 'grab' }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: GRAY_900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {vehicleTitle(vehicle)}
        </p>
        <p style={{ margin: '2px 0 8px', fontSize: 11, color: GRAY_500, fontFamily: 'monospace' }}>{vehicle.vin}</p>
      </div>
      <div onPointerDown={e => e.stopPropagation()}>
        <ChangeStatus vehicleId={vehicle.id} currentStatus={vehicle.work_order_status} userId={userId} onChanged={onChanged} variant="compact" />
      </div>
    </div>
  )
}

function Column({ column, vehicles, userId, onChanged }: {
  column: typeof COLUMNS[number]; vehicles: BoardVehicle[]; userId: string; onChanged: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 240, flex: '0 0 240px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: GRAY_700 }}>{column.label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, background: GRAY_100, borderRadius: 10, padding: '1px 7px' }}>{vehicles.length}</span>
      </div>
      <div
        ref={setNodeRef}
        style={{
          flex: 1, minHeight: 200, background: isOver ? PRIMARY_LIGHT : GRAY_100,
          border: `1px solid ${isOver ? PRIMARY : GRAY_300}`, borderRadius: 14, padding: 8,
          display: 'flex', flexDirection: 'column', gap: 8, transition: 'background 150ms, border-color 150ms',
        }}
      >
        {vehicles.map(v => <Card key={v.id} vehicle={v} userId={userId} onChanged={onChanged} />)}
      </div>
    </div>
  )
}

export default function BoardView({ vehicles, userId, onChanged }: {
  vehicles: BoardVehicle[]; userId: string; onChanged: () => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const byColumn = (col: typeof COLUMNS[number]) => vehicles.filter(v => col.statuses.includes(v.work_order_status))
  const activeVehicle = vehicles.find(v => v.id === activeId)

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const vehicle = vehicles.find(v => v.id === active.id)
    const column = COLUMNS.find(c => c.key === over.id)
    if (!vehicle || !column || column.statuses.includes(vehicle.work_order_status)) return
    try {
      await updateWorkOrderStatus(vehicle.id, column.dropStatus, userId)
      onChanged()
    } catch (e: any) {
      if (e?.code === '23505' || String(e?.message ?? '').includes('work_order_vin_account_active_unique')) {
        setError("This vehicle already has a newer active visit — status can't be changed on this closed record.")
      } else {
        setError('Could not update status.')
      }
    }
  }

  return (
    <div>
      {error && (
        <p style={{ fontSize: 13, color: DANGER_TEXT, background: DANGER_LIGHT, border: `1px solid ${DANGER_BORDER}`, borderRadius: 10, padding: '10px 14px', margin: '0 0 12px' }}>
          {error}
        </p>
      )}
      <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 16, alignItems: 'flex-start' }}>
          {COLUMNS.map(col => (
            <Column key={col.key} column={col} vehicles={byColumn(col)} userId={userId} onChanged={onChanged} />
          ))}
        </div>
        <DragOverlay>
          {activeVehicle && (
            <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.18)', width: 220 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: GRAY_900 }}>{vehicleTitle(activeVehicle)}</p>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

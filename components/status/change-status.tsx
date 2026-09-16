'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  WORK_ORDER_STATUSES, WORK_ORDER_STATUS_LABEL, getStatusPillStyle,
  updateWorkOrderStatus, type WorkOrderStatus,
} from '@/lib/work-order-status'
import { PRIMARY, WHITE, DANGER, GRAY_100, GRAY_300, GRAY_500, GRAY_700, GRAY_900 } from '@/lib/design-tokens'

// All 10 statuses are always selectable — updateWorkOrderStatus() has no
// transition rules today (only statuses differ are blocked), so this picker
// doesn't invent any either. The one real failure mode is changing a closed
// (released) work order's status when a newer active work order for the same
// VIN already exists — that collides with the partial unique index
// work_order_vin_account_active_unique, which this catches specifically
// rather than surfacing the raw DB error.
async function changeStatus(vehicleId: string, newStatus: WorkOrderStatus, userId: string): Promise<{ error: string | null }> {
  try {
    await updateWorkOrderStatus(vehicleId, newStatus, userId)
    return { error: null }
  } catch (e: any) {
    if (e?.code === '23505' || String(e?.message ?? '').includes('work_order_vin_account_active_unique')) {
      return { error: "This vehicle already has a newer active visit — status can't be changed on this closed record." }
    }
    return { error: 'Could not update status.' }
  }
}

function StatusPill({ status }: { status: WorkOrderStatus }) {
  const style = getStatusPillStyle(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, padding: '3px 10px', borderRadius: 20,
      ...style,
    }}>
      {WORK_ORDER_STATUS_LABEL[status]}
    </span>
  )
}

interface Props {
  vehicleId: string
  currentStatus: WorkOrderStatus
  userId: string
  onChanged?: () => void
  variant?: 'inline' | 'compact' | 'button'
}

export default function ChangeStatus({ vehicleId, currentStatus, userId, onChanged, variant = 'inline' }: Props) {
  const [pending, setPending] = useState<WorkOrderStatus>(currentStatus)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const submit = async (status: WorkOrderStatus) => {
    if (status === currentStatus) { setOpen(false); return }
    setSaving(true)
    setError(null)
    const { error: err } = await changeStatus(vehicleId, status, userId)
    setSaving(false)
    if (err) { setError(err); return }
    setOpen(false)
    onChanged?.()
  }

  const selectEl = (
    <select
      value={pending}
      onChange={e => setPending(e.target.value as WorkOrderStatus)}
      onClick={e => e.stopPropagation()}
      disabled={saving}
      style={{
        height: 36, borderRadius: 8, border: `1px solid ${GRAY_300}`, padding: '0 10px',
        fontSize: 13, outline: 'none', fontFamily: 'inherit', background: GRAY_100, color: GRAY_900,
      }}
    >
      {WORK_ORDER_STATUSES.map(s => (
        <option key={s} value={s}>{WORK_ORDER_STATUS_LABEL[s]}</option>
      ))}
    </select>
  )

  const updateBtn = (
    <button
      onClick={e => { e.stopPropagation(); submit(pending) }}
      disabled={saving || pending === currentStatus}
      style={{
        height: 36, padding: '0 14px', borderRadius: 8, border: 'none',
        background: saving || pending === currentStatus ? GRAY_500 : PRIMARY,
        color: WHITE, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
        cursor: saving || pending === currentStatus ? 'default' : 'pointer',
      }}
    >
      {saving ? '…' : 'Update'}
    </button>
  )

  if (variant === 'inline') {
    return (
      <div>
        <div style={{ display: 'flex', gap: 8 }}>
          {selectEl}
          {updateBtn}
        </div>
        {error && <p style={{ fontSize: 12, color: DANGER, margin: '6px 0 0', maxWidth: 260 }}>{error}</p>}
      </div>
    )
  }

  // button: a ghost "Change Status ▾" trigger — for the Vehicle Detail hero's
  // actions row, where the current status is already shown separately as a
  // read-only pill in the hero meta line (mockup: .status-wrap + .btn-ghost).
  if (variant === 'button') {
    return (
      <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => { setPending(currentStatus); setOpen(o => !o) }}
          style={{
            height: 36, padding: '8px 14px', borderRadius: 7, border: `1px solid ${GRAY_300}`,
            background: WHITE, color: GRAY_700, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          }}
        >
          Change Status ▾
        </button>
        {open && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
            <div style={{
              position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 31,
              background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12,
              padding: 12, boxShadow: '0 8px 24px rgba(15,23,42,0.15)', minWidth: 220,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectEl}
                {updateBtn}
              </div>
              {error && <p style={{ fontSize: 12, color: DANGER, margin: '8px 0 0', maxWidth: 220 }}>{error}</p>}
            </div>
          </>
        )}
      </div>
    )
  }

  // compact: a status pill that opens a small popover with the same picker
  return (
    <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        onClick={() => { setPending(currentStatus); setOpen(o => !o) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <StatusPill status={currentStatus} />
        <ChevronDown size={12} color={GRAY_500} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 31,
            background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12,
            padding: 12, boxShadow: '0 8px 24px rgba(15,23,42,0.15)', minWidth: 220,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectEl}
              {updateBtn}
            </div>
            {error && <p style={{ fontSize: 12, color: DANGER, margin: '8px 0 0', maxWidth: 220 }}>{error}</p>}
          </div>
        </>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ScanVehicle } from '@/lib/qr-actions'
import { updateWorkOrderStatus, WORK_ORDER_STATUSES, WORK_ORDER_STATUS_LABEL, type WorkOrderStatus } from '@/lib/work-order-status'
import { logService } from '@/lib/service-log-actions'
import { getFeeTypes, type FeeType } from '@/lib/lot-fee-actions'

const MIDNIGHT = '#0D1B2A'
const DEEP_NAVY = '#1B2D40'
const CYAN = '#00B4D8'
const AMBER = '#F4A62A'

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, border: '1px solid #E1E8F0', borderRadius: 10,
  padding: '0 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  background: '#FAFAFA', boxSizing: 'border-box',
}

export default function ScanLandingView({ vehicle, userId }: { vehicle: ScanVehicle; userId: string }) {
  const [status, setStatus] = useState<WorkOrderStatus>(vehicle.work_order_status)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const [feeTypes, setFeeTypes] = useState<FeeType[]>([])
  const [feeTypeId, setFeeTypeId] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [serviceSaving, setServiceSaving] = useState(false)
  const [serviceMsg, setServiceMsg] = useState<string | null>(null)

  useEffect(() => {
    getFeeTypes(vehicle.company_id).then(types => {
      setFeeTypes(types)
      if (types.length > 0) setFeeTypeId(types[0].id)
    }).catch(() => {})
  }, [vehicle.company_id])

  const handleStatusUpdate = async () => {
    if (status === vehicle.work_order_status) return
    setStatusSaving(true)
    setStatusMsg(null)
    try {
      await updateWorkOrderStatus(vehicle.id, status, userId)
      setStatusMsg('Status updated.')
    } catch {
      setStatusMsg('Could not update status.')
    } finally {
      setStatusSaving(false)
    }
  }

  const handleLogService = async (e: React.FormEvent) => {
    e.preventDefault()
    const fee = feeTypes.find(f => f.id === feeTypeId)
    if (!fee) return
    const amt = parseFloat(amount)
    if (!Number.isFinite(amt) || amt < 0) { setServiceMsg('Enter a valid amount.'); return }
    setServiceSaving(true)
    setServiceMsg(null)
    try {
      await logService({
        companyId: vehicle.company_id,
        vehicleId: vehicle.id,
        feeTypeId: fee.id,
        label: fee.name,
        amount: amt,
        performedAt: new Date().toISOString().slice(0, 10),
        notes: notes || undefined,
        createdBy: userId,
      })
      setServiceMsg('Service logged.')
      setAmount('')
      setNotes('')
    } catch {
      setServiceMsg('Could not log service.')
    } finally {
      setServiceSaving(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div style={{ background: MIDNIGHT, padding: '24px 20px 28px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(240,244,248,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
          {WORK_ORDER_STATUS_LABEL[vehicle.work_order_status]}
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', margin: '0 0 4px' }}>
          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(240,244,248,0.6)', margin: 0, fontFamily: 'monospace' }}>{vehicle.vin}</p>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480, margin: '0 auto' }}>

        {/* Change status */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Change Status</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={status} onChange={e => setStatus(e.target.value as WorkOrderStatus)} style={{ ...inputStyle, flex: 1 }}>
              {WORK_ORDER_STATUSES.map(s => (
                <option key={s} value={s}>{WORK_ORDER_STATUS_LABEL[s]}</option>
              ))}
            </select>
            <button
              onClick={handleStatusUpdate}
              disabled={statusSaving || status === vehicle.work_order_status}
              style={{
                height: 44, padding: '0 16px', borderRadius: 10, border: 'none',
                background: statusSaving || status === vehicle.work_order_status ? '#94A3B8' : CYAN,
                color: '#FFFFFF', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                cursor: statusSaving ? 'default' : 'pointer', flexShrink: 0,
              }}
            >
              {statusSaving ? 'Saving…' : 'Update'}
            </button>
          </div>
          {statusMsg && <p style={{ fontSize: 12, color: '#64748B', margin: '8px 0 0' }}>{statusMsg}</p>}
        </div>

        {/* Log service */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 18 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Log Service</p>
          {feeTypes.length === 0 ? (
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No service types configured for this company yet.</p>
          ) : (
            <form onSubmit={handleLogService} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={feeTypeId} onChange={e => setFeeTypeId(e.target.value)} style={inputStyle}>
                {feeTypes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <input
                type="number" step="0.01" min="0" placeholder="Amount"
                value={amount} onChange={e => setAmount(e.target.value)}
                style={inputStyle}
              />
              <textarea
                placeholder="Notes (optional)" rows={2}
                value={notes} onChange={e => setNotes(e.target.value)}
                style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'vertical' as const }}
              />
              <button
                type="submit" disabled={serviceSaving || !amount}
                style={{
                  height: 44, borderRadius: 10, border: 'none',
                  background: serviceSaving || !amount ? '#94A3B8' : AMBER,
                  color: MIDNIGHT, fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                  cursor: serviceSaving ? 'default' : 'pointer',
                }}
              >
                {serviceSaving ? 'Logging…' : 'Log Service'}
              </button>
              {serviceMsg && <p style={{ fontSize: 12, color: '#64748B', margin: 0 }}>{serviceMsg}</p>}
            </form>
          )}
        </div>

        <Link href={`/inventory/${vehicle.id}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 46, borderRadius: 12, border: `1.5px solid ${CYAN}`, background: '#FFFFFF',
          color: CYAN, textDecoration: 'none', fontSize: 14, fontWeight: 700,
        }}>
          View Full Record
        </Link>
      </div>
    </div>
  )
}

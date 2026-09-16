'use client'

import { ArrowLeft, Play, LogOut as OuttakeIcon, QrCode, MapPin, Wrench, Send } from 'lucide-react'
import ChangeStatus from '@/components/status/change-status'
import { WORK_ORDER_STATUS_LABEL, getStatusPillStyle, type WorkOrderStatus } from '@/lib/work-order-status'
import { PRIMARY, WHITE, SUCCESS, WARN, DANGER, GRAY_100, GRAY_300, GRAY_500, GRAY_700, GRAY_900 } from '@/lib/design-tokens'

function daysColor(d: number) { return d < 30 ? SUCCESS : d < 60 ? WARN : DANGER }

interface Props {
  vehicleId: string
  userId: string
  vin: string
  vehicleTitle: string
  workOrderStatus: WorkOrderStatus
  spotLabel: string | null
  days: number | null
  isDesktop: boolean
  canDispatch: boolean
  onBack: () => void
  onStartIntake: () => void
  onRunOuttake: () => void
  onPrintQR: () => void
  onAssignSpot: () => void
  onLogService: () => void
  onDispatch: () => void
  onStatusChanged: () => void
}

export default function VehicleHero({
  vehicleId, userId, vin, vehicleTitle, workOrderStatus, spotLabel, days, isDesktop,
  canDispatch, onBack, onStartIntake, onRunOuttake, onPrintQR,
  onAssignSpot, onLogService, onDispatch, onStatusChanged,
}: Props) {
  const pillStyle = getStatusPillStyle(workOrderStatus)

  const ghostBtnStyle = {
    height: 36, padding: '8px 14px', borderRadius: 7, border: `1px solid ${GRAY_300}`,
    fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 8,
    background: WHITE, color: GRAY_700,
  } as const

  return (
    <div style={{ border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: isDesktop ? '18px 20px' : '16px', marginBottom: 16 }}>
      {/* Top: back + title/vin + meta */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <button onClick={onBack}
            style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${GRAY_300}`, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
            <ArrowLeft size={16} color={GRAY_900} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: isDesktop ? 20 : 18, fontWeight: 800, color: GRAY_900, margin: '0 0 3px', lineHeight: 1.2 }}>{vehicleTitle}</h1>
            <p style={{ fontSize: 11, color: GRAY_500, margin: 0, fontFamily: 'monospace', letterSpacing: '0.04em' }}>{vin || '—'}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: 9, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>Status</p>
            <span style={{ display: 'inline-block', fontSize: 10, padding: '4px 10px', borderRadius: 20, ...pillStyle }}>
              {WORK_ORDER_STATUS_LABEL[workOrderStatus]}
            </span>
          </div>
          <div>
            <p style={{ fontSize: 9, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>Spot</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: GRAY_900, margin: '2px 0 0' }}>{spotLabel ?? 'Unassigned'}</p>
          </div>
          <div>
            <p style={{ fontSize: 9, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 2px' }}>Days on Lot</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: GRAY_900, margin: '2px 0 0' }}>{days !== null ? `${days}d` : '—'}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${GRAY_100}`, paddingTop: 14 }}>
        <button onClick={onStartIntake} style={{ ...ghostBtnStyle, background: PRIMARY, color: WHITE, border: 'none' }}>
          <Play size={14} />Start Intake
        </button>
        <button onClick={onRunOuttake} style={ghostBtnStyle}>
          <OuttakeIcon size={14} />Run Outtake
        </button>
        <ChangeStatus vehicleId={vehicleId} currentStatus={workOrderStatus} userId={userId} onChanged={onStatusChanged} variant="button" />
        <button onClick={onAssignSpot} style={ghostBtnStyle}>
          <MapPin size={14} />Assign Spot
        </button>
        <button onClick={onLogService} style={ghostBtnStyle}>
          <Wrench size={14} />Log Service
        </button>
        <button onClick={onPrintQR} style={ghostBtnStyle}>
          <QrCode size={14} />Print QR
        </button>
        {canDispatch && (
          <button onClick={onDispatch} style={ghostBtnStyle}>
            <Send size={14} />Send to Inspector
          </button>
        )}
      </div>
    </div>
  )
}

'use client'

import { X, ScanLine, ClipboardList } from 'lucide-react'
import { PRIMARY, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'

// Phase 13: the fork between a real live arrival (full Intake — VIN scan,
// 7-shot photos, damage tagger) and a one-time backfill for inventory that's
// physically on the lot but was never logged in CIQ. Replaces the old
// behavior where "Add Vehicle" could silently mark something checked_in via a
// simple status toggle with no checkpoint, no photos, ever run.

interface Props {
  onClose: () => void
  onNewArrival: () => void
  onAddExisting: () => void
}

export default function AddVehicleChoice({ onClose, onNewArrival, onAddExisting }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,27,42,0.5)', padding: 20 }}>
      <div style={{ background: WHITE, borderRadius: 16, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 16px 48px rgba(13,27,42,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: GRAY_900, margin: 0 }}>Add Vehicle</h3>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 14, background: GRAY_100, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color={GRAY_700} />
          </button>
        </div>
        <p style={{ fontSize: 13, color: GRAY_500, margin: '0 0 18px', lineHeight: 1.5 }}>
          Is this a vehicle arriving now, or one already on the lot that was never logged?
        </p>

        <button
          onClick={onNewArrival}
          style={{
            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
            height: 68, borderRadius: 12, border: `1.5px solid ${PRIMARY}`, background: WHITE,
            padding: '0 16px', cursor: 'pointer', marginBottom: 10, fontFamily: 'inherit',
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ScanLine size={20} color={WHITE} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: GRAY_900, margin: 0 }}>New Arrival</p>
            <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>Scan the VIN and run a full Intake</p>
          </div>
        </button>

        <button
          onClick={onAddExisting}
          style={{
            width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
            height: 68, borderRadius: 12, border: `1.5px solid ${GRAY_300}`, background: WHITE,
            padding: '0 16px', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: GRAY_100, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ClipboardList size={20} color={GRAY_700} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: GRAY_900, margin: 0 }}>Add Existing Vehicle</p>
            <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>One-time backfill for a vehicle already on the lot — not for a returning vehicle</p>
          </div>
        </button>
      </div>
    </div>
  )
}

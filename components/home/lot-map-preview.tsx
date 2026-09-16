'use client'

import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import type { LotSpot } from '@/lib/lot-actions'
import { getSpotPinColor } from '@/lib/work-order-status'
import { WHITE, GRAY_300, GRAY_500 } from '@/lib/design-tokens'

const EMPTY_COLOR = GRAY_300

// Real spot data, scaled down and non-interactive — not a nav tile. Pins use
// the same getSpotPinColor() classification as the full Lot Map and the
// Vehicles list's row accents, so the color language matches everywhere.
export default function LotMapPreview({ spots }: { spots: LotSpot[] }) {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push('/lot')}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: 0, overflow: 'hidden', fontFamily: 'inherit',
      }}
    >
      <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: GRAY_500 }}>Lot Map</span>
        <ChevronRight size={14} color={GRAY_500} />
      </div>
      <div style={{ position: 'relative', width: '100%', paddingBottom: '40%', margin: '10px 0 0' }}>
        {spots.length === 0 ? (
          <p style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: GRAY_500, margin: 0 }}>
            No spots configured yet
          </p>
        ) : (
          spots.map(spot => {
            const status = spot.active_assignment?.vehicle?.work_order_status
            const color = status ? (getSpotPinColor(status) ?? EMPTY_COLOR) : EMPTY_COLOR
            return (
              <div key={spot.id} style={{
                position: 'absolute', left: `${spot.x_position}%`, top: `${spot.y_position}%`,
                width: 6, height: 6, borderRadius: 3, background: color, transform: 'translate(-50%, -50%)',
              }} />
            )
          })
        )}
      </div>
      <div style={{ height: 14 }} />
    </button>
  )
}

'use client'

import { PRIMARY, WHITE, GRAY_300, GRAY_500, GRAY_900, GRAY_100 } from '@/lib/design-tokens'

interface Props {
  occupied: number
  total: number
  label?: string
}

// Visual bar version of the Lot Map's own occupied/total numbers
// (storage-lot-view.tsx's "{occupied}/{total} · Occupied · {free} free"
// StatTile) — same data source and color language, but the Lot Map itself
// has no bar-shaped element today, so this is genuinely new, not a copy.
export default function CapacityBar({ occupied, total, label }: Props) {
  const free = Math.max(0, total - occupied)
  const pct = total > 0 ? Math.min(100, (occupied / total) * 100) : 0

  return (
    <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: GRAY_900 }}>{label ?? 'Lot Capacity'}</span>
        <span style={{ fontSize: 12, color: GRAY_500 }}>
          <span style={{ color: PRIMARY, fontWeight: 700 }}>{occupied}</span>/{total} occupied · {free} free
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: GRAY_100, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: PRIMARY, borderRadius: 4, transition: 'width 300ms ease' }} />
      </div>
    </div>
  )
}

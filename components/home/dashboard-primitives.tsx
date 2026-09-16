'use client'

import { Lock } from 'lucide-react'
import type { ElementType } from 'react'
import { PRIMARY, AMBER, WHITE, GRAY_900, GRAY_500, GRAY_300 } from '@/lib/design-tokens'

export const CYAN = PRIMARY
export { AMBER }

export interface StatChipData {
  label: string
  value: string
  amber?: boolean
}

export function StatChip({ label, value, amber, wide }: StatChipData & { wide?: boolean }) {
  return (
    <div style={{
      flex: wide ? 1 : undefined,
      minWidth: wide ? 140 : 128,
      background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: wide ? 22 : 19, fontWeight: 800, color: amber ? AMBER : CYAN, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: GRAY_500, whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

export interface FeatureCardData {
  icon: ElementType
  label: string
  statLine: string
  locked?: boolean
  onClick: () => void
}

export function FeatureCard({ icon: Icon, label, statLine, locked, onClick }: FeatureCardData) {
  return (
    <button
      onClick={onClick}
      style={{
        background: WHITE, border: `1px solid ${GRAY_300}`, opacity: locked ? 0.55 : 1,
        borderRadius: 12, padding: 16, cursor: 'pointer', textAlign: 'left',
        display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'inherit', width: '100%',
      }}
    >
      <Icon size={22} color={locked ? GRAY_500 : CYAN} />
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: GRAY_900, margin: '0 0 4px' }}>{label}</p>
        {locked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Lock size={11} color={AMBER} />
            <span style={{ fontSize: 11, fontWeight: 600, color: AMBER }}>Not enabled</span>
          </div>
        ) : (
          <p style={{ fontSize: 11, color: GRAY_500, margin: 0 }}>{statLine}</p>
        )}
      </div>
    </button>
  )
}

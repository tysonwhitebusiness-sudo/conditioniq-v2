'use client'

import { Lock } from 'lucide-react'
import type { ElementType } from 'react'

export const MIDNIGHT = '#0D1B2A'
export const DEEP_NAVY = '#1B2D40'
export const CYAN = '#00B4D8'
export const AMBER = '#F4A62A'

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
      background: DEEP_NAVY, borderRadius: 16,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: wide ? 22 : 19, fontWeight: 800, color: amber ? AMBER : CYAN, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 11, color: 'rgba(240,244,248,0.55)', whiteSpace: 'nowrap' }}>{label}</span>
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
        background: locked ? 'rgba(27,45,64,0.55)' : DEEP_NAVY,
        borderRadius: 18, padding: 16, border: 'none', cursor: 'pointer', textAlign: 'left',
        display: 'flex', flexDirection: 'column', gap: 10, fontFamily: 'inherit', width: '100%',
      }}
    >
      <Icon size={22} color={locked ? 'rgba(255,255,255,0.4)' : CYAN} />
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: locked ? 'rgba(255,255,255,0.65)' : '#FFF', margin: '0 0 4px' }}>{label}</p>
        {locked ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Lock size={11} color={AMBER} />
            <span style={{ fontSize: 11, fontWeight: 600, color: AMBER }}>Not enabled</span>
          </div>
        ) : (
          <p style={{ fontSize: 11, color: 'rgba(240,244,248,0.55)', margin: 0 }}>{statLine}</p>
        )}
      </div>
    </button>
  )
}

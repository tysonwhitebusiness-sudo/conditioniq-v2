'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { VehicleTemplate } from '@/lib/damage-actions'
import type { DamageStore } from '@/lib/damage-store'
import { PRIMARY, WHITE, GRAY_100, GRAY_700, GRAY_500 } from '@/lib/design-tokens'
import Damage2DTagger from './damage-2d-tagger'
// Loaded on demand: three.js and its helpers are the largest thing in the app,
// and most inspections never leave the 2D diagram.
const Damage3DTagger = dynamic(() => import('./damage-3d-tagger'), {
  ssr: false,
  loading: () => (
    <div style={{ aspectRatio: '4 / 3', background: GRAY_100, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: GRAY_500, fontSize: 13 }}>
      Loading 3D model…
    </div>
  ),
})

// Phase 12 (2D/3D Toggle): the user-facing choice between Phase 10's and Phase
// 11's already-complete taggers. Purely a selection/wrapper layer — no new
// tagging capability, no cross-conversion of 2D/3D marker data (they're
// separate sets tied to separate model_asset_2d_id/model_asset_3d_id, and a
// flat-image tap has no inherent depth to map onto a 3D surface anyway).
// Only the selected mode is ever mounted, so switching never loads a 3D GLB
// while 2D is active or vice versa.

export type DamageTaggerMode = '2d' | '3d'

const STORAGE_KEY = 'damage-tagger-mode'

function readStoredMode(): DamageTaggerMode | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw === '2d' || raw === '3d' ? raw : null
}

export interface DamageTaggerToggleProps {
  // Where pins are read and saved (lib/damage-store): the vehicle for intake and
  // outtake, one inspection for the full inspection.
  store: DamageStore
  vehicleTemplate: VehicleTemplate
  modelAsset2dId?: string | null
  modelAsset3dId?: string | null
  editable?: boolean
}

export default function DamageTaggerToggle({
  store, vehicleTemplate, modelAsset2dId, modelAsset3dId, editable = true,
}: DamageTaggerToggleProps) {
  const has2d = !!modelAsset2dId
  const has3d = !!modelAsset3dId
  const isAvailable = (m: DamageTaggerMode) => (m === '2d' ? has2d : has3d)

  const [mode, setMode] = useState<DamageTaggerMode>(() => {
    // 2D is the first-use default (lighter, proven) — but a stored or default
    // preference pointing at an option this specific vehicle doesn't have
    // must never win; fall back to whichever option actually exists here.
    const preferred = readStoredMode() ?? '2d'
    if (isAvailable(preferred)) return preferred
    const other: DamageTaggerMode = preferred === '2d' ? '3d' : '2d'
    return isAvailable(other) ? other : preferred
  })

  const selectMode = (m: DamageTaggerMode) => {
    if (!isAvailable(m)) return
    setMode(m)
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, m)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', background: GRAY_100, borderRadius: 10, padding: 3 }}>
        {(['2d', '3d'] as const).map(m => (
          <button
            key={m}
            onClick={() => selectMode(m)}
            disabled={!isAvailable(m)}
            title={isAvailable(m) ? undefined : `${m.toUpperCase()} isn't available for this vehicle`}
            style={{
              flex: 1, height: 38, borderRadius: 8, border: 'none',
              background: mode === m ? PRIMARY : 'transparent',
              color: mode === m ? WHITE : GRAY_700,
              opacity: isAvailable(m) ? 1 : 0.4,
              cursor: isAvailable(m) ? 'pointer' : 'default',
              fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
            }}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {mode === '2d' ? (
        has2d ? (
          <Damage2DTagger
            store={store}
            editable={editable}
            vehicleTemplate={vehicleTemplate}
            modelAsset2dId={modelAsset2dId!}
          />
        ) : (
          <Unavailable />
        )
      ) : has3d ? (
        <Damage3DTagger
          store={store}
          editable={editable}
          vehicleTemplate={vehicleTemplate}
          modelAsset3dId={modelAsset3dId!}
        />
      ) : (
        <Unavailable />
      )}
    </div>
  )
}

function Unavailable() {
  return (
    <p style={{ fontSize: 13, color: GRAY_500, margin: 0, textAlign: 'center', padding: '24px 0' }}>
      No diagram is available for this vehicle yet.
    </p>
  )
}

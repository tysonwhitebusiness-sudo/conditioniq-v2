'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { getDamageComparisonForVehicle, type DamageComparisonResult } from '@/lib/checkpoint-actions'
import { composeDamageLabel } from '@/lib/damage-actions'
import type { DamageMarker } from '@/lib/damage-actions'

export interface DamageComparisonViewProps {
  vehicleId: string
}

function MarkerRow({ marker, flagged }: { marker: DamageMarker; flagged?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
      background: flagged ? '#FEF3C7' : '#FAFAFA',
      border: `1px solid ${flagged ? '#F59E0B' : '#E1E8F0'}`, borderRadius: 8,
    }}>
      {flagged && <AlertTriangle size={14} color="#92400E" style={{ flexShrink: 0 }} />}
      <span style={{ fontSize: 13, color: flagged ? '#92400E' : '#374151' }}>
        {composeDamageLabel(marker.area, marker.type, marker.severity)}
      </span>
    </div>
  )
}

// Standalone, reusable — deliberately not wired into the current vehicle detail
// page's layout (Phase 8 will redesign that page; rewiring twice would be wasted
// work). Reachable via its own route.
export default function DamageComparisonView({ vehicleId }: DamageComparisonViewProps) {
  const [result, setResult] = useState<DamageComparisonResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    getDamageComparisonForVehicle(vehicleId).then(r => { if (!cancelled) { setResult(r); setLoading(false) } })
    return () => { cancelled = true }
  }, [vehicleId])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} color="#94A3B8" className="animate-spin" /></div>
  }

  if (!result) return null

  const { intakeMarkers, outtakeMarkers, newAtOuttake } = result

  if (intakeMarkers.length === 0 && outtakeMarkers.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>No intake or outtake damage markers recorded yet for this vehicle.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {newAtOuttake.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #F59E0B', borderRadius: 12, padding: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#92400E', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} /> {newAtOuttake.length} new since intake
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {newAtOuttake.map(m => <MarkerRow key={m.id} marker={m} flagged />)}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
            Intake ({intakeMarkers.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {intakeMarkers.length === 0
              ? <p style={{ fontSize: 12, color: '#CBD5E1', margin: 0 }}>None recorded</p>
              : intakeMarkers.map(m => <MarkerRow key={m.id} marker={m} />)}
          </div>
        </div>
        <div>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
            Outtake ({outtakeMarkers.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {outtakeMarkers.length === 0
              ? <p style={{ fontSize: 12, color: '#CBD5E1', margin: 0 }}>None recorded</p>
              : outtakeMarkers.map(m => <MarkerRow key={m.id} marker={m} flagged={newAtOuttake.some(n => n.id === m.id)} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

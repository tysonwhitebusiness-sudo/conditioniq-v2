'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Settings } from 'lucide-react'
import LotGrid from './lot-grid'
import LotSetupOverlay from './lot-setup-overlay'
import AssignVehicleModal from './assign-vehicle-modal'
import VehicleDetailSlideOver from './vehicle-detail-slide-over'
import { getLotSpots, getLotBackground } from '@/lib/lot-actions'
import type { LotSpot } from '@/lib/lot-actions'

interface Props {
  companyId: string
  locationId?: string | null
}

export default function StorageLotView({ companyId, locationId }: Props) {
  const { user, isOwnerUser, companyRole } = useAuth()
  const canSetup = isOwnerUser || companyRole === 'admin'

  const bgPanKey = `lot_bg_pan_${companyId}_${locationId ?? 'main'}`

  const [spots, setSpots] = useState<LotSpot[]>([])
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [bgPan, setBgPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [loading, setLoading] = useState(true)
  const [setupOpen, setSetupOpen] = useState(false)
  const [assignSpot, setAssignSpot] = useState<LotSpot | null>(null)
  const [detailSpot, setDetailSpot] = useState<LotSpot | null>(null)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(bgPanKey) : null
    if (saved) { try { setBgPan(JSON.parse(saved)) } catch { /* ignore */ } }
  }, [bgPanKey])

  const handleBgPanChange = (pan: { x: number; y: number }) => {
    setBgPan(pan)
    localStorage.setItem(bgPanKey, JSON.stringify(pan))
  }

  const load = async () => {
    const [s, bg] = await Promise.all([
      getLotSpots(companyId, locationId),
      getLotBackground(companyId, locationId),
    ])
    setSpots(s)
    setBgUrl(bg)
    setLoading(false)
  }

  useEffect(() => { load() }, [companyId, locationId])

  const handleSpotClick = (spot: LotSpot) => {
    if (spot.active_assignment) setDetailSpot(spot)
    else setAssignSpot(spot)
  }

  const occupied = spots.filter(s => s.active_assignment).length
  const total = spots.length
  const available = total - occupied

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ height: 60, background: '#E2E8F0', borderRadius: 12, marginBottom: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ paddingBottom: '56.25%', background: '#E2E8F0', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D1B2A', margin: 0, flex: 1 }}>
          Lot Map
        </h1>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <StatChip label="Total Spots" value={total} />
          <StatChip label="Occupied" value={occupied} color="#00B4D8" />
          <StatChip label="Available" value={available} color="#10B981" />
        </div>

        {canSetup && (
          <button
            onClick={() => setSetupOpen(true)}
            style={{
              height: 38, padding: '0 16px', borderRadius: 10,
              border: '1px solid #E1E8F0', background: '#FFF',
              color: '#0D1B2A', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Settings size={14} /> Edit Layout
          </button>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {LEGEND.map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
            <span style={{ fontSize: 12, color: '#4A5568' }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Lot grid */}
      <LotGrid
        spots={spots}
        mode="view"
        bgUrl={bgUrl}
        bgPan={bgPan}
        onSpotClick={handleSpotClick}
      />

      {/* Setup overlay */}
      {setupOpen && (
        <LotSetupOverlay
          spots={spots}
          companyId={companyId}
          locationId={locationId}
          bgUrl={bgUrl}
          bgPan={bgPan}
          onSpotsChange={setSpots}
          onBgChange={setBgUrl}
          onBgPanChange={handleBgPanChange}
          onDone={() => setSetupOpen(false)}
        />
      )}

      {/* Assign modal */}
      {assignSpot && (
        <AssignVehicleModal
          spot={assignSpot}
          companyId={companyId}
          userId={user?.id ?? ''}
          onClose={() => setAssignSpot(null)}
          onAssigned={() => { setAssignSpot(null); load() }}
        />
      )}

      {/* Vehicle slide-over */}
      {detailSpot && (
        <VehicleDetailSlideOver
          spot={detailSpot}
          onClose={() => setDetailSpot(null)}
          onUnassigned={() => { setDetailSpot(null); load() }}
        />
      )}
    </div>
  )
}

const LEGEND = [
  { label: 'Empty',           color: '#E1E8F0' },
  { label: 'Pending Arrival', color: '#94A3B8' },
  { label: 'On Lot',          color: '#00B4D8' },
  { label: 'In Progress',     color: '#8B5CF6' },
  { label: 'One-Off',         color: '#F97316' },
  { label: 'Releasing',       color: '#F4A62A' },
  { label: 'Released',        color: '#10B981' },
]

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
      <p style={{ fontSize: 18, fontWeight: 800, color: color ?? '#0D1B2A', margin: 0 }}>{value}</p>
      <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{label}</p>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Settings } from 'lucide-react'
import LotGrid from './lot-grid'
import LotSetupOverlay from './lot-setup-overlay'
import AssignVehicleModal from './assign-vehicle-modal'
import VehicleDetailSlideOver from './vehicle-detail-slide-over'
import { getLotSpots, getLotBackground, getLotShapes, calculateVehicleBilling } from '@/lib/lot-actions'
import type { LotSpot, LotShape } from '@/lib/lot-actions'
import { createClient } from '@/lib/supabase/client'
import { useMediaQuery } from '@/hooks/use-media-query'

interface Props {
  companyId: string
  locationId?: string | null
}

export default function StorageLotView({ companyId, locationId }: Props) {
  const { user, isOwnerUser, companyRole } = useAuth()
  const canSetup = isOwnerUser || companyRole === 'admin'
  const isMobile = useMediaQuery('(max-width: 767px)')

  const bgPanKey = `lot_bg_pan_${companyId}_${locationId ?? 'main'}`
  const bgRotKey = `lot_bg_rot_${companyId}_${locationId ?? 'main'}`

  const [spots, setSpots]   = useState<LotSpot[]>([])
  const [shapes, setShapes] = useState<LotShape[]>([])
  const [bgUrl, setBgUrl]   = useState<string | null>(null)
  const [companyDefaults, setCompanyDefaults] = useState<{ default_daily_rate: number | null; default_monthly_rate: number | null; default_billing_type: string | null } | null>(null)
  const [bgPan, setBgPan]   = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [bgRotation, setBgRotation] = useState(0)
  const [loading, setLoading] = useState(true)
  const [setupOpen, setSetupOpen] = useState(false)
  const [assignSpot, setAssignSpot] = useState<LotSpot | null>(null)
  const [detailSpot, setDetailSpot] = useState<LotSpot | null>(null)

  useEffect(() => {
    const savedPan = typeof window !== 'undefined' ? localStorage.getItem(bgPanKey) : null
    if (savedPan) { try { setBgPan(JSON.parse(savedPan)) } catch { /* ignore */ } }
    const savedRot = typeof window !== 'undefined' ? localStorage.getItem(bgRotKey) : null
    if (savedRot) { try { setBgRotation(JSON.parse(savedRot)) } catch { /* ignore */ } }
  }, [bgPanKey, bgRotKey])

  const handleBgPanChange = (pan: { x: number; y: number }) => {
    setBgPan(pan)
    localStorage.setItem(bgPanKey, JSON.stringify(pan))
  }

  const handleBgRotationChange = (rot: number) => {
    setBgRotation(rot)
    localStorage.setItem(bgRotKey, JSON.stringify(rot))
  }

  const load = async () => {
    const [s, sh, bg, companyRes] = await Promise.all([
      getLotSpots(companyId, locationId),
      getLotShapes(companyId, locationId),
      getLotBackground(companyId, locationId),
      createClient().from('companies').select('default_daily_rate, default_monthly_rate, default_billing_type').eq('id', companyId).single(),
    ])
    setSpots(s); setShapes(sh); setBgUrl(bg)
    setCompanyDefaults(companyRes.data ?? null)
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

  // Billing calculations
  const defaults = (companyDefaults ?? {}) as NonNullable<typeof companyDefaults>
  const defaultDailyRate = defaults.default_daily_rate ?? null

  // Sum daily accrual across occupied vehicles
  const dailyAccruing = spots.reduce((sum, spot) => {
    if (!spot.active_assignment?.vehicle) return sum
    const v = spot.active_assignment.vehicle
    const result = calculateVehicleBilling(v, defaults)
    if (result.rate === null) return sum
    return sum + (result.billingType === 'daily' ? result.rate : result.rate / 30)
  }, 0)

  // Opportunity cost: empty spots × default daily rate
  const dailyOpportunityCost = defaultDailyRate != null ? available * defaultDailyRate : null
  const hasBillingData = dailyAccruing > 0 || dailyOpportunityCost != null

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
    <div style={{ padding: isMobile ? '12px 16px' : 24, maxWidth: 1100 }}>
      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 12 : 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: '#0D1B2A', margin: 0, flex: 1 }}>
          Lot Map
        </h1>

        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <span style={{ fontSize: 13, color: '#4A5568', fontWeight: 600 }}>
              <span style={{ color: '#00B4D8' }}>{occupied}</span>/{total} · <span style={{ color: '#10B981' }}>{available}</span> free
            </span>
            {hasBillingData && (
              <span style={{ fontSize: 11, color: '#94A3B8' }}>
                {dailyAccruing > 0 && <span style={{ color: '#10B981' }}>${dailyAccruing.toFixed(0)}/d accruing</span>}
                {dailyAccruing > 0 && dailyOpportunityCost != null && ' · '}
                {dailyOpportunityCost != null && <span style={{ color: '#F59E0B' }}>${dailyOpportunityCost.toFixed(0)}/d empty</span>}
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatChip label="Total Spots" value={total} />
            <StatChip label="Occupied" value={occupied} color="#00B4D8" />
            <StatChip label="Available" value={available} color="#10B981" />
            {dailyAccruing > 0 && (
              <BillingChip label="Accruing/day" value={`$${dailyAccruing.toFixed(2)}`} color="#10B981" bg="#D1FAE5" />
            )}
            {dailyOpportunityCost != null && (
              <BillingChip label="Empty cost/day" value={`$${dailyOpportunityCost.toFixed(2)}`} color="#92400E" bg="#FEF3C7" />
            )}
          </div>
        )}

        {canSetup && (
          <button
            onClick={() => setSetupOpen(true)}
            style={{
              height: isMobile ? 34 : 38, padding: '0 16px', borderRadius: 10,
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

      {/* Legend — desktop only */}
      {!isMobile && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          {LEGEND.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color }} />
              <span style={{ fontSize: 12, color: '#4A5568' }}>{l.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Lot grid */}
      <LotGrid
        spots={spots}
        shapes={shapes}
        mode="view"
        bgUrl={bgUrl}
        bgPan={bgPan}
        bgRotation={bgRotation}
        canSetup={canSetup}
        onSetupClick={() => setSetupOpen(true)}
        onSpotClick={handleSpotClick}
      />

      {/* Setup overlay */}
      {setupOpen && (
        <LotSetupOverlay
          spots={spots}
          shapes={shapes}
          companyId={companyId}
          locationId={locationId}
          bgUrl={bgUrl}
          bgPan={bgPan}
          bgRotation={bgRotation}
          onSpotsChange={setSpots}
          onShapesChange={setShapes}
          onBgChange={setBgUrl}
          onBgPanChange={handleBgPanChange}
          onBgRotationChange={handleBgRotationChange}
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
  { label: 'Pending Pickup',  color: '#F4A62A' },
  { label: 'Picked Up',       color: '#10B981' },
  { label: 'Completed',       color: '#9333EA' },
]

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
      <p style={{ fontSize: 18, fontWeight: 800, color: color ?? '#0D1B2A', margin: 0 }}>{value}</p>
      <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{label}</p>
    </div>
  )
}

function BillingChip({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${color}22`, borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 800, color, margin: 0 }}>{value}</p>
      <p style={{ fontSize: 11, color, opacity: 0.7, margin: 0 }}>{label}</p>
    </div>
  )
}

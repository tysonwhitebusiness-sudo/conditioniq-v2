'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { Settings, Car, TrendingUp, TrendingDown, Maximize2, X } from 'lucide-react'
import LotGrid from './lot-grid'
import LotSetupOverlay from './lot-setup-overlay'
import AssignVehicleModal from './assign-vehicle-modal'
import VehicleDetailSlideOver from './vehicle-detail-slide-over'
import { getLotSpots, getLotBackground, getLotShapes, calculateVehicleBilling } from '@/lib/lot-actions'
import type { LotSpot, LotShape } from '@/lib/lot-actions'
import { createClient } from '@/lib/supabase/client'
import { useMediaQuery } from '@/hooks/use-media-query'

const MIDNIGHT = '#0D1B2A'
const DEEP_NAVY = '#1B2D40'
const CYAN = '#00B4D8'
const AMBER = '#F4A62A'

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
  const [isFullscreen, setIsFullscreen] = useState(false)

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
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 12 : 16 }}>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: MIDNIGHT, margin: 0 }}>
          Lot Map
        </h1>

        {canSetup && (
          <button
            onClick={() => setSetupOpen(true)}
            style={{
              height: isMobile ? 34 : 38, padding: '0 14px', borderRadius: 12,
              border: 'none', background: MIDNIGHT,
              color: CYAN, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Settings size={15} /> Edit Layout
          </button>
        )}
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, marginBottom: isMobile ? 12 : 16 }}>
        <StatTile
          icon={<Car size={14} color={CYAN} />}
          value={`${occupied}/${total}`}
          valueColor={CYAN}
          label={`Occupied · ${available} free`}
        />
        <StatTile
          icon={<TrendingUp size={14} color={CYAN} />}
          value={`$${dailyAccruing.toFixed(0)}/d`}
          valueColor={CYAN}
          label="Accruing"
        />
        <StatTile
          icon={<TrendingDown size={14} color={AMBER} />}
          value={`$${(dailyOpportunityCost ?? 0).toFixed(0)}/d`}
          valueColor={AMBER}
          label="Lost · empty"
        />
      </div>

      {/* Map card */}
      <div style={{
        position: 'relative', borderRadius: 24, overflow: 'hidden',
        border: `1px solid rgba(13,27,42,0.1)`, boxShadow: '0 10px 24px rgba(13,27,42,0.12)',
      }}>
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

        <button
          onClick={() => setIsFullscreen(true)}
          aria-label="Expand map"
          style={{
            position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(13,27,42,0.75)', border: '1px solid rgba(0,180,216,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 15,
          }}
        >
          <Maximize2 size={16} color={CYAN} />
        </button>

        <div style={{
          position: 'absolute', bottom: 12, left: 12, display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', gap: '4px 10px', background: 'rgba(13,27,42,0.75)',
          padding: '6px 10px', borderRadius: 14, maxWidth: 'calc(100% - 24px)', zIndex: 15,
        }}>
          {LEGEND.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fullscreen mode */}
      {isFullscreen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: MIDNIGHT }}>
          <LotGrid
            spots={spots}
            shapes={shapes}
            mode="view"
            bgUrl={bgUrl}
            bgPan={bgPan}
            bgRotation={bgRotation}
            fullBleed
            onSpotClick={handleSpotClick}
          />

          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', padding: '20px 16px 32px',
            background: 'linear-gradient(180deg, rgba(13,27,42,0.92) 0%, rgba(13,27,42,0.55) 65%, rgba(13,27,42,0) 100%)',
            zIndex: 5, pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'auto' }}>
              <div>
                <div style={{ color: '#FFF', fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Lot Map</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: CYAN, fontWeight: 700 }}>{occupied}/{total} <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>occupied</span></span>
                  <span style={{ color: CYAN, fontWeight: 700 }}>${dailyAccruing.toFixed(0)}/d <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>accruing</span></span>
                  <span style={{ color: AMBER, fontWeight: 700 }}>${(dailyOpportunityCost ?? 0).toFixed(0)}/d <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 400 }}>lost</span></span>
                </div>
              </div>
              <button
                onClick={() => setIsFullscreen(false)}
                aria-label="Exit fullscreen"
                style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(13,27,42,0.85)', border: `1px solid ${CYAN}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                }}
              >
                <X size={17} color={CYAN} />
              </button>
            </div>
          </div>

          {canSetup && (
            <button
              onClick={() => setSetupOpen(true)}
              style={{
                position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(13,27,42,0.85)', border: `1px solid rgba(0,180,216,0.5)`,
                borderRadius: 999, padding: '12px 16px', boxShadow: '0 6px 16px rgba(0,0,0,0.35)',
                cursor: 'pointer', fontFamily: 'inherit', zIndex: 5,
              }}
            >
              <Settings size={16} color={CYAN} />
              <span style={{ color: '#FFF', fontSize: 13, fontWeight: 600 }}>Edit Layout</span>
            </button>
          )}
        </div>
      )}

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

function StatTile({ icon, value, valueColor, label }: { icon: ReactNode; value: string; valueColor: string; label: string }) {
  return (
    <div style={{ flex: 1, background: DEEP_NAVY, borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        <span style={{ fontSize: 15, fontWeight: 700, color: valueColor }}>{value}</span>
      </div>
      <span style={{ fontSize: 11, color: 'rgba(240,244,248,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

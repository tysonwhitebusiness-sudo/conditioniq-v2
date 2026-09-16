'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { useAuth } from '@/contexts/auth-context'
import { Settings, Car, TrendingUp, TrendingDown, Maximize2, X } from 'lucide-react'
import LotGrid from './lot-grid'
import LotSetupOverlay from './lot-setup-overlay'
import AssignVehicleModal from './assign-vehicle-modal'
import VehicleDetailSlideOver from './vehicle-detail-slide-over'
import OffLotSideList from './off-lot-side-list'
import { getLotSpots, getLotBackground, getLotShapes, getAvailableVehicles, assignVehicleToSpot } from '@/lib/lot-actions'
import type { LotSpot, LotShape, AvailableVehicle } from '@/lib/lot-actions'
import { getLotDailyAccrual } from '@/lib/dashboard-stats'
import { createClient } from '@/lib/supabase/client'
import { useMediaQuery } from '@/hooks/use-media-query'
import { PRIMARY, AMBER, WHITE, GRAY_300, GRAY_500, GRAY_700, GRAY_900 } from '@/lib/design-tokens'

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
  const [dailyAccruing, setDailyAccruing] = useState(0)
  const [availableVehicles, setAvailableVehicles] = useState<AvailableVehicle[]>([])
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
    const [s, sh, bg, companyRes, accrual, avail] = await Promise.all([
      getLotSpots(companyId, locationId),
      getLotShapes(companyId, locationId),
      getLotBackground(companyId, locationId),
      createClient().from('companies').select('default_daily_rate, default_monthly_rate, default_billing_type').eq('id', companyId).single(),
      getLotDailyAccrual(companyId, locationId),
      getAvailableVehicles(companyId),
    ])
    setSpots(s); setShapes(sh); setBgUrl(bg)
    setCompanyDefaults(companyRes.data ?? null)
    setDailyAccruing(accrual)
    setAvailableVehicles(avail)
    setLoading(false)
  }

  useEffect(() => { load() }, [companyId, locationId])

  const handleSpotClick = (spot: LotSpot) => {
    if (spot.active_assignment) setDetailSpot(spot)
    else setAssignSpot(spot)
  }

  const handleAssign = async (vehicleId: string, spotId: string) => {
    if (!user?.id) return
    await assignVehicleToSpot(spotId, vehicleId, user.id)
    load()
  }

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const handleDragEnd = (e: DragEndEvent) => {
    const activeId = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (!overId || !activeId.startsWith('vehicle:') || !overId.startsWith('spot:')) return
    handleAssign(activeId.slice('vehicle:'.length), overId.slice('spot:'.length))
  }

  const occupied = spots.filter(s => s.active_assignment).length
  const total = spots.length
  const available = total - occupied

  // Billing calculations
  const defaults = (companyDefaults ?? {}) as NonNullable<typeof companyDefaults>
  const defaultDailyRate = defaults.default_daily_rate ?? null

  // dailyAccruing comes from lib/dashboard-stats.ts's getLotDailyAccrual — the
  // real status-based billable/rate precedence chain (Phase 5), not a local
  // recalculation. Opportunity cost below stays a Lot-Map-only metric (empty
  // spots × default daily rate) — Phase 5 never owned that number.
  const dailyOpportunityCost = defaultDailyRate != null ? available * defaultDailyRate : null

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ height: 60, background: GRAY_300, borderRadius: 12, marginBottom: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ paddingBottom: '56.25%', background: GRAY_300, borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      </div>
    )
  }

  return (
    <DndContext sensors={dndSensors} onDragEnd={handleDragEnd}>
    <div style={{ padding: isMobile ? '12px 16px' : 24, maxWidth: 1100 }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isMobile ? 12 : 16 }}>
        <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: GRAY_900, margin: 0 }}>
          Lot Map
        </h1>

        {canSetup && (
          <button
            onClick={() => setSetupOpen(true)}
            style={{
              height: isMobile ? 34 : 38, padding: '0 14px', borderRadius: 12,
              border: `1px solid ${GRAY_300}`, background: WHITE,
              color: GRAY_900, fontSize: 13, fontWeight: 600,
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
          icon={<Car size={14} color={PRIMARY} />}
          value={`${occupied}/${total}`}
          valueColor={PRIMARY}
          label={`Occupied · ${available} free`}
        />
        <StatTile
          icon={<TrendingUp size={14} color={PRIMARY} />}
          value={`$${dailyAccruing.toFixed(0)}/d`}
          valueColor={PRIMARY}
          label="Accruing"
        />
        <StatTile
          icon={<TrendingDown size={14} color={AMBER} />}
          value={`$${(dailyOpportunityCost ?? 0).toFixed(0)}/d`}
          valueColor={AMBER}
          label="Lost · empty"
        />
      </div>

      {/* Off-lot side list */}
      <OffLotSideList
        vehicles={availableVehicles}
        emptySpots={spots.filter(s => !s.active_assignment)}
        allSpots={spots}
        shapes={shapes}
        onAssign={handleAssign}
      />

      {/* Map card */}
      <div style={{
        position: 'relative', borderRadius: 24, overflow: 'hidden',
        border: `1px solid ${GRAY_300}`, boxShadow: '0 10px 24px rgba(15,23,42,0.08)',
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
            background: WHITE, border: `1px solid ${GRAY_300}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 15,
            boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
          }}
        >
          <Maximize2 size={16} color={GRAY_900} />
        </button>

        <div style={{
          position: 'absolute', bottom: 12, left: 12, display: 'flex', flexWrap: 'wrap',
          alignItems: 'center', gap: '4px 10px', background: WHITE, border: `1px solid ${GRAY_300}`,
          padding: '6px 10px', borderRadius: 14, maxWidth: 'calc(100% - 24px)', zIndex: 15,
          boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
        }}>
          {LEGEND.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color, flexShrink: 0 }} />
              <span style={{ fontSize: 9, color: GRAY_700, whiteSpace: 'nowrap' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Fullscreen mode */}
      {isFullscreen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: WHITE }}>
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
            background: 'linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.65) 65%, rgba(255,255,255,0) 100%)',
            zIndex: 5, pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', pointerEvents: 'auto' }}>
              <div>
                <div style={{ color: GRAY_900, fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Lot Map</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
                  <span style={{ color: PRIMARY, fontWeight: 700 }}>{occupied}/{total} <span style={{ color: GRAY_500, fontWeight: 400 }}>occupied</span></span>
                  <span style={{ color: PRIMARY, fontWeight: 700 }}>${dailyAccruing.toFixed(0)}/d <span style={{ color: GRAY_500, fontWeight: 400 }}>accruing</span></span>
                  <span style={{ color: AMBER, fontWeight: 700 }}>${(dailyOpportunityCost ?? 0).toFixed(0)}/d <span style={{ color: GRAY_500, fontWeight: 400 }}>lost</span></span>
                </div>
              </div>
              <button
                onClick={() => setIsFullscreen(false)}
                aria-label="Exit fullscreen"
                style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: WHITE, border: `1px solid ${GRAY_300}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
                }}
              >
                <X size={17} color={GRAY_900} />
              </button>
            </div>
          </div>

          {canSetup && (
            <button
              onClick={() => setSetupOpen(true)}
              style={{
                position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
                display: 'flex', alignItems: 'center', gap: 8,
                background: WHITE, border: `1px solid ${GRAY_300}`,
                borderRadius: 999, padding: '12px 16px', boxShadow: '0 6px 16px rgba(15,23,42,0.15)',
                cursor: 'pointer', fontFamily: 'inherit', zIndex: 5,
              }}
            >
              <Settings size={16} color={GRAY_900} />
              <span style={{ color: GRAY_900, fontSize: 13, fontWeight: 600 }}>Edit Layout</span>
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
    </DndContext>
  )
}

const LEGEND = [
  { label: 'Empty',           color: GRAY_300 },
  { label: 'Occupied',        color: PRIMARY },
  { label: 'Needs Attention', color: AMBER },
]

function StatTile({ icon, value, valueColor, label }: { icon: ReactNode; value: string; valueColor: string; label: string }) {
  return (
    <div style={{ flex: 1, background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon}
        <span style={{ fontSize: 15, fontWeight: 700, color: valueColor }}>{value}</span>
      </div>
      <span style={{ fontSize: 11, color: GRAY_500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}

'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Minimize2 } from 'lucide-react'
import type { LotSpot, LotShape, ZoneConfig, BorderConfig, MarkerConfig } from '@/lib/lot-actions'
import { useMediaQuery } from '@/hooks/use-media-query'

export type LotGridMode = 'view' | 'setup'

export const SPOT_COLOR: Record<string, string> = {
  pending_arrival: '#94A3B8',
  on_lot:          '#00B4D8',
  pending_pickup:  '#F4A62A',
  picked_up:       '#10B981',
  completed:       '#9333EA',
}
export const EMPTY_COLOR = '#E1E8F0'

// ── Fullscreen zoom/pan math (fullBleed only) ───────────────────────────────────

const FS_MIN_SCALE = 1
const FS_MAX_SCALE = 4

function fsClampPan(pan: { x: number; y: number }, scale: number, vw: number, vh: number) {
  if (scale <= FS_MIN_SCALE || vw === 0 || vh === 0) return { x: 0, y: 0 }
  const minX = vw - vw * scale
  const minY = vh - vh * scale
  return {
    x: Math.min(0, Math.max(minX, pan.x)),
    y: Math.min(0, Math.max(minY, pan.y)),
  }
}

function fsZoomToPoint(
  prevScale: number, prevPan: { x: number; y: number }, nextScaleRaw: number,
  cx: number, cy: number, vw: number, vh: number,
) {
  const nextScale = Math.max(FS_MIN_SCALE, Math.min(FS_MAX_SCALE, nextScaleRaw))
  const ux = (cx - prevPan.x) / prevScale
  const uy = (cy - prevPan.y) / prevScale
  const rawPan = { x: cx - ux * nextScale, y: cy - uy * nextScale }
  return { scale: nextScale, pan: fsClampPan(rawPan, nextScale, vw, vh) }
}

// ── Marker size — scales with the map's actual measured width instead of a
// fixed px value, so 300+ spots stay legible without merging on narrow
// screens while desktop keeps roughly its old size. Visual dot and label
// font both derive from the same measured width; the tap/click target is
// kept larger than the visual dot so small dots stay easy to hit on touch.
const MARKER_MIN_VISUAL = 9
const MARKER_MAX_VISUAL = 28
const MARKER_MIN_HIT = 32

function computeMarkerSize(containerWidth: number) {
  const fallback = 22 // used for one frame before ResizeObserver reports a real width
  const raw = containerWidth > 0 ? containerWidth * 0.02 : fallback
  const visual = Math.max(MARKER_MIN_VISUAL, Math.min(MARKER_MAX_VISUAL, raw))
  const hit = Math.max(visual + 12, MARKER_MIN_HIT)
  const fontSize = Math.max(6, Math.min(11, visual * 0.42))
  const borderWidth = visual <= 14 ? 1 : 2
  return { visual, hit, fontSize, borderWidth }
}

interface Props {
  spots: LotSpot[]
  shapes?: LotShape[]
  mode: LotGridMode
  bgUrl: string | null
  bgPan?: { x: number; y: number }
  bgRotation?: number
  selectedSpotId?: string | null
  canSetup?: boolean
  fullBleed?: boolean
  onSetupClick?: () => void
  onSpotClick?: (spot: LotSpot) => void
  onCanvasClick?: (xPct: number, yPct: number) => void
  onBgPanChange?: (pan: { x: number; y: number }) => void
  onSpotDragMove?: (spotId: string, xPct: number, yPct: number) => void
  onSpotDragEnd?: (spotId: string, xPct: number, yPct: number) => void
}

export default function LotGrid({
  spots, shapes = [], mode, bgUrl, bgPan, bgRotation = 0, selectedSpotId,
  canSetup, fullBleed, onSetupClick,
  onSpotClick, onCanvasClick, onBgPanChange, onSpotDragMove, onSpotDragEnd,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const spotDragging = useRef<{ spotId: string; lastX: number; lastY: number } | null>(null)
  const panCapture = useRef<{ startCX: number; startCY: number; startPX: number; startPY: number } | null>(null)
  const pinchRef = useRef<{ dist: number; baseScale: number } | null>(null)
  const [livePan, setLivePan] = useState<{ x: number; y: number }>(bgPan ?? { x: 0, y: 0 })
  const [viewScale, setViewScale] = useState(1)
  const isMobile = useMediaQuery('(max-width: 767px)')

  useEffect(() => { setLivePan(bgPan ?? { x: 0, y: 0 }) }, [bgPan?.x, bgPan?.y])

  // ── Fullscreen zoom/pan state — only used when fullBleed is true ─────────────
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 })
  const [fsScale, setFsScale] = useState(1)
  const [fsPan, setFsPan] = useState({ x: 0, y: 0 })
  const fsPinchRef = useRef<{ dist: number; baseScale: number; midX: number; midY: number; basePan: { x: number; y: number } } | null>(null)
  const fsDragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number; moved: boolean } | null>(null)
  const lastTapRef = useRef(0)

  // Measured in every mode (not just fullBleed) — card view needs the real
  // rendered width too, to size markers relative to the map instead of a
  // fixed px value that only ever recognized "mobile" vs "desktop".
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const update = () => setViewportSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fsResetZoom = () => { setFsScale(1); setFsPan({ x: 0, y: 0 }) }

  // React registers onWheel as a passive listener by default, which silently
  // ignores e.preventDefault() — so ctrl/cmd+scroll would fight the browser's
  // own native page-zoom instead of driving ours. A native, explicitly
  // non-passive listener is the only reliable way to intercept it. Refs keep
  // the handler reading current scale/pan without re-attaching on every tick.
  const fsScaleRef = useRef(fsScale)
  const fsPanRef = useRef(fsPan)
  fsScaleRef.current = fsScale
  fsPanRef.current = fsPan

  useEffect(() => {
    if (!fullBleed) return
    const el = viewportRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return // plain scroll must keep working normally
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * 0.002)
      const { scale, pan } = fsZoomToPoint(fsScaleRef.current, fsPanRef.current, fsScaleRef.current * factor, cx, cy, rect.width, rect.height)
      setFsScale(scale); setFsPan(pan)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [fullBleed])

  const fsGetPinchDist = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  const handleFsTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    if (e.touches.length === 2) {
      fsDragRef.current = null
      fsPinchRef.current = {
        dist: fsGetPinchDist(e.touches[0], e.touches[1]),
        baseScale: fsScale, basePan: fsPan,
        midX: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
        midY: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
      }
    }
  }

  const handleFsTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    if (e.touches.length === 2 && fsPinchRef.current) {
      const { dist: baseDist, baseScale, midX, midY, basePan } = fsPinchRef.current
      const ratio = fsGetPinchDist(e.touches[0], e.touches[1]) / baseDist
      const { scale, pan } = fsZoomToPoint(baseScale, basePan, baseScale * ratio, midX, midY, rect.width, rect.height)
      setFsScale(scale); setFsPan(pan)
    }
  }

  const handleFsTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) fsPinchRef.current = null
    if (e.touches.length === 0 && !fsDragRef.current?.moved) {
      const now = Date.now()
      if (now - lastTapRef.current < 300) { fsResetZoom(); lastTapRef.current = 0 }
      else lastTapRef.current = now
    }
    if (e.touches.length === 0) fsDragRef.current = null
  }

  const handleFsPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).dataset.spot) return
    if (fsScale <= FS_MIN_SCALE) return
    if (fsPinchRef.current) return // a 2-finger pinch already owns this gesture
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    fsDragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: fsPan.x, startPanY: fsPan.y, moved: false }
  }

  const handleFsPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!fsDragRef.current || fsPinchRef.current) return
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = e.clientX - fsDragRef.current.startX
    const dy = e.clientY - fsDragRef.current.startY
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) fsDragRef.current.moved = true
    setFsPan(fsClampPan({ x: fsDragRef.current.startPanX + dx, y: fsDragRef.current.startPanY + dy }, fsScale, rect.width, rect.height))
  }

  const handleFsPointerUp = () => { fsDragRef.current = null }

  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'setup') return
    if ((e.target as HTMLElement).dataset.spot) return
    panCapture.current = { startCX: e.clientX, startCY: e.clientY, startPX: livePan.x, startPY: livePan.y }
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
  }

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panCapture.current) return
    const dx = e.clientX - panCapture.current.startCX
    const dy = e.clientY - panCapture.current.startCY
    setLivePan({ x: panCapture.current.startPX + dx, y: panCapture.current.startPY + dy })
  }

  const handleContainerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panCapture.current) return
    const dx = e.clientX - panCapture.current.startCX
    const dy = e.clientY - panCapture.current.startCY
    if (Math.sqrt(dx * dx + dy * dy) < 5) {
      setLivePan({ x: panCapture.current.startPX, y: panCapture.current.startPY })
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) onCanvasClick?.(((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100)
    } else {
      onBgPanChange?.({ x: panCapture.current.startPX + dx, y: panCapture.current.startPY + dy })
    }
    panCapture.current = null
  }

  const getPinchDist = (t1: React.Touch, t2: React.Touch) => {
    const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY
    return Math.sqrt(dx * dx + dy * dy)
  }
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = { dist: getPinchDist(e.touches[0], e.touches[1]), baseScale: viewScale }
    }
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const newDist = getPinchDist(e.touches[0], e.touches[1])
      const ratio = newDist / pinchRef.current.dist
      setViewScale(Math.max(0.8, Math.min(4, pinchRef.current.baseScale * ratio)))
    }
  }
  const handleTouchEnd = () => { pinchRef.current = null }

  const toContainerPct = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    return { x: Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100)), y: Math.max(2, Math.min(98, ((clientY - rect.top) / rect.height) * 100)) }
  }

  const handleSpotPointerDown = (e: React.PointerEvent<HTMLDivElement>, spot: LotSpot) => {
    if (mode !== 'setup') return
    e.stopPropagation()
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    spotDragging.current = { spotId: spot.id, lastX: spot.x_position, lastY: spot.y_position }
    onSpotClick?.(spot)
  }

  const handleSpotPointerMove = (e: React.PointerEvent<HTMLDivElement>, spot: LotSpot) => {
    if (!spotDragging.current || spotDragging.current.spotId !== spot.id) return
    const pos = toContainerPct(e.clientX, e.clientY)
    if (!pos) return
    spotDragging.current.lastX = pos.x; spotDragging.current.lastY = pos.y
    onSpotDragMove?.(spot.id, pos.x, pos.y)
  }

  const handleSpotPointerUp = (e: React.PointerEvent<HTMLDivElement>, spot: LotSpot) => {
    if (!spotDragging.current || spotDragging.current.spotId !== spot.id) return
    onSpotDragEnd?.(spot.id, spotDragging.current.lastX, spotDragging.current.lastY)
    spotDragging.current = null
  }

  const aspectRatio = isMobile ? '75%' : '56.25%'

  // Marker size is derived from the map's actual measured width (viewportSize.w
  // at scale=1) — not fsScale, so markers stay visually constant-sized while
  // zoomed, matching the position-scales-but-size-doesn't split from before.
  const { visual: markerVisual, hit: markerHit, fontSize: markerFont, borderWidth: markerBorder } = computeMarkerSize(viewportSize.w)

  const markerElements = spots.map(spot => {
    const status = spot.active_assignment?.vehicle?.lifecycle_status
    const isInspecting = (spot.active_assignment?.vehicle as any)?._inspecting === true
    const isEmpty = !spot.active_assignment
    const defaultColor = isEmpty ? 'rgba(13,27,42,0.35)' : (status ? (SPOT_COLOR[status] ?? EMPTY_COLOR) : EMPTY_COLOR)
    const bg = spot.custom_color ?? defaultColor
    const isDefaultEmpty = isEmpty && !spot.custom_color
    const isSelected = selectedSpotId === spot.id
    const pos = fullBleed
      ? { left: (spot.x_position / 100) * viewportSize.w * fsScale + fsPan.x, top: (spot.y_position / 100) * viewportSize.h * fsScale + fsPan.y }
      : { left: `${spot.x_position}%`, top: `${spot.y_position}%` }
    return (
      <div
        key={spot.id}
        data-spot="true"
        onPointerDown={e => mode === 'setup'
          ? handleSpotPointerDown(e, spot)
          : (e.stopPropagation(), onSpotClick?.(spot))
        }
        onPointerMove={e => handleSpotPointerMove(e, spot)}
        onPointerUp={e => handleSpotPointerUp(e, spot)}
        style={{
          position: 'absolute',
          left: pos.left,
          top: pos.top,
          width: markerHit,
          height: markerHit,
          transform: 'translate(-50%, -50%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: mode === 'setup' ? 'grab' : 'pointer',
          zIndex: isSelected ? 10 : 2,
          pointerEvents: 'auto',
        }}
      >
        {/* Visual dot — sized independently of the (larger) tap/click target above */}
        <div style={{
          position: 'relative',
          width: markerVisual, height: markerVisual,
          background: bg, borderRadius: '50%',
          border: isSelected ? `${markerBorder}px solid #0D1B2A` : isDefaultEmpty ? `${markerBorder}px solid rgba(255,255,255,0.7)` : `${markerBorder}px solid rgba(13,27,42,0.35)`,
          boxShadow: isSelected ? '0 0 0 3px rgba(0,180,216,0.35)' : '0 2px 6px rgba(13,27,42,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'box-shadow 120ms',
          pointerEvents: 'none',
        }}>
          <span style={{
            fontSize: markerFont, fontWeight: 700, lineHeight: 1,
            color: isDefaultEmpty ? '#F0F4F8' : '#0D1B2A', textAlign: 'center',
          }}>
            {spot.label}
          </span>
          {isInspecting && (
            <span title="Inspection in progress" style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, background: '#F59E0B', border: '1.5px solid #FFF', animation: 'lot-pulse 1.5s ease-in-out infinite' }} />
          )}
        </div>
      </div>
    )
  })

  return (
    <>
    <style>{`@keyframes lot-pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    <div
      ref={viewportRef}
      style={{ position: 'relative', width: '100%', height: fullBleed ? '100%' : undefined, overflow: 'hidden', touchAction: 'none' }}
      onTouchStart={fullBleed ? handleFsTouchStart : mode === 'view' ? handleTouchStart : undefined}
      onTouchMove={fullBleed ? handleFsTouchMove : mode === 'view' ? handleTouchMove : undefined}
      onTouchEnd={fullBleed ? handleFsTouchEnd : mode === 'view' ? handleTouchEnd : undefined}
      onPointerDown={fullBleed ? handleFsPointerDown : undefined}
      onPointerMove={fullBleed ? handleFsPointerMove : undefined}
      onPointerUp={fullBleed ? handleFsPointerUp : undefined}
      onDoubleClick={fullBleed ? fsResetZoom : undefined}
    >
    <div
      ref={containerRef}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      style={{
        position: 'relative', width: '100%',
        ...(fullBleed ? { height: '100%' } : { paddingBottom: aspectRatio }),
        background: bgUrl ? undefined : '#F0F4F8',
        borderRadius: fullBleed ? 0 : 12, overflow: 'hidden',
        border: fullBleed ? 'none' : '1px solid #E1E8F0',
        cursor: mode === 'setup' ? 'crosshair' : fullBleed && fsScale > 1 ? 'grab' : 'default',
        userSelect: 'none',
        transform: fullBleed
          ? (fsScale !== 1 ? `translate(${fsPan.x}px, ${fsPan.y}px) scale(${fsScale})` : undefined)
          : (mode === 'view' && viewScale !== 1 ? `scale(${viewScale})` : undefined),
        transformOrigin: fullBleed ? '0 0' : '50% 0',
        transition: fullBleed ? undefined : 'transform 0.05s',
      }}
    >
      {/* Background image with pan + rotation */}
      {bgUrl && (
        <img
          src={bgUrl}
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', pointerEvents: 'none', zIndex: 0,
            transformOrigin: 'center',
            transform: `translate(${livePan.x}px, ${livePan.y}px) rotate(${bgRotation}deg)`,
          }}
        />
      )}

      {/* SVG overlay for shapes */}
      {shapes.length > 0 && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
        >
          {shapes.filter(s => s.shape_type === 'zone').map(s => {
            const c = s.config as ZoneConfig
            const cx = c.x + c.width / 2
            const cy = c.y + c.height / 2
            const rot = c.rotation ?? 0
            return (
              <g key={s.id} transform={rot ? `rotate(${rot}, ${cx}, ${cy})` : undefined}>
                <rect x={c.x} y={c.y} width={c.width} height={c.height}
                  fill={s.color} fillOpacity={s.fill_opacity}
                  stroke={s.color} strokeWidth={0.4} rx={0.5}
                />
                {s.label && (
                  <text x={cx} y={c.y + 2.5} textAnchor="middle"
                    fill={s.color} fontSize={2.2} fontWeight="700" fontFamily="system-ui"
                  >{s.label}</text>
                )}
              </g>
            )
          })}
          {shapes.filter(s => s.shape_type === 'border').map(s => {
            const c = s.config as BorderConfig
            if (!c.points?.length) return null
            const pts = c.points.map(p => `${p.x},${p.y}`).join(' ')
            return c.closed
              ? <polygon key={s.id} points={pts} fill={s.color} fillOpacity={s.fill_opacity} stroke={s.color} strokeWidth={s.stroke_width * 0.15} />
              : <polyline key={s.id} points={pts} fill="none" stroke={s.color} strokeWidth={s.stroke_width * 0.15} />
          })}
          {shapes.filter(s => s.shape_type === 'marker').map(s => {
            const c = s.config as MarkerConfig
            const isEntrance = c.marker_type === 'entrance'
            return (
              <g key={s.id}>
                <circle cx={c.x} cy={c.y} r={2.5} fill={isEntrance ? '#10B981' : '#EF4444'} />
                <text x={c.x} y={c.y + 4.5} textAnchor="middle" fill={isEntrance ? '#10B981' : '#EF4444'} fontSize={1.8} fontWeight="700" fontFamily="system-ui">
                  {s.label ?? (isEntrance ? 'IN' : 'OUT')}
                </text>
              </g>
            )
          })}
        </svg>
      )}

      {/* Empty-state hints */}
      {spots.length === 0 && mode === 'view' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, zIndex: 2 }}>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>No spots configured yet.</p>
          {canSetup ? (
            <button
              onClick={onSetupClick}
              style={{ height: 36, padding: '0 18px', borderRadius: 10, border: '1.5px solid #00B4D8', background: '#FFF', color: '#00B4D8', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Set Up Lot Layout
            </button>
          ) : (
            <p style={{ fontSize: 12, color: '#CBD5E0', margin: 0 }}>Ask an admin to set up the lot layout.</p>
          )}
        </div>
      )}
      {spots.length === 0 && mode === 'setup' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>Click anywhere to add a spot · Drag to pan image</p>
        </div>
      )}

      {!fullBleed && markerElements}
    </div>

    {/* Fullscreen: markers rendered in an un-scaled overlay so they stay a constant size */}
    {fullBleed && viewportSize.w > 0 && (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
        {markerElements}
      </div>
    )}

    {/* Fullscreen: persistent reset-zoom button, shown only when zoomed in */}
    {fullBleed && fsScale > 1 && (
      <button
        onPointerDown={e => { e.stopPropagation(); fsResetZoom() }}
        title="Reset zoom"
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 20,
          width: 34, height: 34, borderRadius: '50%',
          background: 'rgba(13,27,42,0.75)', border: '1px solid rgba(0,180,216,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <Minimize2 size={15} color="#00B4D8" />
      </button>
    )}

    {/* Double-tap reset hint on mobile — non-fullscreen card view only */}
    {isMobile && !fullBleed && mode === 'view' && viewScale !== 1 && (
      <button
        onPointerDown={e => { e.stopPropagation(); setViewScale(1) }}
        style={{
          position: 'absolute', zIndex: 20, height: 28, padding: '0 10px', borderRadius: 8,
          background: 'rgba(13,27,42,0.75)', border: 'none', color: '#FFF', fontSize: 11, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', top: 8, right: 8,
        }}
      >Reset zoom</button>
    )}
    </div>
    </>
  )
}

'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Minimize2, MousePointerClick } from 'lucide-react'
import type { LotSpot, LotShape, ZoneConfig, BorderConfig, MarkerConfig } from '@/lib/lot-actions'
import { getSpotPinColor } from '@/lib/work-order-status'
import { useMediaQuery } from '@/hooks/use-media-query'
import { PRIMARY, SUCCESS, DANGER, WARN, WHITE, GRAY_300, GRAY_500, GRAY_900, GRAY_100 } from '@/lib/design-tokens'

export type LotGridMode = 'view' | 'setup'

export const EMPTY_COLOR = GRAY_300

// ── Pan/zoom math — shared by the card view and the fullBleed fullscreen overlay ──

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

// Only empty spots become drop targets (id `spot:${id}`, matched by the
// DndContext in storage-lot-view.tsx). Occupied spots stay exactly as before —
// drag-to-reassign only covers "drag a waiting vehicle onto an empty spot,"
// not spot-to-spot moves, so their existing click-to-open-detail behavior
// isn't touched. useDroppable is a passive hook (no listeners attached to the
// element), so this can't interfere with any pointer/click handling below.
function SpotMarker({
  spot, mode, interactive, isSelected, pos, markerHit, markerVisual, markerFont, markerBorder,
  onPointerDown, onPointerMove, onPointerUp,
}: {
  spot: LotSpot
  mode: LotGridMode
  interactive: boolean
  isSelected: boolean
  pos: { left: number | string; top: number | string }
  markerHit: number; markerVisual: number; markerFont: number; markerBorder: number
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
}) {
  const isEmpty = !spot.active_assignment
  const { setNodeRef, isOver } = useDroppable({ id: `spot:${spot.id}`, disabled: !(interactive && isEmpty) })

  const workOrderStatus = spot.active_assignment?.vehicle?.work_order_status
  const isInspecting = (spot.active_assignment?.vehicle as any)?._inspecting === true
  const defaultColor = isEmpty ? EMPTY_COLOR : (workOrderStatus ? (getSpotPinColor(workOrderStatus) ?? EMPTY_COLOR) : EMPTY_COLOR)
  const bg = spot.custom_color ?? defaultColor
  const isDefaultEmpty = isEmpty && !spot.custom_color

  return (
    <div
      ref={setNodeRef}
      data-spot="true"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
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
        border: isOver
          ? `${markerBorder + 1}px solid ${SUCCESS}`
          : isSelected ? `${markerBorder}px solid ${GRAY_900}` : isDefaultEmpty ? `${markerBorder}px solid rgba(255,255,255,0.7)` : `${markerBorder}px solid rgba(15,23,42,0.35)`,
        boxShadow: isOver ? '0 0 0 4px rgba(16,185,129,0.35)' : isSelected ? '0 0 0 3px rgba(0,180,216,0.35)' : '0 2px 6px rgba(15,23,42,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'box-shadow 120ms',
        pointerEvents: 'none',
      }}>
        <span style={{
          fontSize: markerFont, fontWeight: 700, lineHeight: 1,
          color: isDefaultEmpty ? GRAY_100 : GRAY_900, textAlign: 'center',
        }}>
          {spot.label}
        </span>
        {isInspecting && (
          <span title="Inspection in progress" style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, background: WARN, border: `1.5px solid ${WHITE}`, animation: 'lot-pulse 1.5s ease-in-out infinite' }} />
        )}
      </div>
    </div>
  )
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
  const [livePan, setLivePan] = useState<{ x: number; y: number }>(bgPan ?? { x: 0, y: 0 })
  const isMobile = useMediaQuery('(max-width: 767px)')

  useEffect(() => { setLivePan(bgPan ?? { x: 0, y: 0 }) }, [bgPan?.x, bgPan?.y])

  // ── Pan/zoom state — the default interaction whenever mode === 'view', both
  // in the normal card layout and the fullBleed fullscreen overlay. Setup mode
  // uses its own separate spot-dragging/background-pan handlers below instead.
  const interactive = mode === 'view'
  const viewportRef = useRef<HTMLDivElement>(null)
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 })
  const [fsScale, setFsScale] = useState(1)
  const [fsPan, setFsPan] = useState({ x: 0, y: 0 })
  const fsPinchRef = useRef<{ dist: number; baseScale: number; midX: number; midY: number; basePan: { x: number; y: number } } | null>(null)
  const fsDragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number; moved: boolean } | null>(null)
  const lastTapRef = useRef(0)

  // Plain-scroll-to-zoom is opt-in (persisted per-browser) — off by default
  // because the map now renders inline on a page that still needs to scroll
  // normally. Ctrl/cmd+scroll always zooms regardless of this toggle.
  const [scrollZoomEnabled, setScrollZoomEnabled] = useState(false)
  const scrollZoomEnabledRef = useRef(scrollZoomEnabled)
  scrollZoomEnabledRef.current = scrollZoomEnabled
  useEffect(() => {
    setScrollZoomEnabled(localStorage.getItem('lotmap-scroll-zoom') === '1')
  }, [])

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
    if (!interactive) return
    const el = viewportRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      // Ctrl/cmd+scroll always zooms. Plain scroll only zooms when the user
      // has opted into scroll-to-zoom — otherwise it must pass through to
      // the page untouched.
      if (!(e.ctrlKey || e.metaKey) && !scrollZoomEnabledRef.current) return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const cx = e.clientX - rect.left, cy = e.clientY - rect.top
      const factor = Math.exp(-e.deltaY * 0.002)
      const { scale, pan } = fsZoomToPoint(fsScaleRef.current, fsPanRef.current, fsScaleRef.current * factor, cx, cy, rect.width, rect.height)
      setFsScale(scale); setFsPan(pan)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [interactive])

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
    const isSelected = selectedSpotId === spot.id
    const pos = interactive
      ? { left: (spot.x_position / 100) * viewportSize.w * fsScale + fsPan.x, top: (spot.y_position / 100) * viewportSize.h * fsScale + fsPan.y }
      : { left: `${spot.x_position}%`, top: `${spot.y_position}%` }
    return (
      <SpotMarker
        key={spot.id}
        spot={spot}
        mode={mode}
        interactive={interactive}
        isSelected={isSelected}
        pos={pos}
        markerHit={markerHit} markerVisual={markerVisual} markerFont={markerFont} markerBorder={markerBorder}
        onPointerDown={e => mode === 'setup'
          ? handleSpotPointerDown(e, spot)
          : (e.stopPropagation(), onSpotClick?.(spot))
        }
        onPointerMove={e => handleSpotPointerMove(e, spot)}
        onPointerUp={e => handleSpotPointerUp(e, spot)}
      />
    )
  })

  return (
    <>
    <style>{`@keyframes lot-pulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
    <div
      ref={viewportRef}
      style={{ position: 'relative', width: '100%', height: fullBleed ? '100%' : undefined, overflow: 'hidden', touchAction: 'none' }}
      onTouchStart={interactive ? handleFsTouchStart : undefined}
      onTouchMove={interactive ? handleFsTouchMove : undefined}
      onTouchEnd={interactive ? handleFsTouchEnd : undefined}
      onPointerDown={interactive ? handleFsPointerDown : undefined}
      onPointerMove={interactive ? handleFsPointerMove : undefined}
      onPointerUp={interactive ? handleFsPointerUp : undefined}
      onDoubleClick={interactive ? fsResetZoom : undefined}
    >
    <div
      ref={containerRef}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      style={{
        position: 'relative', width: '100%',
        ...(fullBleed ? { height: '100%' } : { paddingBottom: aspectRatio }),
        background: bgUrl ? undefined : GRAY_100,
        borderRadius: fullBleed ? 0 : 12, overflow: 'hidden',
        border: fullBleed ? 'none' : `1px solid ${GRAY_300}`,
        cursor: mode === 'setup' ? 'crosshair' : interactive && fsScale > 1 ? 'grab' : 'default',
        userSelect: 'none',
        transform: interactive && fsScale !== 1 ? `translate(${fsPan.x}px, ${fsPan.y}px) scale(${fsScale})` : undefined,
        transformOrigin: '0 0',
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
                <circle cx={c.x} cy={c.y} r={2.5} fill={isEntrance ? SUCCESS : DANGER} />
                <text x={c.x} y={c.y + 4.5} textAnchor="middle" fill={isEntrance ? SUCCESS : DANGER} fontSize={1.8} fontWeight="700" fontFamily="system-ui">
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
          <p style={{ fontSize: 14, color: GRAY_500, margin: 0 }}>No spots configured yet.</p>
          {canSetup ? (
            <button
              onClick={onSetupClick}
              style={{ height: 36, padding: '0 18px', borderRadius: 10, border: `1.5px solid ${PRIMARY}`, background: WHITE, color: PRIMARY, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Set Up Lot Layout
            </button>
          ) : (
            <p style={{ fontSize: 12, color: GRAY_300, margin: 0 }}>Ask an admin to set up the lot layout.</p>
          )}
        </div>
      )}
      {spots.length === 0 && mode === 'setup' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
          <p style={{ fontSize: 14, color: GRAY_500, margin: 0 }}>Click anywhere to add a spot · Drag to pan image</p>
        </div>
      )}

      {!interactive && markerElements}
    </div>

    {/* Markers rendered in an un-scaled overlay so they stay a constant size while zoomed */}
    {interactive && viewportSize.w > 0 && (
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
        {markerElements}
      </div>
    )}

    {/* Persistent reset-zoom button, shown only when zoomed in */}
    {interactive && fsScale > 1 && (
      <button
        onPointerDown={e => { e.stopPropagation(); fsResetZoom() }}
        title="Reset zoom"
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 20,
          width: 34, height: 34, borderRadius: '50%',
          background: WHITE, border: `1px solid ${GRAY_300}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(15,23,42,0.12)',
        }}
      >
        <Minimize2 size={15} color={GRAY_900} />
      </button>
    )}

    {/* Scroll-to-zoom toggle — opt-in since plain scroll otherwise scrolls the page */}
    {interactive && !isMobile && (
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={() => {
          const next = !scrollZoomEnabled
          setScrollZoomEnabled(next)
          localStorage.setItem('lotmap-scroll-zoom', next ? '1' : '0')
        }}
        title={scrollZoomEnabled ? 'Scroll to zoom: on (click to disable)' : 'Scroll to zoom: off (click to enable)'}
        style={{
          position: 'absolute', bottom: 12, right: 12, zIndex: 20,
          height: 30, padding: '0 10px', borderRadius: 15,
          background: scrollZoomEnabled ? PRIMARY : WHITE,
          border: `1px solid ${scrollZoomEnabled ? PRIMARY : GRAY_300}`,
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          color: scrollZoomEnabled ? WHITE : GRAY_900, fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
          boxShadow: scrollZoomEnabled ? undefined : '0 2px 8px rgba(15,23,42,0.12)',
        }}
      >
        <MousePointerClick size={13} />
        Scroll to zoom
      </button>
    )}
    </div>
    </>
  )
}

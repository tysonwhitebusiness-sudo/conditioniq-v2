'use client'

import { useEffect, useRef, useState } from 'react'
import type { LotSpot, LotShape, ZoneConfig, BorderConfig, MarkerConfig } from '@/lib/lot-actions'

export type LotGridMode = 'view' | 'setup'

export const SPOT_COLOR: Record<string, string> = {
  pending_arrival: '#94A3B8',
  on_lot:          '#00B4D8',
  in_progress:     '#8B5CF6',
  one_off:         '#F97316',
  releasing:       '#F4A62A',
  released:        '#10B981',
}
export const EMPTY_COLOR = '#E1E8F0'

interface Props {
  spots: LotSpot[]
  shapes?: LotShape[]
  mode: LotGridMode
  bgUrl: string | null
  bgPan?: { x: number; y: number }
  selectedSpotId?: string | null
  onSpotClick?: (spot: LotSpot) => void
  onCanvasClick?: (xPct: number, yPct: number) => void
  onBgPanChange?: (pan: { x: number; y: number }) => void
  onSpotDragMove?: (spotId: string, xPct: number, yPct: number) => void
  onSpotDragEnd?: (spotId: string, xPct: number, yPct: number) => void
}

export default function LotGrid({
  spots, shapes = [], mode, bgUrl, bgPan, selectedSpotId,
  onSpotClick, onCanvasClick, onBgPanChange, onSpotDragMove, onSpotDragEnd,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const spotDragging = useRef<{ spotId: string; lastX: number; lastY: number } | null>(null)
  const panCapture = useRef<{ startCX: number; startCY: number; startPX: number; startPY: number } | null>(null)
  const [livePan, setLivePan] = useState<{ x: number; y: number }>(bgPan ?? { x: 0, y: 0 })

  useEffect(() => { setLivePan(bgPan ?? { x: 0, y: 0 }) }, [bgPan?.x, bgPan?.y])

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

  const bgPos = `calc(50% + ${livePan.x}px) calc(50% + ${livePan.y}px)`

  return (
    <div
      ref={containerRef}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      style={{
        position: 'relative', width: '100%', paddingBottom: '56.25%',
        background: bgUrl ? undefined : '#F0F4F8',
        backgroundImage: bgUrl ? `url(${bgUrl})` : undefined,
        backgroundSize: bgUrl ? 'cover' : undefined,
        backgroundPosition: bgUrl ? bgPos : undefined,
        borderRadius: 12, overflow: 'hidden', border: '1px solid #E1E8F0',
        cursor: mode === 'setup' ? 'crosshair' : 'default',
        userSelect: 'none',
      }}
    >
      {/* SVG overlay for shapes */}
      {shapes.length > 0 && (
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}
        >
          {shapes.filter(s => s.shape_type === 'zone').map(s => {
            const c = s.config as ZoneConfig
            return (
              <g key={s.id}>
                <rect x={c.x} y={c.y} width={c.width} height={c.height}
                  fill={s.color} fillOpacity={s.fill_opacity}
                  stroke={s.color} strokeWidth={0.4} rx={0.5}
                />
                {s.label && (
                  <text x={c.x + c.width / 2} y={c.y + 2.5} textAnchor="middle"
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
          <p style={{ fontSize: 12, color: '#CBD5E0', margin: 0 }}>Ask an admin to set up the lot layout.</p>
        </div>
      )}
      {spots.length === 0 && mode === 'setup' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>Click anywhere to add a spot · Drag to pan image</p>
        </div>
      )}

      {spots.map(spot => {
        const status = spot.active_assignment?.vehicle?.lifecycle_status
        const bg = spot.custom_color ?? (status ? (SPOT_COLOR[status] ?? EMPTY_COLOR) : EMPTY_COLOR)
        const isSelected = selectedSpotId === spot.id
        const label2 = spot.active_assignment?.vehicle
          ? [spot.active_assignment.vehicle.make, spot.active_assignment.vehicle.model].filter(Boolean).join(' ') || spot.active_assignment.vehicle.vin.slice(-6)
          : null
        const w = spot.width ?? 4
        const h = spot.height ?? 7
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
              left: `${spot.x_position}%`,
              top: `${spot.y_position}%`,
              width: `${w}%`,
              height: `${h * 0.5625}%`,
              transform: `translate(-50%, -50%) rotate(${spot.rotation ?? 0}deg)`,
              background: bg,
              borderRadius: '8%',
              border: isSelected ? '2px solid #0D1B2A' : `2px solid ${bg === EMPTY_COLOR ? '#CBD5E0' : 'transparent'}`,
              boxShadow: isSelected ? '0 0 0 3px rgba(0,180,216,0.35)' : '0 2px 6px rgba(13,27,42,0.15)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '2px 4px',
              cursor: mode === 'setup' ? 'grab' : 'pointer',
              transition: 'box-shadow 120ms',
              zIndex: isSelected ? 10 : 2,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: bg === EMPTY_COLOR ? '#94A3B8' : '#FFF', lineHeight: 1.2, textAlign: 'center' }}>
              {spot.label}
            </span>
            {label2 && (
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', lineHeight: 1.2, textAlign: 'center', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label2}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

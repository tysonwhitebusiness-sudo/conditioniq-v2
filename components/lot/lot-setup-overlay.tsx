'use client'

import { useRef, useState, useEffect } from 'react'
import { Upload, Check, Trash2, AlertTriangle, X, Minus, Plus, Grid3X3, Settings2, Copy } from 'lucide-react'
import { useMediaQuery } from '@/hooks/use-media-query'
import {
  uploadLotBackground, generateNextLabel, generateNextLabels,
} from '@/lib/lot-actions'
import {
  createLotSpotAction, updateLotSpotAction, deleteLotSpotAction,
  createLotShapeAction, updateLotShapeAction, deleteLotShapeAction,
  removeLotBackgroundAction,
} from '@/lib/lot-server-actions'
import type { LotSpot, LotShape, ZoneConfig, BorderConfig, MarkerConfig } from '@/lib/lot-actions'
import { SPOT_COLOR, EMPTY_COLOR } from './lot-grid'

type Tool = 'select' | 'spot' | 'row' | 'zone' | 'border' | 'marker'
type SelEl = { type: 'spot'; id: string } | { type: 'shape'; id: string } | null

const ZONE_COLORS  = ['#00B4D8','#10B981','#F4A62A','#EF4444','#F97316','#8B5CF6','#FFFFFF','#64748B']
const BORDER_COLORS = ['#FFFFFF','#F4A62A','#00B4D8','#10B981','#EF4444','#8B5CF6']
const MARKER_COLOR: Record<string, string> = { entrance: '#10B981', exit: '#EF4444', custom: '#F4A62A' }

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Select',  key: 'S', icon: '↖' },
  { id: 'spot',   label: 'Spot',    key: 'P', icon: '▪' },
  { id: 'row',    label: 'Row',     key: 'R', icon: '⋯' },
  { id: 'zone',   label: 'Zone',    key: 'Z', icon: '⬜' },
  { id: 'border', label: 'Border',  key: 'B', icon: '⬡' },
  { id: 'marker', label: 'Marker',  key: 'M', icon: '⬤' },
]

const HINT: Record<Tool, string> = {
  select: 'Click to select · Shift-drag to box-select · Shift-click to multi-select · Drag canvas to pan',
  spot:   'Click canvas to place spot · Drag to move any spot',
  row:    'Click start point, then end point · Enter spot count to place a row',
  zone:   'Drag to draw highlighted area',
  border: 'Click to add points · Finish ✓ to close',
  marker: 'Click to place entrance/exit marker',
}

// ── geometry helpers ────────────────────────────────────────────────────────────

function angleDeg(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)
}

function placeRowPoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
  count: number,
): { x: number; y: number; rotation: number }[] {
  const rot = Math.round(((angleDeg(start, end) % 360) + 360) % 360)
  if (count <= 1) return [{ x: start.x, y: start.y, rotation: rot }]
  const pts: { x: number; y: number; rotation: number }[] = []
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1)
    pts.push({
      x: Math.max(0.5, Math.min(99.5, start.x + (end.x - start.x) * t)),
      y: Math.max(0.5, Math.min(99.5, start.y + (end.y - start.y) * t)),
      rotation: rot,
    })
  }
  return pts
}

interface Props {
  spots: LotSpot[]
  shapes: LotShape[]
  companyId: string
  locationId?: string | null
  bgUrl: string | null
  bgPan: { x: number; y: number }
  bgRotation: number
  onSpotsChange: (s: LotSpot[]) => void
  onShapesChange: (s: LotShape[]) => void
  onBgChange: (url: string | null) => void
  onBgPanChange: (pan: { x: number; y: number }) => void
  onBgRotationChange: (r: number) => void
  onDone: () => void
}

export default function LotSetupOverlay({
  spots, shapes, companyId, locationId, bgUrl, bgPan, bgRotation,
  onSpotsChange, onShapesChange, onBgChange, onBgPanChange, onBgRotationChange, onDone,
}: Props) {
  const canvasRef  = useRef<HTMLDivElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const shapesRef  = useRef(shapes)
  const spotsRef   = useRef(spots)
  useEffect(() => { shapesRef.current = shapes }, [shapes])
  useEffect(() => { spotsRef.current  = spots  }, [spots])

  const [tool, setTool]           = useState<Tool>('select')
  const [selected, setSelected]   = useState<SelEl>(null)
  const [zoom, setZoom]           = useState(1)
  const [showGrid, setShowGrid]   = useState(false)
  const [snapGrid, setSnapGrid]   = useState(false)
  const [livePan, setLivePan]     = useState(bgPan)
  const [bgUploading, setBgUploading] = useState(false)

  // drawing
  const [borderPts, setBorderPts] = useState<{x:number;y:number}[]>([])
  const [previewPt, setPreviewPt] = useState<{x:number;y:number}|null>(null)
  const [zoneDraw, setZoneDraw]   = useState<{sx:number;sy:number;ex:number;ey:number}|null>(null)

  // pointer capture refs
  const panRef  = useRef<{cxs:number;cys:number;pxs:number;pys:number}|null>(null)
  const dragRef = useRef<{id:string;lastX:number;lastY:number;moved:boolean}|null>(null)
  const zoneRef = useRef<{sx:number;sy:number}|null>(null)
  const rotRef  = useRef<{spotId:string;startAngle:number;startRot:number;currentRot:number}|null>(null)

  // edit state
  const [eLabel, setELabel]   = useState('')
  const [eNotes, setENotes]   = useState('')
  const [eW, setEW]           = useState(4)
  const [eH, setEH]           = useState(7)
  const [eRot, setERot]       = useState(0)
  const [eColor, setEColor]   = useState<string|null>(null)
  const [eSColor, setESColor] = useState('#00B4D8')
  const [eSOp, setESOp]       = useState(0.18)
  const [eSStroke, setESStroke] = useState(2)
  const [eSFill, setESFill]   = useState(0.05)
  const [eMType, setEMType]   = useState<'entrance'|'exit'|'custom'>('entrance')
  const [eZoneRot, setEZoneRot] = useState(0)
  const [confirmDel, setConfirmDel] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [mSettingsOpen, setMSettingsOpen] = useState(false)

  // multi-select
  const [multiIds, setMultiIds] = useState<Set<string>>(new Set())
  const [hoveredSpotId, setHoveredSpotId] = useState<string | null>(null)
  const [marqueeDraw, setMarqueeDraw] = useState<{sx:number;sy:number;ex:number;ey:number}|null>(null)
  const marqueeRef = useRef<{sx:number;sy:number}|null>(null)
  const groupDragRef = useRef<{ start: Record<string,{x:number;y:number}>; startPt:{x:number;y:number} }|null>(null)

  // row/line tool
  const [rowPts, setRowPts] = useState<{x:number;y:number}[]>([])
  const [rowCount, setRowCount] = useState('6')

  // copy/paste
  type ClipboardItem = { dx: number; dy: number; width: number; height: number; rotation: number; custom_color: string | null }
  const [clipboard, setClipboard] = useState<ClipboardItem[] | null>(null)
  const [pasteArmed, setPasteArmed] = useState(false)

  // duplicate-with-array
  const [arrayCount, setArrayCount] = useState('3')
  const [arraySpacing, setArraySpacing] = useState('6')
  const [arrayAngle, setArrayAngle] = useState('0')

  // templates
  const [templatesOpen, setTemplatesOpen] = useState(false)

  const isMobile = useMediaQuery('(max-width: 767px)')

  useEffect(() => { setLivePan(bgPan) }, [bgPan.x, bgPan.y])

  const GRID = 5
  const selSpot  = selected?.type === 'spot'  ? spots.find(s => s.id === selected.id) ?? null : null
  const selShape = selected?.type === 'shape' ? shapes.find(s => s.id === selected.id) ?? null : null

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        if (multiIds.size > 0 || selected?.type === 'spot') { e.preventDefault(); handleCopySelection() }
        return
      }

      const t = TOOLS.find(t => t.key === e.key.toUpperCase())
      if (t) { setTool(t.id); if (t.id !== 'border') setBorderPts([]); if (t.id !== 'row') setRowPts([]) }
      if (e.key === 'Escape') {
        setSelected(null); setBorderPts([]); setZoneDraw(null)
        setRowPts([]); setMultiIds(new Set()); setMarqueeDraw(null)
        setPasteArmed(false); setClipboard(null)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace')) {
        if (multiIds.size > 0) { handleDeleteMulti() }
        else if (selected?.type === 'spot') { const sp = spotsRef.current.find(s => s.id === selected.id); if (sp && !sp.active_assignment) handleDeleteSpot() }
        else if (selected?.type === 'shape') handleDeleteShape()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected, multiIds])

  // ── coordinate helper ──────────────────────────────────────────────────────
  const cpt = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    let x = ((clientX - rect.left) / rect.width) * 100
    let y = ((clientY - rect.top) / rect.height) * 100
    if (snapGrid) { x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID }
    return { x: Math.max(0.5, Math.min(99.5, x)), y: Math.max(0.5, Math.min(99.5, y)) }
  }

  // ── select helpers ─────────────────────────────────────────────────────────
  const selectSpot = (sp: LotSpot) => {
    setSelected({ type: 'spot', id: sp.id })
    setELabel(sp.label); setENotes(sp.notes ?? '')
    setEW(sp.width ?? 4); setEH(sp.height ?? 7)
    setERot(sp.rotation ?? 0); setEColor(sp.custom_color ?? null)
    setConfirmDel(false)
  }
  const selectShape = (sh: LotShape) => {
    setSelected({ type: 'shape', id: sh.id })
    setESColor(sh.color); setESOp(sh.fill_opacity)
    setESStroke(sh.stroke_width); setELabel(sh.label ?? '')
    setESFill(sh.fill_opacity)
    if (sh.shape_type === 'marker') setEMType((sh.config as MarkerConfig).marker_type)
    if (sh.shape_type === 'zone') setEZoneRot((sh.config as ZoneConfig).rotation ?? 0)
    setConfirmDel(false)
  }

  // ── canvas events ──────────────────────────────────────────────────────────
  const handleCanvasDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (templatesOpen) setTemplatesOpen(false)
    const tgt = e.target as HTMLElement
    const sId  = tgt.dataset.spot
    const shId = tgt.dataset.shapeId
    const pt = cpt(e.clientX, e.clientY)

    if (tool === 'border') return

    if (tool === 'zone') {
      if (!sId && !shId) {
        zoneRef.current = { sx: pt.x, sy: pt.y }
        setZoneDraw({ sx: pt.x, sy: pt.y, ex: pt.x, ey: pt.y })
        ;(e.currentTarget).setPointerCapture(e.pointerId)
      }
      return
    }

    if (tool === 'marker') {
      if (!sId && !shId) handlePlaceMarker(pt.x, pt.y)
      return
    }

    // spot tool: place on empty canvas (not on existing spot, but borders are fine)
    if (tool === 'spot' && !sId) {
      handlePlaceSpot(pt.x, pt.y)
      return
    }

    // row tool: click start point, then end point
    if (tool === 'row') {
      if (!sId && !shId) {
        if (rowPts.length === 0) setRowPts([pt])
        else if (rowPts.length === 1) setRowPts([rowPts[0], pt])
      }
      return
    }

    // select tool
    if (tool === 'select' && !sId && !shId) {
      // paste-armed: click places the clipboard group here
      if (pasteArmed && clipboard) { handlePasteAt(pt.x, pt.y); return }

      // shift-drag on empty canvas: marquee (box) select
      if (e.shiftKey) {
        marqueeRef.current = { sx: pt.x, sy: pt.y }
        setMarqueeDraw({ sx: pt.x, sy: pt.y, ex: pt.x, ey: pt.y })
        ;(e.currentTarget).setPointerCapture(e.pointerId)
        return
      }

      // plain drag on empty canvas — pan
      panRef.current = { cxs: e.clientX, cys: e.clientY, pxs: livePan.x, pys: livePan.y }
      ;(e.currentTarget).setPointerCapture(e.pointerId)
      setSelected(null); setMultiIds(new Set())
    }
  }

  const handleCanvasMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pt = cpt(e.clientX, e.clientY)
    setPreviewPt(pt)

    if (panRef.current) {
      const dx = e.clientX - panRef.current.cxs, dy = e.clientY - panRef.current.cys
      setLivePan({ x: panRef.current.pxs + dx, y: panRef.current.pys + dy })
    }

    if (zoneRef.current) {
      setZoneDraw({ sx: zoneRef.current.sx, sy: zoneRef.current.sy, ex: pt.x, ey: pt.y })
    }

    if (marqueeRef.current) {
      setMarqueeDraw({ sx: marqueeRef.current.sx, sy: marqueeRef.current.sy, ex: pt.x, ey: pt.y })
    }
  }

  const handleCanvasUp = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current) {
      const dx = e.clientX - panRef.current.cxs, dy = e.clientY - panRef.current.cys
      const pan = { x: panRef.current.pxs + dx, y: panRef.current.pys + dy }
      setLivePan(pan); onBgPanChange(pan); panRef.current = null
    }
    if (zoneRef.current && zoneDraw) {
      const { sx, sy, ex, ey } = zoneDraw
      const w = Math.abs(ex - sx), h = Math.abs(ey - sy)
      if (w > 1.5 && h > 0.8) await handleCreateZone(Math.min(sx,ex), Math.min(sy,ey), w, h)
      zoneRef.current = null; setZoneDraw(null)
    }
    if (marqueeRef.current && marqueeDraw) {
      const { sx, sy, ex, ey } = marqueeDraw
      const minX = Math.min(sx,ex), maxX = Math.max(sx,ex)
      const minY = Math.min(sy,ey), maxY = Math.max(sy,ey)
      const hit = spotsRef.current.filter(s => s.x_position >= minX && s.x_position <= maxX && s.y_position >= minY && s.y_position <= maxY)
      if (hit.length > 0) {
        setMultiIds(prev => new Set(Array.from(prev).concat(hit.map(s => s.id))))
        setSelected(null)
      }
      marqueeRef.current = null; setMarqueeDraw(null)
    }
  }

  // ── SVG border click ───────────────────────────────────────────────────────
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== 'border') return
    const tgt = e.target as SVGElement
    if (tgt.dataset.shapeId || tgt.dataset.spot) return
    const rect = canvasRef.current!.getBoundingClientRect()
    let x = ((e.clientX - rect.left) / rect.width) * 100
    let y = ((e.clientY - rect.top) / rect.height) * 100
    if (snapGrid) { x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID }
    setBorderPts(prev => [...prev, { x: Math.max(0.5, Math.min(99.5, x)), y: Math.max(0.5, Math.min(99.5, y)) }])
  }

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== 'border') return
    const rect = canvasRef.current!.getBoundingClientRect()
    let x = ((e.clientX - rect.left) / rect.width) * 100
    let y = ((e.clientY - rect.top) / rect.height) * 100
    if (snapGrid) { x = Math.round(x / GRID) * GRID; y = Math.round(y / GRID) * GRID }
    setPreviewPt({ x, y })
  }

  // ── actions ────────────────────────────────────────────────────────────────
  const handlePlaceSpot = async (x: number, y: number) => {
    const label = generateNextLabel(spotsRef.current.map(s => s.label))
    const sp = await createLotSpotAction(companyId, { label, x_position: x, y_position: y, location_id: locationId })
    if (!sp) return
    const full = { ...sp, width: 4, height: 7, rotation: 0, custom_color: null }
    onSpotsChange([...spotsRef.current, full])
    selectSpot(full)
  }

  const handleCreateZone = async (x: number, y: number, w: number, h: number) => {
    const sh = await createLotShapeAction(companyId, {
      location_id: locationId ?? null, shape_type: 'zone',
      label: null, color: '#00B4D8', fill_opacity: 0.18, stroke_width: 2,
      config: { x, y, width: w, height: h, rotation: 0 },
    })
    if (!sh) return
    onShapesChange([...shapesRef.current, sh]); selectShape(sh)
  }

  const handlePlaceMarker = async (x: number, y: number) => {
    const sh = await createLotShapeAction(companyId, {
      location_id: locationId ?? null, shape_type: 'marker',
      label: 'Enter', color: '#10B981', fill_opacity: 1, stroke_width: 2,
      config: { x, y, marker_type: 'entrance' },
    })
    if (!sh) return
    onShapesChange([...shapesRef.current, sh]); selectShape(sh)
  }

  const finishBorder = async () => {
    if (borderPts.length < 2) { setBorderPts([]); return }
    const sh = await createLotShapeAction(companyId, {
      location_id: locationId ?? null, shape_type: 'border',
      label: 'Lot Border', color: '#FFFFFF', fill_opacity: 0.05, stroke_width: 2,
      config: { points: borderPts, closed: true },
    })
    if (sh) { onShapesChange([...shapesRef.current, sh]); selectShape(sh) }
    setBorderPts([])
  }

  const handleSaveSpot = async () => {
    if (!selSpot) return
    const u = { label: eLabel.trim() || 'A1', notes: eNotes.trim() || null, width: eW, height: eH, rotation: eRot, custom_color: eColor }
    await updateLotSpotAction(selSpot.id, u)
    onSpotsChange(spots.map(s => s.id === selSpot.id ? { ...s, ...u } : s))
  }

  const handleDeleteSpot = async () => {
    if (!selSpot) return
    setSaving(true)
    await deleteLotSpotAction(selSpot.id)
    onSpotsChange(spots.filter(s => s.id !== selSpot.id))
    setSelected(null); setConfirmDel(false); setSaving(false)
  }

  const handleDuplicateSpot = async () => {
    if (!selSpot) return
    const offset = 4
    const sp = await createLotSpotAction(companyId, {
      label: generateNextLabel(spotsRef.current.map(s => s.label)),
      x_position: Math.min(95, selSpot.x_position + offset),
      y_position: Math.min(95, selSpot.y_position + offset),
      location_id: locationId,
      width: selSpot.width ?? 4,
      height: selSpot.height ?? 7,
      rotation: selSpot.rotation ?? 0,
      custom_color: selSpot.custom_color,
    })
    if (!sp) return
    onSpotsChange([...spotsRef.current, sp])
    selectSpot(sp)
  }

  const handlePlaceRow = async () => {
    if (rowPts.length < 2) return
    const count = Math.max(1, Math.min(40, parseInt(rowCount, 10) || 1))
    const pts = placeRowPoints(rowPts[0], rowPts[1], count)
    const labels = generateNextLabels(spotsRef.current.map(s => s.label), count)
    const created = await Promise.all(pts.map((p, i) => createLotSpotAction(companyId, {
      label: labels[i], x_position: p.x, y_position: p.y, location_id: locationId,
      width: 4, height: 7, rotation: p.rotation,
    })))
    const newSpots = created.filter((s): s is LotSpot => s !== null)
    if (newSpots.length > 0) {
      onSpotsChange([...spotsRef.current, ...newSpots])
      setMultiIds(new Set(newSpots.map(s => s.id))); setSelected(null)
    }
    setRowPts([])
  }

  const handleCopySelection = () => {
    const ids = multiIds.size > 0 ? Array.from(multiIds) : selected?.type === 'spot' ? [selected.id] : []
    const srcSpots = ids.map(id => spotsRef.current.find(s => s.id === id)).filter((s): s is LotSpot => !!s)
    if (srcSpots.length === 0) return
    const anchorX = srcSpots.reduce((sum, s) => sum + s.x_position, 0) / srcSpots.length
    const anchorY = srcSpots.reduce((sum, s) => sum + s.y_position, 0) / srcSpots.length
    const items: ClipboardItem[] = srcSpots.map(s => ({
      dx: s.x_position - anchorX, dy: s.y_position - anchorY,
      width: s.width ?? 4, height: s.height ?? 7, rotation: s.rotation ?? 0, custom_color: s.custom_color,
    }))
    setClipboard(items)
    setPasteArmed(true)
  }

  const handlePasteAt = async (x: number, y: number) => {
    if (!clipboard || clipboard.length === 0) return
    const labels = generateNextLabels(spotsRef.current.map(s => s.label), clipboard.length)
    const created = await Promise.all(clipboard.map((it, i) => createLotSpotAction(companyId, {
      label: labels[i],
      x_position: Math.max(0.5, Math.min(99.5, x + it.dx)),
      y_position: Math.max(0.5, Math.min(99.5, y + it.dy)),
      location_id: locationId, width: it.width, height: it.height, rotation: it.rotation, custom_color: it.custom_color,
    })))
    const newSpots = created.filter((s): s is LotSpot => s !== null)
    if (newSpots.length > 0) {
      onSpotsChange([...spotsRef.current, ...newSpots])
      setMultiIds(new Set(newSpots.map(s => s.id))); setSelected(null)
    }
  }

  const handleDuplicateArray = async (ids: string[]) => {
    const srcSpots = ids.map(id => spotsRef.current.find(s => s.id === id)).filter((s): s is LotSpot => !!s)
    if (srcSpots.length === 0) return
    const count = Math.max(1, Math.min(20, parseInt(arrayCount, 10) || 1))
    const spacing = parseFloat(arraySpacing) || 0
    const rad = ((parseFloat(arrayAngle) || 0) * Math.PI) / 180
    const dirX = Math.cos(rad), dirY = Math.sin(rad)

    const totalNew = count * srcSpots.length
    const labels = generateNextLabels(spotsRef.current.map(s => s.label), totalNew)
    let li = 0
    const toCreate: { label: string; x_position: number; y_position: number; width: number; height: number; rotation: number; custom_color: string | null }[] = []
    for (let k = 1; k <= count; k++) {
      for (const sp of srcSpots) {
        toCreate.push({
          label: labels[li++],
          x_position: Math.max(0.5, Math.min(99.5, sp.x_position + dirX * spacing * k)),
          y_position: Math.max(0.5, Math.min(99.5, sp.y_position + dirY * spacing * k)),
          width: sp.width ?? 4, height: sp.height ?? 7, rotation: sp.rotation ?? 0, custom_color: sp.custom_color,
        })
      }
    }
    const created = await Promise.all(toCreate.map(d => createLotSpotAction(companyId, { ...d, location_id: locationId })))
    const newSpots = created.filter((s): s is LotSpot => s !== null)
    if (newSpots.length > 0) {
      onSpotsChange([...spotsRef.current, ...newSpots])
      setMultiIds(new Set(newSpots.map(s => s.id))); setSelected(null)
    }
  }

  const handleDeleteMulti = async () => {
    const ids = Array.from(multiIds)
    const deletable = ids.filter(id => {
      const sp = spotsRef.current.find(s => s.id === id)
      return sp && !sp.active_assignment
    })
    if (deletable.length === 0) return
    await Promise.all(deletable.map(id => deleteLotSpotAction(id)))
    onSpotsChange(spotsRef.current.filter(s => !deletable.includes(s.id)))
    setMultiIds(new Set())
  }

  const handleApplyTemplate = async (kind: 'single' | 'double' | 'angled' | 'perimeter') => {
    setTemplatesOpen(false)
    if (kind === 'perimeter') {
      const sh = await createLotShapeAction(companyId, {
        location_id: locationId ?? null, shape_type: 'border',
        label: 'Lot Border', color: '#FFFFFF', fill_opacity: 0.05, stroke_width: 2,
        config: { points: [{x:5,y:8},{x:95,y:8},{x:95,y:92},{x:5,y:92}], closed: true },
      })
      if (sh) { onShapesChange([...shapesRef.current, sh]); selectShape(sh) }
      return
    }
    const rows: { start: {x:number;y:number}; end: {x:number;y:number} }[] =
      kind === 'single'  ? [{ start:{x:15,y:50}, end:{x:85,y:50} }] :
      kind === 'double'  ? [{ start:{x:15,y:35}, end:{x:85,y:35} }, { start:{x:15,y:65}, end:{x:85,y:65} }] :
      /* angled */         [{ start:{x:15,y:20}, end:{x:60,y:80} }]
    const count = 6
    const allSpots: { label: string; x: number; y: number; rotation: number }[] = []
    const existingLabels = spotsRef.current.map(s => s.label)
    for (const row of rows) {
      const pts = placeRowPoints(row.start, row.end, count)
      const labels = generateNextLabels([...existingLabels, ...allSpots.map(s => s.label)], count)
      pts.forEach((p, i) => allSpots.push({ label: labels[i], x: p.x, y: p.y, rotation: p.rotation }))
    }
    const created = await Promise.all(allSpots.map(s => createLotSpotAction(companyId, {
      label: s.label, x_position: s.x, y_position: s.y, location_id: locationId, width: 4, height: 7, rotation: s.rotation,
    })))
    const newSpots = created.filter((s): s is LotSpot => s !== null)
    if (newSpots.length > 0) {
      onSpotsChange([...spotsRef.current, ...newSpots])
      setMultiIds(new Set(newSpots.map(s => s.id))); setSelected(null)
    }
  }

  const handleSaveShape = async () => {
    if (!selShape) return
    const base: Partial<LotShape> = { color: eSColor, fill_opacity: eSOp, stroke_width: eSStroke, label: eLabel || null }
    if (selShape.shape_type === 'border') base.fill_opacity = eSFill
    if (selShape.shape_type === 'marker') {
      const cfg = selShape.config as MarkerConfig
      const mColor = MARKER_COLOR[eMType]
      const updated = { ...base, color: mColor, config: { ...cfg, marker_type: eMType }, label: eLabel || null }
      await updateLotShapeAction(selShape.id, updated as any)
      onShapesChange(shapes.map(s => s.id === selShape.id ? { ...s, ...updated } as LotShape : s))
      return
    }
    if (selShape.shape_type === 'zone') {
      const cfg = { ...(selShape.config as ZoneConfig), rotation: eZoneRot }
      const updated = { ...base, config: cfg }
      await updateLotShapeAction(selShape.id, updated as any)
      onShapesChange(shapes.map(s => s.id === selShape.id ? { ...s, ...updated } as LotShape : s))
      return
    }
    await updateLotShapeAction(selShape.id, base as any)
    onShapesChange(shapes.map(s => s.id === selShape.id ? { ...s, ...base } as LotShape : s))
  }

  const handleDeleteShape = async () => {
    if (!selShape) return
    setSaving(true)
    await deleteLotShapeAction(selShape.id)
    onShapesChange(shapes.filter(s => s.id !== selShape.id))
    setSelected(null); setConfirmDel(false); setSaving(false)
  }

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setBgUploading(true)
    const url = await uploadLotBackground(companyId, file, locationId)
    onBgChange(url); setBgUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // zoom steps
  const ZOOMS = [0.5,0.75,1,1.25,1.5,2,2.5,3]
  const zoomIdx = ZOOMS.indexOf(zoom)
  const zoomIn  = () => setZoom(ZOOMS[Math.min(zoomIdx+1, ZOOMS.length-1)])
  const zoomOut = () => setZoom(ZOOMS[Math.max(zoomIdx-1, 0)])

  // ── spot drag ──────────────────────────────────────────────────────────────
  const startSpotDrag = (e: React.PointerEvent<HTMLDivElement>, spot: LotSpot) => {
    e.stopPropagation()

    // shift-click: toggle spot in/out of the multi-selection, no drag
    if (e.shiftKey) {
      setSelected(null)
      setMultiIds(prev => {
        const next = new Set(prev)
        if (next.has(spot.id)) next.delete(spot.id); else next.add(spot.id)
        return next
      })
      return
    }

    ;(e.currentTarget).setPointerCapture(e.pointerId)

    // dragging a spot that's part of an active multi-selection moves the whole group
    if (multiIds.has(spot.id) && multiIds.size > 1) {
      const pt = cpt(e.clientX, e.clientY)
      const start: Record<string,{x:number;y:number}> = {}
      for (const id of Array.from(multiIds)) {
        const sp = spotsRef.current.find(s => s.id === id)
        if (sp) start[id] = { x: sp.x_position, y: sp.y_position }
      }
      groupDragRef.current = { start, startPt: pt }
      return
    }

    setMultiIds(new Set())
    dragRef.current = { id: spot.id, lastX: spot.x_position, lastY: spot.y_position, moved: false }
    selectSpot(spot)
  }
  const moveSpotDrag = (e: React.PointerEvent<HTMLDivElement>, spotId: string) => {
    if (groupDragRef.current) {
      const pt = cpt(e.clientX, e.clientY)
      const dx = pt.x - groupDragRef.current.startPt.x
      const dy = pt.y - groupDragRef.current.startPt.y
      const start = groupDragRef.current.start
      onSpotsChange(spotsRef.current.map(s => start[s.id]
        ? { ...s, x_position: Math.max(0.5, Math.min(99.5, start[s.id].x + dx)), y_position: Math.max(0.5, Math.min(99.5, start[s.id].y + dy)) }
        : s))
      return
    }
    if (!dragRef.current || dragRef.current.id !== spotId) return
    const pt = cpt(e.clientX, e.clientY)
    dragRef.current.lastX = pt.x; dragRef.current.lastY = pt.y; dragRef.current.moved = true
    onSpotsChange(spotsRef.current.map(s => s.id === spotId ? { ...s, x_position: pt.x, y_position: pt.y } : s))
  }
  const endSpotDrag = (_e: React.PointerEvent<HTMLDivElement>, spotId: string) => {
    if (groupDragRef.current) {
      const ids = Object.keys(groupDragRef.current.start)
      for (const id of ids) {
        const sp = spotsRef.current.find(s => s.id === id)
        if (sp) updateLotSpotAction(id, { x_position: sp.x_position, y_position: sp.y_position })
      }
      groupDragRef.current = null
      return
    }
    if (!dragRef.current || dragRef.current.id !== spotId) return
    if (dragRef.current.moved) {
      updateLotSpotAction(spotId, { x_position: dragRef.current.lastX, y_position: dragRef.current.lastY })
    }
    dragRef.current = null
  }

  // ── rotation handle drag ───────────────────────────────────────────────────
  const handleRotStart = (e: React.PointerEvent<HTMLDivElement>, sp: LotSpot) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
    const rect = canvasRef.current!.getBoundingClientRect()
    const cx = rect.left + (sp.x_position / 100) * rect.width
    const cy = rect.top  + (sp.y_position / 100) * rect.height
    const startAngle = Math.atan2(e.clientX - cx, -(e.clientY - cy)) * (180 / Math.PI)
    rotRef.current = { spotId: sp.id, startAngle, startRot: sp.rotation ?? 0, currentRot: sp.rotation ?? 0 }
  }
  const handleRotMove = (e: React.PointerEvent<HTMLDivElement>, sp: LotSpot) => {
    if (!rotRef.current || rotRef.current.spotId !== sp.id) return
    const rect = canvasRef.current!.getBoundingClientRect()
    const cx = rect.left + (sp.x_position / 100) * rect.width
    const cy = rect.top  + (sp.y_position / 100) * rect.height
    const angle = Math.atan2(e.clientX - cx, -(e.clientY - cy)) * (180 / Math.PI)
    const delta = angle - rotRef.current.startAngle
    const newRot = Math.round(((rotRef.current.startRot + delta) % 360 + 360) % 360)
    rotRef.current.currentRot = newRot
    setERot(newRot)
    onSpotsChange(spotsRef.current.map(s => s.id === sp.id ? { ...s, rotation: newRot } : s))
  }
  const handleRotEnd = (_e: React.PointerEvent<HTMLDivElement>, sp: LotSpot) => {
    if (!rotRef.current || rotRef.current.spotId !== sp.id) return
    updateLotSpotAction(sp.id, { rotation: rotRef.current.currentRot })
    rotRef.current = null
  }

  // ── zone drag ──────────────────────────────────────────────────────────────
  const zoneDragRef = useRef<{id:string;startPt:{x:number;y:number};origX:number;origY:number}|null>(null)
  const startZoneDrag = (e: React.PointerEvent<SVGRectElement>, sh: LotShape) => {
    e.stopPropagation()
    ;(e.currentTarget).setPointerCapture(e.pointerId)
    const pt = cpt(e.clientX, e.clientY)
    const c = sh.config as ZoneConfig
    zoneDragRef.current = { id: sh.id, startPt: pt, origX: c.x, origY: c.y }
    selectShape(sh)
  }
  const moveZoneDrag = (e: React.PointerEvent<SVGRectElement>, sh: LotShape) => {
    if (!zoneDragRef.current || zoneDragRef.current.id !== sh.id) return
    const pt = cpt(e.clientX, e.clientY)
    const dx = pt.x - zoneDragRef.current.startPt.x
    const dy = pt.y - zoneDragRef.current.startPt.y
    const c = sh.config as ZoneConfig
    const newCfg = { ...c, x: Math.max(0, Math.min(100-c.width, zoneDragRef.current.origX + dx)), y: Math.max(0, Math.min(100-c.height, zoneDragRef.current.origY + dy)) }
    onShapesChange(shapesRef.current.map(s => s.id === sh.id ? { ...s, config: newCfg } : s))
  }
  const endZoneDrag = (_e: React.PointerEvent<SVGRectElement>, sh: LotShape) => {
    if (!zoneDragRef.current || zoneDragRef.current.id !== sh.id) return
    const c = (shapesRef.current.find(s => s.id === sh.id)?.config ?? sh.config) as ZoneConfig
    updateLotShapeAction(sh.id, { config: c })
    zoneDragRef.current = null
  }

  const canvasW = `${Math.max(1, zoom) * 100}%`

  return (
    <div style={{ position:'fixed', inset:0, zIndex:100, background:'rgba(13,27,42,0.97)', display:'flex', flexDirection:'column' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div style={{ height: isMobile ? 48 : 52, background:'#1B2D40', display:'flex', alignItems:'center', padding:'0 14px', gap:8, flexShrink:0, borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
        <span style={{ fontSize:14, fontWeight:700, color:'#FFF', marginRight:4 }}>Edit Lot Layout</span>

        <input ref={fileRef} type="file" accept="image/*" onChange={handleBgUpload} style={{ display:'none' }}/>

        {/* Desktop controls */}
        {!isMobile && (
          <>
            <TBtn label={bgUploading ? 'Uploading…' : 'BG Image'} icon={<Upload size={12}/>} onClick={() => fileRef.current?.click()} disabled={bgUploading}/>
            {bgUrl && <TBtn label="Remove BG" danger onClick={async () => { setBgUploading(true); await removeLotBackgroundAction(companyId, locationId); onBgChange(null); setBgUploading(false) }} disabled={bgUploading}/>}
            <Sep/>
            <TBtn label="Grid" icon={<Grid3X3 size={12}/>} active={showGrid} onClick={() => setShowGrid(g=>!g)}/>
            <TBtn label="Snap" active={snapGrid} onClick={() => setSnapGrid(s=>!s)}/>
            <Sep/>
            <div style={{ position:'relative' }}>
              <TBtn label="Templates" active={templatesOpen} onClick={() => setTemplatesOpen(o=>!o)}/>
              {templatesOpen && (
                <div style={{ position:'absolute', top:'110%', left:0, background:'#1B2D40', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, padding:4, display:'flex', flexDirection:'column', gap:2, zIndex:50, minWidth:140, boxShadow:'0 8px 20px rgba(0,0,0,0.4)' }}>
                  {([
                    ['single','Single Row'],['double','Double Row'],['angled','Angled Row'],['perimeter','Perimeter Border'],
                  ] as const).map(([kind,label]) => (
                    <button key={kind} onClick={() => handleApplyTemplate(kind)}
                      style={{ textAlign:'left', height:30, padding:'0 10px', borderRadius:6, border:'none', background:'transparent', color:'rgba(255,255,255,0.75)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}
                      onMouseEnter={e => (e.currentTarget.style.background='rgba(0,180,216,0.12)')}
                      onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                    >{label}</button>
                  ))}
                </div>
              )}
            </div>
            {multiIds.size > 0 && (
              <>
                <Sep/>
                <span style={{ fontSize:11, color:'#00B4D8' }}>{multiIds.size} selected</span>
                <TBtn label="Copy" icon={<Copy size={12}/>} onClick={handleCopySelection}/>
                <TBtn label="Clear" onClick={() => setMultiIds(new Set())}/>
              </>
            )}
            {pasteArmed && clipboard && (
              <>
                <Sep/>
                <span style={{ fontSize:11, color:'#F4A62A' }}>Click to paste {clipboard.length} spot{clipboard.length===1?'':'s'}</span>
                <TBtn label="✕ Cancel" danger onClick={() => { setPasteArmed(false); setClipboard(null) }}/>
              </>
            )}
            <Sep/>
            <button onClick={zoomOut} style={iconBtn}><Minus size={11} color="rgba(255,255,255,0.55)"/></button>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', minWidth:36, textAlign:'center' }}>{Math.round(zoom*100)}%</span>
            <button onClick={zoomIn}  style={iconBtn}><Plus  size={11} color="rgba(255,255,255,0.55)"/></button>
            {bgUrl && (
              <>
                <Sep/>
                <button onClick={() => onBgRotationChange((bgRotation - 90 + 360) % 360)} style={iconBtn} title="Rotate BG CCW">
                  <span style={{ fontSize:13, lineHeight:1, color:'rgba(255,255,255,0.55)' }}>↺</span>
                </button>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)', minWidth:26, textAlign:'center' }}>{bgRotation}°</span>
                <button onClick={() => onBgRotationChange((bgRotation + 90) % 360)} style={iconBtn} title="Rotate BG CW">
                  <span style={{ fontSize:13, lineHeight:1, color:'rgba(255,255,255,0.55)' }}>↻</span>
                </button>
              </>
            )}
            {tool === 'border' && borderPts.length > 0 && (
              <>
                <Sep/>
                <span style={{ fontSize:11, color:'#F4A62A' }}>{borderPts.length} pts</span>
                <TBtn label="✓ Finish" active onClick={finishBorder}/>
                <TBtn label="✕ Cancel" danger onClick={() => setBorderPts([])}/>
              </>
            )}
          </>
        )}

        <div style={{ flex:1 }}/>

        {/* Mobile: hint text for border drawing */}
        {isMobile && tool === 'border' && borderPts.length > 0 && (
          <span style={{ fontSize:11, color:'#F4A62A' }}>{borderPts.length} pts</span>
        )}

        {/* Mobile settings button */}
        {isMobile && (
          <button onClick={() => setMSettingsOpen(o => !o)} style={{ ...iconBtn, width:34, height:34, background: mSettingsOpen ? 'rgba(0,180,216,0.2)' : 'transparent', outline: mSettingsOpen ? '1.5px solid rgba(0,180,216,0.5)' : 'none' }}>
            <Settings2 size={15} color={mSettingsOpen ? '#00B4D8' : 'rgba(255,255,255,0.6)'}/>
          </button>
        )}

        {!isMobile && <span style={{ fontSize:11, color:'rgba(255,255,255,0.28)', maxWidth:220, textAlign:'right', lineHeight:1.35 }}>{HINT[tool]}</span>}
        <button onClick={onDone} style={{ height:34, padding:'0 16px', borderRadius:8, background:'#00B4D8', border:'none', color:'#FFF', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5, flexShrink:0 }}>
          <Check size={13}/> Done
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden', flexDirection:'column' }}>
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* ── Tool palette (desktop only) ────────────────────────────────────── */}
        {!isMobile && (
          <div style={{ width:58, background:'#131D2B', borderRight:'1px solid rgba(255,255,255,0.05)', display:'flex', flexDirection:'column', alignItems:'center', paddingTop:10, gap:2, flexShrink:0 }}>
            {TOOLS.map(t => (
              <button key={t.id} title={`${t.label} (${t.key})`}
                onClick={() => { setTool(t.id); if (t.id !== 'border') setBorderPts([]); if (t.id !== 'row') setRowPts([]) }}
                style={{ width:44, height:44, borderRadius:10, border:'none', background: tool===t.id ? 'rgba(0,180,216,0.18)' : 'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, outline: tool===t.id ? '1.5px solid rgba(0,180,216,0.5)' : 'none' }}
              >
                <span style={{ fontSize:16, lineHeight:1, color: tool===t.id ? '#00B4D8' : 'rgba(255,255,255,0.55)' }}>{t.icon}</span>
                <span style={{ fontSize:8, fontWeight:600, color: tool===t.id ? '#00B4D8' : 'rgba(255,255,255,0.35)', letterSpacing:'0.03em' }}>{t.label}</span>
              </button>
            ))}
            <div style={{ height:1, width:36, background:'rgba(255,255,255,0.07)', margin:'4px 0' }}/>
            <span style={{ fontSize:8, color:'rgba(255,255,255,0.2)', textAlign:'center', padding:'0 6px', lineHeight:1.5 }}>S P R Z B M</span>
          </div>
        )}

        {/* ── Canvas ────────────────────────────────────────────────────────── */}
        <div style={{ flex:1, overflow:'auto', display:'flex', alignItems:'flex-start', justifyContent:'center', padding: isMobile ? 8 : 24, background:'#0B1520' }}>
          <div style={{ width: canvasW, minWidth:'100%', flexShrink:0 }}>
            <div
              ref={canvasRef}
              onPointerDown={handleCanvasDown}
              onPointerMove={handleCanvasMove}
              onPointerUp={handleCanvasUp}
              style={{
                position:'relative', paddingBottom:'56.25%',
                background:'#1B2D40',
                borderRadius:10, overflow:'visible',
                border:'1px solid rgba(255,255,255,0.12)',
                cursor: tool==='spot'||tool==='zone'||tool==='row' ? 'crosshair' : tool==='border' ? 'cell' : tool==='marker' ? 'copy' : 'default',
                userSelect:'none',
              }}
            >
              {/* clip mask so spots aren't clipped but canvas visually clips */}
              <div style={{ position:'absolute', inset:0, borderRadius:10, overflow:'hidden', pointerEvents:'none', zIndex:0 }}>
                {bgUrl && (
                  <img
                    src={bgUrl}
                    alt=""
                    style={{
                      position:'absolute', inset:0, width:'100%', height:'100%',
                      objectFit:'cover', pointerEvents:'none',
                      transformOrigin:'center',
                      transform:`translate(${livePan.x}px, ${livePan.y}px) rotate(${bgRotation}deg)`,
                    }}
                  />
                )}
              </div>

              {/* SVG: grid + zones + borders + markers + drawing previews */}
              <svg
                onClick={handleSvgClick}
                onMouseMove={handleSvgMouseMove}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1, overflow:'visible', cursor:'inherit', borderRadius:10 }}
              >
                {/* Grid */}
                {showGrid && [5,10,15,20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95].map(v => (
                  <g key={v}>
                    <line x1={v} y1={0} x2={v} y2={100} stroke="rgba(255,255,255,0.07)" strokeWidth={0.25}/>
                    <line x1={0} y1={v} x2={100} y2={v} stroke="rgba(255,255,255,0.07)" strokeWidth={0.25}/>
                  </g>
                ))}

                {/* Zones */}
                {shapes.filter(s => s.shape_type === 'zone').map(sh => {
                  const c = sh.config as ZoneConfig
                  const isSel = selected?.id === sh.id
                  const cx = c.x + c.width / 2, cy = c.y + c.height / 2
                  const rot = c.rotation ?? 0
                  return (
                    <g key={sh.id} transform={rot ? `rotate(${rot}, ${cx}, ${cy})` : undefined}>
                      <rect
                        x={c.x} y={c.y} width={c.width} height={c.height}
                        fill={sh.color} fillOpacity={sh.fill_opacity}
                        stroke={sh.color} strokeWidth={isSel ? 0.55 : 0.3} rx={0.6}
                        style={{ cursor: tool==='select' ? 'move' : 'pointer' }}
                        onPointerDown={e => { if (tool==='select') startZoneDrag(e as any, sh); else { e.stopPropagation(); selectShape(sh) } }}
                        onPointerMove={e => moveZoneDrag(e as any, sh)}
                        onPointerUp={e => endZoneDrag(e as any, sh)}
                        data-shape-id={sh.id}
                      />
                      {sh.label && (
                        <text x={cx} y={c.y + 2.8} textAnchor="middle" fill={sh.color} fontSize={2.4} fontWeight="700" fontFamily="system-ui" pointerEvents="none">{sh.label}</text>
                      )}
                      {isSel && <rect x={c.x-0.5} y={c.y-0.5} width={c.width+1} height={c.height+1} fill="none" stroke="#00B4D8" strokeWidth={0.5} rx={0.8} strokeDasharray="2,1" pointerEvents="none"/>}
                    </g>
                  )
                })}

                {/* Borders */}
                {shapes.filter(s => s.shape_type === 'border').map(sh => {
                  const c = sh.config as BorderConfig
                  if (!c.points?.length) return null
                  const isSel = selected?.id === sh.id
                  const pts = c.points.map(p=>`${p.x},${p.y}`).join(' ')
                  const sw = sh.stroke_width * 0.15
                  return (
                    <g key={sh.id}>
                      {c.closed
                        ? <polygon points={pts} fill={sh.color} fillOpacity={sh.fill_opacity} stroke={sh.color} strokeWidth={sw} data-shape-id={sh.id} style={{ cursor:'pointer' }} onPointerDown={e => { e.stopPropagation(); selectShape(sh) }}/>
                        : <polyline points={pts} fill="none" stroke={sh.color} strokeWidth={sw} data-shape-id={sh.id} style={{ cursor:'pointer' }} onPointerDown={e => { e.stopPropagation(); selectShape(sh) }}/>
                      }
                      {isSel && c.points.map((p, i) => (
                        <circle key={i} cx={p.x} cy={p.y} r={1.3} fill="#00B4D8" stroke="#FFF" strokeWidth={0.3} style={{ cursor:'grab' }}
                          onPointerDown={e => {
                            e.stopPropagation()
                            ;(e.currentTarget as SVGCircleElement).setPointerCapture(e.pointerId)
                            const onM = (ev: PointerEvent) => {
                              const rect = canvasRef.current!.getBoundingClientRect()
                              const nx = ((ev.clientX-rect.left)/rect.width)*100, ny = ((ev.clientY-rect.top)/rect.height)*100
                              const newPts = [...c.points]; newPts[i] = { x: nx, y: ny }
                              onShapesChange(shapesRef.current.map(s => s.id===sh.id ? { ...s, config:{ ...c, points:newPts } } : s))
                            }
                            const onU = (ev: PointerEvent) => {
                              const rect = canvasRef.current!.getBoundingClientRect()
                              const nx = ((ev.clientX-rect.left)/rect.width)*100, ny = ((ev.clientY-rect.top)/rect.height)*100
                              const newPts = [...c.points]; newPts[i] = { x: nx, y: ny }
                              updateLotShapeAction(sh.id, { config:{ ...c, points:newPts } })
                              document.removeEventListener('pointermove', onM)
                              document.removeEventListener('pointerup', onU)
                            }
                            document.addEventListener('pointermove', onM)
                            document.addEventListener('pointerup', onU)
                          }}
                        />
                      ))}
                    </g>
                  )
                })}

                {/* Markers */}
                {shapes.filter(s => s.shape_type === 'marker').map(sh => {
                  const c = sh.config as MarkerConfig
                  const isSel = selected?.id === sh.id
                  const col = MARKER_COLOR[c.marker_type]
                  return (
                    <g key={sh.id} style={{ cursor:'pointer' }} onPointerDown={e => { e.stopPropagation(); selectShape(sh) }}>
                      <circle cx={c.x} cy={c.y} r={3.2} fill={col} opacity={0.9} data-shape-id={sh.id}/>
                      {isSel && <circle cx={c.x} cy={c.y} r={4.2} fill="none" stroke="#00B4D8" strokeWidth={0.5}/>}
                      <text x={c.x} y={c.y+0.8} textAnchor="middle" dominantBaseline="middle" fill="#FFF" fontSize={2.2} fontWeight="800" fontFamily="system-ui" pointerEvents="none">
                        {c.marker_type==='entrance' ? '→' : c.marker_type==='exit' ? '←' : '★'}
                      </text>
                      <text x={c.x} y={c.y+5.5} textAnchor="middle" fill={col} fontSize={1.9} fontWeight="700" fontFamily="system-ui" pointerEvents="none">
                        {sh.label ?? (c.marker_type==='entrance' ? 'IN' : c.marker_type==='exit' ? 'OUT' : '')}
                      </text>
                    </g>
                  )
                })}

                {/* Border draw preview */}
                {tool==='border' && borderPts.length > 0 && (
                  <>
                    <polyline
                      points={[...borderPts, ...(previewPt?[previewPt]:[])].map(p=>`${p.x},${p.y}`).join(' ')}
                      fill="none" stroke="#F4A62A" strokeWidth={0.5} strokeDasharray="2,1" pointerEvents="none"
                    />
                    {borderPts.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r={i===0?1.6:0.9} fill={i===0?'#F4A62A':'#FFF'} stroke="#F4A62A" strokeWidth={0.3} pointerEvents="none"/>)}
                  </>
                )}

                {/* Zone draw preview */}
                {zoneDraw && (
                  <rect
                    x={Math.min(zoneDraw.sx,zoneDraw.ex)} y={Math.min(zoneDraw.sy,zoneDraw.ey)}
                    width={Math.abs(zoneDraw.ex-zoneDraw.sx)} height={Math.abs(zoneDraw.ey-zoneDraw.sy)}
                    fill="#00B4D8" fillOpacity={0.12} stroke="#00B4D8" strokeWidth={0.5} strokeDasharray="2,1" rx={0.5} pointerEvents="none"
                  />
                )}

                {/* Marquee (box) select preview */}
                {marqueeDraw && (
                  <rect
                    x={Math.min(marqueeDraw.sx,marqueeDraw.ex)} y={Math.min(marqueeDraw.sy,marqueeDraw.ey)}
                    width={Math.abs(marqueeDraw.ex-marqueeDraw.sx)} height={Math.abs(marqueeDraw.ey-marqueeDraw.sy)}
                    fill="rgba(0,180,216,0.1)" stroke="#00B4D8" strokeWidth={0.3} strokeDasharray="1.5,1" pointerEvents="none"
                  />
                )}

                {/* Row tool preview */}
                {tool==='row' && rowPts.length===1 && previewPt && (
                  <line x1={rowPts[0].x} y1={rowPts[0].y} x2={previewPt.x} y2={previewPt.y} stroke="#F4A62A" strokeWidth={0.4} strokeDasharray="2,1" pointerEvents="none"/>
                )}
                {tool==='row' && rowPts.length===2 && (() => {
                  const count = Math.max(1, Math.min(40, parseInt(rowCount, 10) || 1))
                  const pts = placeRowPoints(rowPts[0], rowPts[1], count)
                  return (
                    <>
                      <line x1={rowPts[0].x} y1={rowPts[0].y} x2={rowPts[1].x} y2={rowPts[1].y} stroke="#F4A62A" strokeWidth={0.4} pointerEvents="none"/>
                      {pts.map((p,i) => <circle key={i} cx={p.x} cy={p.y} r={1.4} fill="rgba(244,166,42,0.5)" stroke="#F4A62A" strokeWidth={0.25} pointerEvents="none"/>)}
                    </>
                  )
                })()}

                {/* Snap cursor */}
                {snapGrid && previewPt && tool!=='select' && (
                  <circle cx={previewPt.x} cy={previewPt.y} r={0.9} fill="rgba(255,255,255,0.45)" pointerEvents="none"/>
                )}
              </svg>

              {/* Row tool: inline spot-count input, appears after 2nd click */}
              {tool==='row' && rowPts.length===2 && (
                <div
                  onPointerDown={e => e.stopPropagation()}
                  style={{
                    position:'absolute', left:`${rowPts[1].x}%`, top:`${rowPts[1].y}%`, transform:'translate(12px, -50%)',
                    background:'#0D1B2A', border:'1px solid #F4A62A', borderRadius:8, padding:'6px 8px',
                    display:'flex', alignItems:'center', gap:6, zIndex:40, boxShadow:'0 6px 16px rgba(0,0,0,0.5)', whiteSpace:'nowrap',
                  }}
                >
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>Spots</span>
                  <input
                    autoFocus
                    type="number" min={1} max={40} value={rowCount}
                    onChange={e => setRowCount(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter') handlePlaceRow(); if (e.key==='Escape') setRowPts([]) }}
                    style={{ width:44, height:26, background:'rgba(255,255,255,0.08)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:5, color:'#FFF', fontSize:12, textAlign:'center', outline:'none', fontFamily:'inherit' }}
                  />
                  <button onClick={handlePlaceRow} style={{ height:26, padding:'0 10px', borderRadius:5, border:'none', background:'#00B4D8', color:'#FFF', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Place</button>
                  <button onClick={() => setRowPts([])} style={{ height:26, padding:'0 8px', borderRadius:5, border:'none', background:'transparent', color:'rgba(255,255,255,0.4)', fontSize:11, cursor:'pointer', fontFamily:'inherit' }}>✕</button>
                </div>
              )}

              {/* Spots — small circular markers, always draggable, show rotation handle when selected */}
              {spots.map(sp => {
                const status = sp.active_assignment?.vehicle?.lifecycle_status
                const bg = sp.custom_color ?? (status ? (SPOT_COLOR[status] ?? EMPTY_COLOR) : EMPTY_COLOR)
                const isSel = selected?.id === sp.id
                const isMultiSel = multiIds.has(sp.id)
                const isHovered = hoveredSpotId === sp.id
                const showLabel = isSel || isMultiSel || isHovered
                const DOT = 18, HIT = 32
                return (
                  <div
                    key={sp.id}
                    data-spot={sp.id}
                    onPointerDown={e => startSpotDrag(e, sp)}
                    onPointerMove={e => moveSpotDrag(e, sp.id)}
                    onPointerUp={e => endSpotDrag(e, sp.id)}
                    onPointerEnter={() => setHoveredSpotId(sp.id)}
                    onPointerLeave={() => setHoveredSpotId(id => id === sp.id ? null : id)}
                    style={{
                      position:'absolute', left:`${sp.x_position}%`, top:`${sp.y_position}%`,
                      width:HIT, height:HIT,
                      transform:`translate(-50%,-50%) rotate(${sp.rotation??0}deg)`,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      cursor: 'grab',
                      zIndex: isSel || isMultiSel ? 10 : 3, userSelect:'none',
                      overflow: 'visible',
                    }}
                  >
                    {/* visual dot — purely decorative, the hit area is the parent */}
                    <div style={{
                      width:DOT, height:DOT, borderRadius:'50%',
                      background:bg,
                      border: isSel || isMultiSel ? '2px solid #00B4D8' : `1.5px solid ${bg===EMPTY_COLOR?'#CBD5E0':'rgba(0,0,0,0.25)'}`,
                      boxShadow: isMultiSel ? '0 0 0 3px rgba(0,180,216,0.25)' : isSel ? '0 0 0 3px rgba(0,180,216,0.4)' : '0 1px 4px rgba(0,0,0,0.35)',
                      transition:'box-shadow 100ms',
                      pointerEvents:'none',
                    }}/>

                    {/* Label — shown on hover/select rather than crammed inside the dot */}
                    {showLabel && (
                      <div style={{
                        position:'absolute', left:'50%', top:-2, transform:'translate(-50%, -100%)',
                        background:'#0D1B2A', border:'1px solid rgba(255,255,255,0.15)', borderRadius:4,
                        padding:'2px 6px', fontSize:10, fontWeight:800, color:'#FFF', lineHeight:1.2,
                        whiteSpace:'nowrap', pointerEvents:'none', zIndex:20,
                      }}>
                        {sp.label}
                      </div>
                    )}

                    {/* Rotation handle — appears above selected spot */}
                    {isSel && (
                      <>
                        <div style={{ position:'absolute', left:'50%', top:'-20px', width:1, height:20, background:'rgba(0,180,216,0.5)', transform:'translateX(-50%)', pointerEvents:'none' }}/>
                        <div
                          onPointerDown={e => handleRotStart(e, sp)}
                          onPointerMove={e => handleRotMove(e, sp)}
                          onPointerUp={e => handleRotEnd(e, sp)}
                          title={`Drag to rotate · ${sp.rotation ?? 0}°`}
                          style={{
                            position:'absolute', left:'50%', top:'-38px',
                            width:22, height:22,
                            transform:'translateX(-50%)',
                            background:'#0D1B2A',
                            border:'2px solid #00B4D8',
                            borderRadius:'50%',
                            cursor:'grab',
                            display:'flex', alignItems:'center', justifyContent:'center',
                            zIndex:30,
                            fontSize:13, color:'#00B4D8',
                            boxShadow:'0 2px 8px rgba(0,0,0,0.5)',
                            userSelect:'none',
                          }}
                        >↻</div>
                      </>
                    )}
                  </div>
                )
              })}

              {spots.length===0 && shapes.length===0 && (
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:2, pointerEvents:'none' }}>
                  <p style={{ fontSize:13, color:'rgba(255,255,255,0.25)', margin:0 }}>Select a tool from the left and start drawing</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Properties panel (desktop only) ───────────────────────────────── */}
        {!isMobile && (
          <div style={{ width:254, background:'#1B2D40', borderLeft:'1px solid rgba(255,255,255,0.06)', flexShrink:0, overflowY:'auto', display:'flex', flexDirection:'column' }}>
            {multiIds.size > 0 ? (
              <MultiSelectPanel
                count={multiIds.size}
                arrayCount={arrayCount} setArrayCount={setArrayCount}
                arraySpacing={arraySpacing} setArraySpacing={setArraySpacing}
                arrayAngle={arrayAngle} setArrayAngle={setArrayAngle}
                onCopy={handleCopySelection}
                onApplyArray={() => handleDuplicateArray(Array.from(multiIds))}
                onDelete={handleDeleteMulti}
                onClose={() => setMultiIds(new Set())}
              />
            ) : selSpot ? (
              <SpotPanel
                spot={selSpot}
                eLabel={eLabel} setELabel={setELabel}
                eNotes={eNotes} setENotes={setENotes}
                eW={eW} setEW={setEW}
                eH={eH} setEH={setEH}
                eRot={eRot} setERot={setERot}
                eColor={eColor} setEColor={setEColor}
                confirmDel={confirmDel} setConfirmDel={setConfirmDel}
                saving={saving}
                onSave={handleSaveSpot}
                onDelete={handleDeleteSpot}
                onDuplicate={handleDuplicateSpot}
                onClose={() => setSelected(null)}
                arrayCount={arrayCount} setArrayCount={setArrayCount}
                arraySpacing={arraySpacing} setArraySpacing={setArraySpacing}
                arrayAngle={arrayAngle} setArrayAngle={setArrayAngle}
                onApplyArray={() => handleDuplicateArray([selSpot.id])}
                onCopy={handleCopySelection}
              />
            ) : selShape ? (
              <ShapePanel
                shape={selShape}
                eLabel={eLabel} setELabel={setELabel}
                eSColor={eSColor} setESColor={setESColor}
                eSOp={eSOp} setESOp={setESOp}
                eSStroke={eSStroke} setESStroke={setESStroke}
                eSFill={eSFill} setESFill={setESFill}
                eMType={eMType} setEMType={setEMType}
                eZoneRot={eZoneRot} setEZoneRot={setEZoneRot}
                confirmDel={confirmDel} setConfirmDel={setConfirmDel}
                saving={saving}
                onSave={handleSaveShape}
                onDelete={handleDeleteShape}
                onClose={() => setSelected(null)}
              />
            ) : (
              <EmptyPanel tool={tool}/>
            )}
          </div>
        )}
        </div>{/* end flex row */}

        {/* ── Mobile bottom tool strip ───────────────────────────────────────── */}
        {isMobile && (
          <div style={{ background:'#131D2B', borderTop:'1px solid rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'space-around', padding:'6px 8px', flexShrink:0, gap:4 }}>
            {TOOLS.map(t => (
              <button key={t.id}
                onClick={() => { setTool(t.id); if (t.id !== 'border') setBorderPts([]); if (t.id !== 'row') setRowPts([]) }}
                style={{ flex:1, height:48, borderRadius:10, border:'none', background: tool===t.id ? 'rgba(0,180,216,0.18)' : 'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, outline: tool===t.id ? '1.5px solid rgba(0,180,216,0.5)' : 'none', padding:0 }}
              >
                <span style={{ fontSize:18, lineHeight:1, color: tool===t.id ? '#00B4D8' : 'rgba(255,255,255,0.55)' }}>{t.icon}</span>
                <span style={{ fontSize:9, fontWeight:600, color: tool===t.id ? '#00B4D8' : 'rgba(255,255,255,0.35)', letterSpacing:'0.03em' }}>{t.label}</span>
              </button>
            ))}
            {tool === 'border' && borderPts.length > 0 && (
              <>
                <div style={{ width:1, height:32, background:'rgba(255,255,255,0.1)' }}/>
                <button onClick={finishBorder} style={{ height:38, padding:'0 12px', borderRadius:8, background:'rgba(0,180,216,0.2)', border:'1.5px solid rgba(0,180,216,0.5)', color:'#00B4D8', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>✓ Finish</button>
                <button onClick={() => setBorderPts([])} style={{ height:38, padding:'0 12px', borderRadius:8, background:'transparent', border:'1px solid rgba(239,68,68,0.4)', color:'#EF4444', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>✕</button>
              </>
            )}
          </div>
        )}

        {/* ── Mobile settings bottom sheet ───────────────────────────────────── */}
        {isMobile && mSettingsOpen && (
          <div style={{ background:'#1B2D40', borderTop:'1px solid rgba(255,255,255,0.1)', padding:'12px 16px 16px', flexShrink:0, display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.6)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Settings</span>
              <button onClick={() => setMSettingsOpen(false)} style={{ background:'none', border:'none', cursor:'pointer', padding:4 }}><X size={14} color="rgba(255,255,255,0.4)"/></button>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleBgUpload} style={{ display:'none' }}/>
              <TBtn label={bgUploading ? 'Uploading…' : 'BG Image'} icon={<Upload size={12}/>} onClick={() => fileRef.current?.click()} disabled={bgUploading}/>
              {bgUrl && <TBtn label="Remove BG" danger onClick={async () => { setBgUploading(true); await removeLotBackgroundAction(companyId, locationId); onBgChange(null); setBgUploading(false) }} disabled={bgUploading}/>}
              <TBtn label="Grid" icon={<Grid3X3 size={12}/>} active={showGrid} onClick={() => setShowGrid(g=>!g)}/>
              <TBtn label="Snap" active={snapGrid} onClick={() => setSnapGrid(s=>!s)}/>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', minWidth:36 }}>Zoom</span>
              <button onClick={zoomOut} style={iconBtn}><Minus size={11} color="rgba(255,255,255,0.55)"/></button>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', minWidth:36, textAlign:'center' }}>{Math.round(zoom*100)}%</span>
              <button onClick={zoomIn} style={iconBtn}><Plus size={11} color="rgba(255,255,255,0.55)"/></button>
            </div>
            {bgUrl && (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', minWidth:36 }}>Rotate BG</span>
                <button onClick={() => onBgRotationChange((bgRotation - 90 + 360) % 360)} style={iconBtn}><span style={{ fontSize:14, color:'rgba(255,255,255,0.55)' }}>↺</span></button>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)', minWidth:28, textAlign:'center' }}>{bgRotation}°</span>
                <button onClick={() => onBgRotationChange((bgRotation + 90) % 360)} style={iconBtn}><span style={{ fontSize:14, color:'rgba(255,255,255,0.55)' }}>↻</span></button>
              </div>
            )}
          </div>
        )}

        {/* ── Mobile properties bottom sheet ────────────────────────────────── */}
        {isMobile && (multiIds.size > 0 || selSpot || selShape) && (
          <div style={{ background:'#1B2D40', borderTop:'1px solid rgba(255,255,255,0.1)', maxHeight:'55vh', overflowY:'auto', flexShrink:0 }}>
            {multiIds.size > 0 ? (
              <MultiSelectPanel
                count={multiIds.size}
                arrayCount={arrayCount} setArrayCount={setArrayCount}
                arraySpacing={arraySpacing} setArraySpacing={setArraySpacing}
                arrayAngle={arrayAngle} setArrayAngle={setArrayAngle}
                onCopy={handleCopySelection}
                onApplyArray={() => handleDuplicateArray(Array.from(multiIds))}
                onDelete={handleDeleteMulti}
                onClose={() => setMultiIds(new Set())}
              />
            ) : selSpot ? (
              <SpotPanel
                spot={selSpot}
                eLabel={eLabel} setELabel={setELabel}
                eNotes={eNotes} setENotes={setENotes}
                eW={eW} setEW={setEW}
                eH={eH} setEH={setEH}
                eRot={eRot} setERot={setERot}
                eColor={eColor} setEColor={setEColor}
                confirmDel={confirmDel} setConfirmDel={setConfirmDel}
                saving={saving}
                onSave={handleSaveSpot}
                onDelete={handleDeleteSpot}
                onDuplicate={handleDuplicateSpot}
                onClose={() => setSelected(null)}
                arrayCount={arrayCount} setArrayCount={setArrayCount}
                arraySpacing={arraySpacing} setArraySpacing={setArraySpacing}
                arrayAngle={arrayAngle} setArrayAngle={setArrayAngle}
                onApplyArray={() => handleDuplicateArray([selSpot.id])}
                onCopy={handleCopySelection}
              />
            ) : selShape ? (
              <ShapePanel
                shape={selShape}
                eLabel={eLabel} setELabel={setELabel}
                eSColor={eSColor} setESColor={setESColor}
                eSOp={eSOp} setESOp={setESOp}
                eSStroke={eSStroke} setESStroke={setESStroke}
                eSFill={eSFill} setESFill={setESFill}
                eMType={eMType} setEMType={setEMType}
                eZoneRot={eZoneRot} setEZoneRot={setEZoneRot}
                confirmDel={confirmDel} setConfirmDel={setConfirmDel}
                saving={saving}
                onSave={handleSaveShape}
                onDelete={handleDeleteShape}
                onClose={() => setSelected(null)}
              />
            ) : null}
          </div>
        )}
      </div>{/* end body column */}
    </div>
  )
}

// ── Spot properties panel ─────────────────────────────────────────────────────

function SpotPanel({ spot, eLabel, setELabel, eNotes, setENotes, eW, setEW, eH, setEH, eRot, setERot, eColor, setEColor, confirmDel, setConfirmDel, saving, onSave, onDelete, onDuplicate, onClose, arrayCount, setArrayCount, arraySpacing, setArraySpacing, arrayAngle, setArrayAngle, onApplyArray, onCopy }: any) {
  const SPOT_COLORS = ['#94A3B8','#00B4D8','#8B5CF6','#F97316','#F4A62A','#10B981','#EF4444','#1B2D40']
  return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#FFF' }}>Spot · {spot.label}</span>
        <button onClick={onClose} style={closeBtnStyle}><X size={13} color="rgba(255,255,255,0.4)"/></button>
      </div>

      <Field label="Label">
        <input value={eLabel} onChange={e=>setELabel(e.target.value)} onBlur={onSave} maxLength={8}
          style={inputStyle}/>
      </Field>

      <Field label="Notes">
        <textarea value={eNotes} onChange={e=>setENotes(e.target.value)} onBlur={onSave} rows={2} placeholder="Optional…"
          style={{ ...inputStyle, height:'auto', padding:'7px 10px', resize:'vertical' } as any}/>
      </Field>

      <Field label={`Width  ${eW.toFixed(1)}%`}>
        <input type="range" min={1.5} max={16} step={0.5} value={eW} onChange={e=>setEW(Number(e.target.value))} onMouseUp={onSave} onTouchEnd={onSave} style={{ width:'100%' }}/>
      </Field>

      <Field label={`Height  ${eH.toFixed(1)}%`}>
        <input type="range" min={2} max={18} step={0.5} value={eH} onChange={e=>setEH(Number(e.target.value))} onMouseUp={onSave} onTouchEnd={onSave} style={{ width:'100%' }}/>
      </Field>

      <Field label={`Rotation  ${eRot}°`}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <input type="range" min={0} max={359} step={1} value={eRot} onChange={e=>setERot(Number(e.target.value))} onMouseUp={onSave} onTouchEnd={onSave} style={{ flex:1 }}/>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)', minWidth:30, textAlign:'right' }}>{eRot}°</span>
        </div>
        <p style={{ fontSize:10, color:'rgba(255,255,255,0.3)', margin:'4px 0 0', lineHeight:1.4 }}>Or drag the ↻ handle on the spot</p>
      </Field>

      <Field label="Color override">
        <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
          <button onClick={() => { setEColor(null); onSave() }} style={{ ...swatchStyle, background:'linear-gradient(135deg,#aaa 50%,#fff 50%)', outline: eColor===null ? '2px solid #00B4D8' : 'none' }} title="Auto (status)"/>
          {SPOT_COLORS.map(c => (
            <button key={c} onClick={() => { setEColor(c); setTimeout(onSave, 0) }} style={{ ...swatchStyle, background:c, outline: eColor===c ? '2px solid #00B4D8' : 'none' }}/>
          ))}
          <input type="color" value={eColor ?? '#94A3B8'} onChange={e => setEColor(e.target.value)} onBlur={onSave}
            style={{ width:24, height:24, borderRadius:6, border:'none', cursor:'pointer', padding:0 }}/>
        </div>
      </Field>

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={onSave} style={{ flex:1, height:34, background:'#00B4D8', border:'none', borderRadius:8, color:'#FFF', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
          Save Changes
        </button>
        <button onClick={onDuplicate} title="Duplicate spot" style={{ width:34, height:34, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, color:'rgba(255,255,255,0.6)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Copy size={14}/>
        </button>
      </div>

      <button onClick={onCopy} style={{ height:30, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, color:'rgba(255,255,255,0.65)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
        Copy (then click canvas to paste)
      </button>

      <div style={{ height:1, background:'rgba(255,255,255,0.06)' }}/>

      <ArrayDuplicateForm
        arrayCount={arrayCount} setArrayCount={setArrayCount}
        arraySpacing={arraySpacing} setArraySpacing={setArraySpacing}
        arrayAngle={arrayAngle} setArrayAngle={setArrayAngle}
        onApply={onApplyArray}
      />

      <div style={{ height:1, background:'rgba(255,255,255,0.06)' }}/>

      {!confirmDel ? (
        <button onClick={() => spot.active_assignment ? setConfirmDel(true) : onDelete()}
          style={{ height:34, background:'transparent', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, color:'#EF4444', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <Trash2 size={12}/> Delete Spot
        </button>
      ) : (
        <div style={{ background:'rgba(239,68,68,0.08)', borderRadius:8, padding:10, border:'1px solid rgba(239,68,68,0.2)' }}>
          <div style={{ display:'flex', gap:6, marginBottom:8 }}>
            <AlertTriangle size={13} color="#EF4444" style={{ flexShrink:0, marginTop:1 }}/>
            <p style={{ fontSize:11, color:'#FCA5A5', margin:0 }}>Has active assignment. Deleting will unassign it.</p>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={() => setConfirmDel(false)} style={{ flex:1, height:30, background:'transparent', border:'1px solid rgba(255,255,255,0.15)', borderRadius:6, color:'rgba(255,255,255,0.6)', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            <button onClick={onDelete} disabled={saving} style={{ flex:1, height:30, background:'#EF4444', border:'none', borderRadius:6, color:'#FFF', fontSize:12, fontWeight:700, cursor:saving?'default':'pointer', fontFamily:'inherit' }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Multi-select panel ────────────────────────────────────────────────────────

function MultiSelectPanel({ count, arrayCount, setArrayCount, arraySpacing, setArraySpacing, arrayAngle, setArrayAngle, onCopy, onApplyArray, onDelete, onClose }: any) {
  return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#FFF' }}>{count} spots selected</span>
        <button onClick={onClose} style={closeBtnStyle}><X size={13} color="rgba(255,255,255,0.4)"/></button>
      </div>

      <p style={{ fontSize:11, color:'rgba(255,255,255,0.35)', margin:0, lineHeight:1.5 }}>
        Drag any selected spot to move the whole group · Delete removes all selected
      </p>

      <button onClick={onCopy} style={{ height:34, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, color:'#FFF', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
        <Copy size={13}/> Copy (then click canvas to paste)
      </button>

      <div style={{ height:1, background:'rgba(255,255,255,0.06)' }}/>

      <ArrayDuplicateForm
        arrayCount={arrayCount} setArrayCount={setArrayCount}
        arraySpacing={arraySpacing} setArraySpacing={setArraySpacing}
        arrayAngle={arrayAngle} setArrayAngle={setArrayAngle}
        onApply={onApplyArray}
      />

      <div style={{ height:1, background:'rgba(255,255,255,0.06)' }}/>

      <button onClick={onDelete}
        style={{ height:34, background:'transparent', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, color:'#EF4444', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
        <Trash2 size={12}/> Delete Selected
      </button>
    </div>
  )
}

function ArrayDuplicateForm({ arrayCount, setArrayCount, arraySpacing, setArraySpacing, arrayAngle, setArrayAngle, onApply }: any) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      <span style={{ fontSize:10, fontWeight:600, color:'rgba(255,255,255,0.38)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Duplicate as Array</span>
      <div style={{ display:'flex', gap:6 }}>
        <Field label="Repeat">
          <input type="number" min={1} max={20} value={arrayCount} onChange={(e:any)=>setArrayCount(e.target.value)} style={inputStyle}/>
        </Field>
        <Field label="Spacing %">
          <input type="number" min={0} step={0.5} value={arraySpacing} onChange={(e:any)=>setArraySpacing(e.target.value)} style={inputStyle}/>
        </Field>
      </div>
      <Field label="Direction °">
        <input type="number" min={0} max={359} value={arrayAngle} onChange={(e:any)=>setArrayAngle(e.target.value)} style={inputStyle}/>
      </Field>
      <button onClick={onApply} style={{ height:32, background:'rgba(0,180,216,0.15)', border:'1px solid rgba(0,180,216,0.5)', borderRadius:8, color:'#00B4D8', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
        Apply Array
      </button>
    </div>
  )
}

// ── Shape properties panel ────────────────────────────────────────────────────

function ShapePanel({ shape, eLabel, setELabel, eSColor, setESColor, eSOp, setESOp, eSStroke, setESStroke, eSFill, setESFill, eMType, setEMType, eZoneRot, setEZoneRot, confirmDel, setConfirmDel, saving, onSave, onDelete, onClose }: any) {
  const isZone   = shape.shape_type === 'zone'
  const isBorder = shape.shape_type === 'border'
  const isMarker = shape.shape_type === 'marker'
  const COLORS   = isZone ? ['#00B4D8','#10B981','#F4A62A','#EF4444','#F97316','#8B5CF6','#FFFFFF','#64748B']
                          : isBorder ? ['#FFFFFF','#F4A62A','#00B4D8','#10B981','#EF4444','#8B5CF6']
                          : []
  const typeLabel = isZone ? 'Zone' : isBorder ? 'Border' : 'Marker'
  return (
    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#FFF' }}>{typeLabel}</span>
        <button onClick={onClose} style={closeBtnStyle}><X size={13} color="rgba(255,255,255,0.4)"/></button>
      </div>

      <Field label="Label">
        <input value={eLabel} onChange={e=>setELabel(e.target.value)} onBlur={onSave} placeholder={isMarker ? 'Enter / Exit' : 'Optional label…'}
          style={inputStyle}/>
      </Field>

      {isMarker && (
        <Field label="Type">
          {(['entrance','exit','custom'] as const).map(t => (
            <button key={t} onClick={() => { setEMType(t); setTimeout(onSave,0) }}
              style={{ height:30, padding:'0 12px', borderRadius:6, border:'none', background: eMType===t ? MARKER_COLOR[t] : 'rgba(255,255,255,0.07)', color: eMType===t ? '#FFF' : 'rgba(255,255,255,0.5)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', marginRight:5, marginTop:4, textTransform:'capitalize' }}>
              {t}
            </button>
          ))}
        </Field>
      )}

      {!isMarker && (
        <>
          <Field label="Color">
            <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
              {COLORS.map(c => (
                <button key={c} onClick={() => { setESColor(c); setTimeout(onSave,0) }}
                  style={{ ...swatchStyle, background:c, outline: eSColor===c ? '2px solid #00B4D8' : 'none', border: c==='#FFFFFF'?'1px solid rgba(255,255,255,0.2)':'none' }}/>
              ))}
              <input type="color" value={eSColor} onChange={e => setESColor(e.target.value)} onBlur={onSave}
                style={{ width:24, height:24, borderRadius:6, border:'none', cursor:'pointer', padding:0 }}/>
            </div>
          </Field>

          {isZone && (
            <>
              <Field label={`Fill opacity  ${Math.round(eSOp*100)}%`}>
                <input type="range" min={0.03} max={0.6} step={0.01} value={eSOp} onChange={e=>setESOp(Number(e.target.value))} onMouseUp={onSave} onTouchEnd={onSave} style={{ width:'100%' }}/>
              </Field>
              <Field label={`Rotation  ${eZoneRot}°`}>
                <input type="range" min={0} max={359} step={1} value={eZoneRot} onChange={e=>setEZoneRot(Number(e.target.value))} onMouseUp={onSave} onTouchEnd={onSave} style={{ width:'100%' }}/>
              </Field>
            </>
          )}

          {isBorder && (
            <>
              <Field label={`Stroke width  ${eSStroke}px`}>
                <input type="range" min={1} max={8} step={0.5} value={eSStroke} onChange={e=>setESStroke(Number(e.target.value))} onMouseUp={onSave} onTouchEnd={onSave} style={{ width:'100%' }}/>
              </Field>
              <Field label={`Fill opacity  ${Math.round(eSFill*100)}%`}>
                <input type="range" min={0} max={0.4} step={0.01} value={eSFill} onChange={e=>setESFill(Number(e.target.value))} onMouseUp={onSave} onTouchEnd={onSave} style={{ width:'100%' }}/>
              </Field>
            </>
          )}
        </>
      )}

      <button onClick={onSave} style={{ height:34, background:'#00B4D8', border:'none', borderRadius:8, color:'#FFF', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
        Save Changes
      </button>

      <div style={{ height:1, background:'rgba(255,255,255,0.06)' }}/>

      {!confirmDel ? (
        <button onClick={() => setConfirmDel(true)}
          style={{ height:34, background:'transparent', border:'1px solid rgba(239,68,68,0.3)', borderRadius:8, color:'#EF4444', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <Trash2 size={12}/> Delete {typeLabel}
        </button>
      ) : (
        <div style={{ background:'rgba(239,68,68,0.08)', borderRadius:8, padding:10, border:'1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ fontSize:11, color:'#FCA5A5', margin:'0 0 8px' }}>Remove this {typeLabel.toLowerCase()}?</p>
          <div style={{ display:'flex', gap:6 }}>
            <button onClick={() => setConfirmDel(false)} style={{ flex:1, height:30, background:'transparent', border:'1px solid rgba(255,255,255,0.15)', borderRadius:6, color:'rgba(255,255,255,0.6)', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>Cancel</button>
            <button onClick={onDelete} disabled={saving} style={{ flex:1, height:30, background:'#EF4444', border:'none', borderRadius:6, color:'#FFF', fontSize:12, fontWeight:700, cursor:saving?'default':'pointer', fontFamily:'inherit' }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Empty panel ───────────────────────────────────────────────────────────────

function EmptyPanel({ tool }: { tool: Tool }) {
  const tips: Record<Tool, { title: string; items: string[] }> = {
    select: { title: 'Select Tool', items: ['Click any element to select it','Shift-click or shift-drag to multi-select','Drag a selected spot to move the whole group','Drag canvas to pan · Ctrl/Cmd+C to copy'] },
    spot:   { title: 'Spot Tool',   items: ['Click canvas to place a spot','Spots auto-label (A1, A2, B1…)','Drag existing spots to move them','↻ handle rotates the selected spot'] },
    row:    { title: 'Row Tool',    items: ['Click a start point, then an end point','Enter a spot count and hit Place','Spots auto-space and auto-label','Rotation matches the line angle'] },
    zone:   { title: 'Zone Tool',   items: ['Drag to draw a highlighted area','Great for marking rows or sections','Add a label to identify the zone','Choose color to code by type'] },
    border: { title: 'Border Tool', items: ['Click points to trace lot outline','Shows where your lot boundaries are','Click ✓ Finish when done','Drag points to adjust later'] },
    marker: { title: 'Marker Tool', items: ['Click to place entrance/exit icon','Select it to change type & label','Entrance = green, Exit = red','Custom = yellow'] },
  }
  const t = tips[tool]
  return (
    <div style={{ padding:18, display:'flex', flexDirection:'column', gap:10 }}>
      <p style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.5)', textTransform:'uppercase', letterSpacing:'0.08em', margin:0 }}>{t.title}</p>
      <ul style={{ margin:0, padding:'0 0 0 14px' }}>
        {t.items.map((item, i) => (
          <li key={i} style={{ fontSize:12, color:'rgba(255,255,255,0.35)', lineHeight:1.7 }}>{item}</li>
        ))}
      </ul>
      <div style={{ height:1, background:'rgba(255,255,255,0.05)', margin:'4px 0' }}/>
      <p style={{ fontSize:11, color:'rgba(255,255,255,0.2)', margin:0 }}>Shortcuts: S P R Z B M · Esc to deselect · Del to remove · Ctrl/Cmd+C to copy</p>
    </div>
  )
}

// ── Small reusable pieces ─────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize:10, fontWeight:600, color:'rgba(255,255,255,0.38)', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:5 }}>{label}</label>
      {children}
    </div>
  )
}

function TBtn({ label, icon, onClick, active, danger, disabled }: { label:string; icon?:React.ReactNode; onClick:()=>void; active?:boolean; danger?:boolean; disabled?:boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ height:30, padding:'0 10px', borderRadius:7, border: active ? '1px solid rgba(0,180,216,0.5)' : danger ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.12)', background: active ? 'rgba(0,180,216,0.15)' : danger ? 'transparent' : 'transparent', color: active ? '#00B4D8' : danger ? '#EF4444' : disabled ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)', fontSize:11, fontWeight:600, cursor: disabled ? 'default' : 'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5, flexShrink:0, whiteSpace:'nowrap' }}>
      {icon}{label}
    </button>
  )
}

function Sep() { return <div style={{ width:1, height:18, background:'rgba(255,255,255,0.1)', flexShrink:0 }}/> }

const iconBtn: React.CSSProperties = { width:26, height:26, borderRadius:6, border:'1px solid rgba(255,255,255,0.1)', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }
const inputStyle: React.CSSProperties = { width:'100%', height:34, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'0 10px', fontSize:13, color:'#FFF', outline:'none', fontFamily:'inherit', boxSizing:'border-box' }
const closeBtnStyle: React.CSSProperties = { background:'none', border:'none', cursor:'pointer', padding:4, borderRadius:6, display:'flex' }
const swatchStyle: React.CSSProperties = { width:24, height:24, borderRadius:6, border:'none', cursor:'pointer', outlineOffset:2 }

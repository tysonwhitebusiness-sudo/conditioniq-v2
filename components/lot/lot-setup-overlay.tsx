'use client'

import { useRef, useState, useEffect } from 'react'
import { Upload, Check, Trash2, AlertTriangle, X, Minus, Plus, Grid3X3, Settings2 } from 'lucide-react'
import { useMediaQuery } from '@/hooks/use-media-query'
import {
  createLotSpot, updateLotSpot, deleteLotSpot,
  uploadLotBackground, removeLotBackground, generateNextLabel,
  createLotShape, updateLotShape, deleteLotShape,
} from '@/lib/lot-actions'
import type { LotSpot, LotShape, ZoneConfig, BorderConfig, MarkerConfig } from '@/lib/lot-actions'
import { SPOT_COLOR, EMPTY_COLOR } from './lot-grid'

type Tool = 'select' | 'spot' | 'zone' | 'border' | 'marker'
type SelEl = { type: 'spot'; id: string } | { type: 'shape'; id: string } | null

const ZONE_COLORS  = ['#00B4D8','#10B981','#F4A62A','#EF4444','#F97316','#8B5CF6','#FFFFFF','#64748B']
const BORDER_COLORS = ['#FFFFFF','#F4A62A','#00B4D8','#10B981','#EF4444','#8B5CF6']
const MARKER_COLOR: Record<string, string> = { entrance: '#10B981', exit: '#EF4444', custom: '#F4A62A' }

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'select', label: 'Select',  key: 'S', icon: '↖' },
  { id: 'spot',   label: 'Spot',    key: 'P', icon: '▪' },
  { id: 'zone',   label: 'Zone',    key: 'Z', icon: '⬜' },
  { id: 'border', label: 'Border',  key: 'B', icon: '⬡' },
  { id: 'marker', label: 'Marker',  key: 'M', icon: '⬤' },
]

const HINT: Record<Tool, string> = {
  select: 'Click to select · Drag spot/zone to move · Drag canvas to pan',
  spot:   'Click canvas to place parking spot',
  zone:   'Drag to draw highlighted area',
  border: 'Click to add points · Finish ✓ to close',
  marker: 'Click to place entrance/exit marker',
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
  const dragRef = useRef<{id:string;lastX:number;lastY:number}|null>(null)
  const zoneRef = useRef<{sx:number;sy:number}|null>(null)

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

  const isMobile = useMediaQuery('(max-width: 767px)')

  useEffect(() => { setLivePan(bgPan) }, [bgPan.x, bgPan.y])

  const GRID = 5
  const selSpot  = selected?.type === 'spot'  ? spots.find(s => s.id === selected.id) ?? null : null
  const selShape = selected?.type === 'shape' ? shapes.find(s => s.id === selected.id) ?? null : null

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      const t = TOOLS.find(t => t.key === e.key.toUpperCase())
      if (t) { setTool(t.id); if (t.id !== 'border') setBorderPts([]) }
      if (e.key === 'Escape') { setSelected(null); setBorderPts([]); setZoneDraw(null) }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        if (selected.type === 'spot') { const sp = spotsRef.current.find(s => s.id === selected.id); if (sp && !sp.active_assignment) handleDeleteSpot() }
        if (selected.type === 'shape') handleDeleteShape()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected])

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
    const tgt = e.target as HTMLElement
    const sId  = tgt.dataset.spot
    const shId = tgt.dataset.shapeId
    const pt = cpt(e.clientX, e.clientY)

    if (tool === 'border') return // handled by SVG click

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

    if (tool === 'spot' && !sId && !shId) {
      handlePlaceSpot(pt.x, pt.y)
      return
    }

    // select tool — pan on background
    if (tool === 'select' && !sId && !shId) {
      panRef.current = { cxs: e.clientX, cys: e.clientY, pxs: livePan.x, pys: livePan.y }
      ;(e.currentTarget).setPointerCapture(e.pointerId)
      setSelected(null)
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
    const sp = await createLotSpot(companyId, { label, x_position: x, y_position: y, location_id: locationId })
    if (!sp) return
    const full = { ...sp, width: 4, height: 7, rotation: 0, custom_color: null }
    onSpotsChange([...spotsRef.current, full])
    selectSpot(full)
  }

  const handleCreateZone = async (x: number, y: number, w: number, h: number) => {
    const sh = await createLotShape(companyId, {
      location_id: locationId ?? null, shape_type: 'zone',
      label: null, color: '#00B4D8', fill_opacity: 0.18, stroke_width: 2,
      config: { x, y, width: w, height: h, rotation: 0 },
    })
    if (!sh) return
    onShapesChange([...shapesRef.current, sh]); selectShape(sh)
  }

  const handlePlaceMarker = async (x: number, y: number) => {
    const sh = await createLotShape(companyId, {
      location_id: locationId ?? null, shape_type: 'marker',
      label: 'Enter', color: '#10B981', fill_opacity: 1, stroke_width: 2,
      config: { x, y, marker_type: 'entrance' },
    })
    if (!sh) return
    onShapesChange([...shapesRef.current, sh]); selectShape(sh)
  }

  const finishBorder = async () => {
    if (borderPts.length < 2) { setBorderPts([]); return }
    const sh = await createLotShape(companyId, {
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
    await updateLotSpot(selSpot.id, u)
    onSpotsChange(spots.map(s => s.id === selSpot.id ? { ...s, ...u } : s))
  }

  const handleDeleteSpot = async () => {
    if (!selSpot) return
    setSaving(true)
    await deleteLotSpot(selSpot.id)
    onSpotsChange(spots.filter(s => s.id !== selSpot.id))
    setSelected(null); setConfirmDel(false); setSaving(false)
  }

  const handleSaveShape = async () => {
    if (!selShape) return
    const base: Partial<LotShape> = { color: eSColor, fill_opacity: eSOp, stroke_width: eSStroke, label: eLabel || null }
    if (selShape.shape_type === 'border') base.fill_opacity = eSFill
    if (selShape.shape_type === 'marker') {
      const cfg = selShape.config as MarkerConfig
      const mColor = MARKER_COLOR[eMType]
      const updated = { ...base, color: mColor, config: { ...cfg, marker_type: eMType }, label: eLabel || null }
      await updateLotShape(selShape.id, updated as any)
      onShapesChange(shapes.map(s => s.id === selShape.id ? { ...s, ...updated } as LotShape : s))
      return
    }
    if (selShape.shape_type === 'zone') {
      const cfg = { ...(selShape.config as ZoneConfig), rotation: eZoneRot }
      const updated = { ...base, config: cfg }
      await updateLotShape(selShape.id, updated as any)
      onShapesChange(shapes.map(s => s.id === selShape.id ? { ...s, ...updated } as LotShape : s))
      return
    }
    await updateLotShape(selShape.id, base as any)
    onShapesChange(shapes.map(s => s.id === selShape.id ? { ...s, ...base } as LotShape : s))
  }

  const handleDeleteShape = async () => {
    if (!selShape) return
    setSaving(true)
    await deleteLotShape(selShape.id)
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

  // spot drag (attached directly to spot divs)
  const startSpotDrag = (e: React.PointerEvent<HTMLDivElement>, spot: LotSpot) => {
    e.stopPropagation()
    ;(e.currentTarget).setPointerCapture(e.pointerId)
    dragRef.current = { id: spot.id, lastX: spot.x_position, lastY: spot.y_position }
    selectSpot(spot)
  }
  const moveSpotDrag = (e: React.PointerEvent<HTMLDivElement>, spotId: string) => {
    if (!dragRef.current || dragRef.current.id !== spotId) return
    const pt = cpt(e.clientX, e.clientY)
    dragRef.current.lastX = pt.x; dragRef.current.lastY = pt.y
    onSpotsChange(spotsRef.current.map(s => s.id === spotId ? { ...s, x_position: pt.x, y_position: pt.y } : s))
  }
  const endSpotDrag = (_e: React.PointerEvent<HTMLDivElement>, spotId: string) => {
    if (!dragRef.current || dragRef.current.id !== spotId) return
    updateLotSpot(spotId, { x_position: dragRef.current.lastX, y_position: dragRef.current.lastY })
    dragRef.current = null
  }

  // zone drag (move whole zone)
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
    updateLotShape(sh.id, { config: c })
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
            {bgUrl && <TBtn label="Remove BG" danger onClick={async () => { setBgUploading(true); await removeLotBackground(companyId, locationId); onBgChange(null); setBgUploading(false) }} disabled={bgUploading}/>}
            <Sep/>
            <TBtn label="Grid" icon={<Grid3X3 size={12}/>} active={showGrid} onClick={() => setShowGrid(g=>!g)}/>
            <TBtn label="Snap" active={snapGrid} onClick={() => setSnapGrid(s=>!s)}/>
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
                onClick={() => { setTool(t.id); if (t.id !== 'border') setBorderPts([]) }}
                style={{ width:44, height:44, borderRadius:10, border:'none', background: tool===t.id ? 'rgba(0,180,216,0.18)' : 'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:2, outline: tool===t.id ? '1.5px solid rgba(0,180,216,0.5)' : 'none' }}
              >
                <span style={{ fontSize:16, lineHeight:1, color: tool===t.id ? '#00B4D8' : 'rgba(255,255,255,0.55)' }}>{t.icon}</span>
                <span style={{ fontSize:8, fontWeight:600, color: tool===t.id ? '#00B4D8' : 'rgba(255,255,255,0.35)', letterSpacing:'0.03em' }}>{t.label}</span>
              </button>
            ))}
            <div style={{ height:1, width:36, background:'rgba(255,255,255,0.07)', margin:'4px 0' }}/>
            <span style={{ fontSize:8, color:'rgba(255,255,255,0.2)', textAlign:'center', padding:'0 6px', lineHeight:1.5 }}>S P Z B M</span>
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
                borderRadius:10, overflow:'hidden',
                border:'1px solid rgba(255,255,255,0.12)',
                cursor: tool==='spot'||tool==='zone' ? 'crosshair' : tool==='border' ? 'cell' : tool==='marker' ? 'copy' : 'default',
                userSelect:'none',
              }}
            >
              {/* Background image with pan + rotation */}
              {bgUrl && (
                <img
                  src={bgUrl}
                  alt=""
                  style={{
                    position:'absolute', inset:0, width:'100%', height:'100%',
                    objectFit:'cover', pointerEvents:'none', zIndex:0,
                    transformOrigin:'center',
                    transform:`translate(${livePan.x}px, ${livePan.y}px) rotate(${bgRotation}deg)`,
                  }}
                />
              )}

              {/* SVG: grid + zones + borders + markers + drawing previews */}
              <svg
                onClick={handleSvgClick}
                onMouseMove={handleSvgMouseMove}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                style={{ position:'absolute', inset:0, width:'100%', height:'100%', zIndex:1, overflow:'visible', cursor:'inherit' }}
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
                      {/* point handles when selected */}
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
                              updateLotShape(sh.id, { config:{ ...c, points:newPts } })
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

                {/* Snap cursor */}
                {snapGrid && previewPt && tool!=='select' && (
                  <circle cx={previewPt.x} cy={previewPt.y} r={0.9} fill="rgba(255,255,255,0.45)" pointerEvents="none"/>
                )}
              </svg>

              {/* Spots */}
              {spots.map(sp => {
                const status = sp.active_assignment?.vehicle?.lifecycle_status
                const bg = sp.custom_color ?? (status ? (SPOT_COLOR[status] ?? EMPTY_COLOR) : EMPTY_COLOR)
                const isSel = selected?.id === sp.id
                const w = sp.width ?? 4, h = sp.height ?? 7
                const isDraggable = tool === 'select'
                return (
                  <div
                    key={sp.id}
                    data-spot={sp.id}
                    onPointerDown={e => { if (isDraggable) startSpotDrag(e, sp); else if (tool==='spot') { e.stopPropagation(); selectSpot(sp) } }}
                    onPointerMove={e => moveSpotDrag(e, sp.id)}
                    onPointerUp={e => endSpotDrag(e, sp.id)}
                    style={{
                      position:'absolute', left:`${sp.x_position}%`, top:`${sp.y_position}%`,
                      width:`${w}%`, height:`${h*0.5625}%`,
                      transform:`translate(-50%,-50%) rotate(${sp.rotation??0}deg)`,
                      background:bg, borderRadius:'10%',
                      border: isSel ? '2px solid #00B4D8' : `1.5px solid ${bg===EMPTY_COLOR?'#CBD5E0':'rgba(0,0,0,0.1)'}`,
                      boxShadow: isSel ? '0 0 0 3px rgba(0,180,216,0.4)' : '0 1px 5px rgba(0,0,0,0.3)',
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      cursor: isDraggable ? 'grab' : 'default',
                      zIndex: isSel ? 10 : 3, userSelect:'none',
                      transition:'box-shadow 100ms',
                    }}
                  >
                    <span style={{ fontSize:Math.max(7, w*2.2), fontWeight:800, color: bg===EMPTY_COLOR?'#94A3B8':'#FFF', lineHeight:1, textAlign:'center', pointerEvents:'none' }}>
                      {sp.label}
                    </span>
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
            {selSpot ? (
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
                onClose={() => setSelected(null)}
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
                onClick={() => { setTool(t.id); if (t.id !== 'border') setBorderPts([]) }}
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
              {bgUrl && <TBtn label="Remove BG" danger onClick={async () => { setBgUploading(true); await removeLotBackground(companyId, locationId); onBgChange(null); setBgUploading(false) }} disabled={bgUploading}/>}
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
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', minWidth:36 }}>Rotate</span>
                <button onClick={() => onBgRotationChange((bgRotation - 90 + 360) % 360)} style={iconBtn}><span style={{ fontSize:14, color:'rgba(255,255,255,0.55)' }}>↺</span></button>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)', minWidth:28, textAlign:'center' }}>{bgRotation}°</span>
                <button onClick={() => onBgRotationChange((bgRotation + 90) % 360)} style={iconBtn}><span style={{ fontSize:14, color:'rgba(255,255,255,0.55)' }}>↻</span></button>
              </div>
            )}
          </div>
        )}

        {/* ── Mobile properties bottom sheet ────────────────────────────────── */}
        {isMobile && (selSpot || selShape) && (
          <div style={{ background:'#1B2D40', borderTop:'1px solid rgba(255,255,255,0.1)', maxHeight:'55vh', overflowY:'auto', flexShrink:0 }}>
            {selSpot ? (
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
                onClose={() => setSelected(null)}
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

function SpotPanel({ spot, eLabel, setELabel, eNotes, setENotes, eW, setEW, eH, setEH, eRot, setERot, eColor, setEColor, confirmDel, setConfirmDel, saving, onSave, onDelete, onClose }: any) {
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
        <input type="range" min={1.5} max={16} step={0.5} value={eW} onChange={e=>setEW(Number(e.target.value))} onMouseUp={onSave} style={{ width:'100%' }}/>
      </Field>

      <Field label={`Height  ${eH.toFixed(1)}%`}>
        <input type="range" min={2} max={18} step={0.5} value={eH} onChange={e=>setEH(Number(e.target.value))} onMouseUp={onSave} style={{ width:'100%' }}/>
      </Field>

      <Field label={`Rotation  ${eRot}°`}>
        <input type="range" min={0} max={359} step={1} value={eRot} onChange={e=>setERot(Number(e.target.value))} onMouseUp={onSave} style={{ width:'100%' }}/>
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

      <button onClick={onSave} style={{ height:34, background:'#00B4D8', border:'none', borderRadius:8, color:'#FFF', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>
        Save Changes
      </button>

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
                <input type="range" min={0.03} max={0.6} step={0.01} value={eSOp} onChange={e=>setESOp(Number(e.target.value))} onMouseUp={onSave} style={{ width:'100%' }}/>
              </Field>
              <Field label={`Rotation  ${eZoneRot}°`}>
                <input type="range" min={0} max={359} step={1} value={eZoneRot} onChange={e=>setEZoneRot(Number(e.target.value))} onMouseUp={onSave} style={{ width:'100%' }}/>
              </Field>
            </>
          )}

          {isBorder && (
            <>
              <Field label={`Stroke width  ${eSStroke}px`}>
                <input type="range" min={1} max={8} step={0.5} value={eSStroke} onChange={e=>setESStroke(Number(e.target.value))} onMouseUp={onSave} style={{ width:'100%' }}/>
              </Field>
              <Field label={`Fill opacity  ${Math.round(eSFill*100)}%`}>
                <input type="range" min={0} max={0.4} step={0.01} value={eSFill} onChange={e=>setESFill(Number(e.target.value))} onMouseUp={onSave} style={{ width:'100%' }}/>
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
    select: { title: 'Select Tool', items: ['Click any element to select it','Drag spots to reposition','Drag zones to move them','Drag border points to reshape'] },
    spot:   { title: 'Spot Tool',   items: ['Click canvas to place a spot','Spots auto-label (A1, A2, B1…)','Click a spot to switch to Select','Drag to adjust position'] },
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
      <p style={{ fontSize:11, color:'rgba(255,255,255,0.2)', margin:0 }}>Shortcuts: S P Z B M · Esc to deselect · Del to remove</p>
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

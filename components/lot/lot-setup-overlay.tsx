'use client'

import { useRef, useState } from 'react'
import { X, Upload, Trash2, AlertTriangle, Check } from 'lucide-react'
import LotGrid from './lot-grid'
import {
  createLotSpot, updateLotSpot, deleteLotSpot,
  uploadLotBackground, removeLotBackground, generateNextLabel,
} from '@/lib/lot-actions'
import type { LotSpot } from '@/lib/lot-actions'

interface Props {
  spots: LotSpot[]
  companyId: string
  locationId?: string | null
  bgUrl: string | null
  bgPan: { x: number; y: number }
  onSpotsChange: (spots: LotSpot[]) => void
  onBgChange: (url: string | null) => void
  onBgPanChange: (pan: { x: number; y: number }) => void
  onDone: () => void
}

export default function LotSetupOverlay({
  spots, companyId, locationId, bgUrl, bgPan,
  onSpotsChange, onBgChange, onBgPanChange, onDone,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bgUploading, setBgUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedSpot = spots.find(s => s.id === selectedId) ?? null

  const handleCanvasClick = async (xPct: number, yPct: number) => {
    const label = generateNextLabel(spots.map(s => s.label))
    const newSpot = await createLotSpot(companyId, { label, x_position: xPct, y_position: yPct, location_id: locationId })
    if (!newSpot) return
    onSpotsChange([...spots, newSpot])
    selectSpot(newSpot)
  }

  const handleSpotDragMove = (spotId: string, xPct: number, yPct: number) => {
    onSpotsChange(spots.map(s => s.id === spotId ? { ...s, x_position: xPct, y_position: yPct } : s))
  }

  const handleSpotDragEnd = async (spotId: string, xPct: number, yPct: number) => {
    await updateLotSpot(spotId, { x_position: xPct, y_position: yPct })
  }

  const selectSpot = (spot: LotSpot) => {
    setSelectedId(spot.id)
    setEditLabel(spot.label)
    setEditNotes(spot.notes ?? '')
    setConfirmDelete(false)
  }

  const handleSpotClick = (spot: LotSpot) => {
    if (selectedId === spot.id) {
      setSelectedId(null)
    } else {
      selectSpot(spot)
    }
  }

  const handleSaveEdit = async () => {
    if (!selectedId) return
    setSaving(true)
    await updateLotSpot(selectedId, { label: editLabel.trim() || 'A1', notes: editNotes.trim() || null })
    onSpotsChange(spots.map(s => s.id === selectedId ? { ...s, label: editLabel.trim() || 'A1', notes: editNotes.trim() || null } : s))
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!selectedId) return
    setSaving(true)
    await deleteLotSpot(selectedId)
    onSpotsChange(spots.filter(s => s.id !== selectedId))
    setSelectedId(null)
    setConfirmDelete(false)
    setSaving(false)
  }

  const handleBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBgUploading(true)
    const url = await uploadLotBackground(companyId, file, locationId)
    onBgChange(url)
    setBgUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveBg = async () => {
    setBgUploading(true)
    await removeLotBackground(companyId, locationId)
    onBgChange(null)
    setBgUploading(false)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(13,27,42,0.92)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Top bar */}
      <div style={{
        height: 56, background: '#1B2D40',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 12, flexShrink: 0,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#FFF', flex: 1 }}>Edit Lot Layout</span>

        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleBgUpload} style={{ display: 'none' }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={bgUploading}
          style={{
            height: 34, padding: '0 14px', borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
            color: bgUploading ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
            fontSize: 13, fontWeight: 600, cursor: bgUploading ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
          }}
        >
          <Upload size={14} />
          {bgUploading ? 'Uploading...' : 'Background Image'}
        </button>

        {bgUrl && (
          <button
            onClick={handleRemoveBg}
            disabled={bgUploading}
            style={{
              height: 34, padding: '0 14px', borderRadius: 8,
              border: '1px solid rgba(239,68,68,0.3)', background: 'transparent',
              color: '#EF4444', fontSize: 13, fontWeight: 600,
              cursor: bgUploading ? 'default' : 'pointer', fontFamily: 'inherit',
            }}
          >
            Remove BG
          </button>
        )}

        <button
          onClick={onDone}
          style={{
            height: 34, padding: '0 20px', borderRadius: 8,
            background: '#00B4D8', border: 'none', color: '#FFF',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <Check size={14} /> Done
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Canvas area */}
        <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: '0 0 12px', textAlign: 'center' }}>
            Click canvas to add spot · Drag canvas to pan image · Drag spot to move · Click spot to edit
          </p>
          <LotGrid
            spots={spots}
            mode="setup"
            bgUrl={bgUrl}
            bgPan={bgPan}
            selectedSpotId={selectedId}
            onSpotClick={handleSpotClick}
            onCanvasClick={handleCanvasClick}
            onBgPanChange={onBgPanChange}
            onSpotDragMove={handleSpotDragMove}
            onSpotDragEnd={handleSpotDragEnd}
          />
        </div>

        {/* Side panel — spot editor */}
        {selectedSpot && (
          <div style={{
            width: 280, background: '#1B2D40', borderLeft: '1px solid rgba(255,255,255,0.06)',
            padding: 20, display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#FFF' }}>Spot Editor</span>
              <button
                onClick={() => setSelectedId(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6 }}
              >
                <X size={14} color="rgba(255,255,255,0.4)" />
              </button>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Label</label>
              <input
                value={editLabel}
                onChange={e => setEditLabel(e.target.value)}
                onBlur={handleSaveEdit}
                maxLength={6}
                style={{
                  width: '100%', height: 36, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '0 10px', fontSize: 14, fontWeight: 700, color: '#FFF', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Notes</label>
              <textarea
                value={editNotes}
                onChange={e => setEditNotes(e.target.value)}
                onBlur={handleSaveEdit}
                rows={3}
                placeholder="Optional notes..."
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '8px 10px', fontSize: 13, color: 'rgba(255,255,255,0.8)', outline: 'none',
                  fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              onClick={handleSaveEdit}
              disabled={saving}
              style={{
                height: 36, background: '#00B4D8', border: 'none', borderRadius: 8,
                color: '#FFF', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                fontFamily: 'inherit', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

            {!confirmDelete ? (
              <button
                onClick={() => {
                  if (selectedSpot.active_assignment) setConfirmDelete(true)
                  else handleDelete()
                }}
                style={{
                  height: 36, background: 'transparent', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 8, color: '#EF4444', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Trash2 size={13} /> Delete Spot
              </button>
            ) : (
              <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: 12, border: '1px solid rgba(239,68,68,0.2)' }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: 12, color: '#FCA5A5', margin: 0 }}>This spot has an active vehicle assignment. Deleting will unassign it.</p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, height: 32, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={handleDelete} disabled={saving} style={{ flex: 1, height: 32, background: '#EF4444', border: 'none', borderRadius: 6, color: '#FFF', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>Delete</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

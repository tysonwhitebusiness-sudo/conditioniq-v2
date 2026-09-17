'use client'

import { useState, useEffect, useRef } from 'react'
import { Camera } from 'lucide-react'
import {
  getDamageAreaCodes, getDamageTypeCodes, getDamageSeverityCodes,
  composeDamageLabel,
} from '@/lib/damage-actions'
import type {
  DamageAreaCode, DamageTypeCode, DamageSeverityCode,
  VehicleTemplate, DamageMarkerAssetType, DamageMarkerView,
} from '@/lib/damage-actions'
import type { DamageStore, DamageMarkerWithPhoto } from '@/lib/damage-store'
import DamagePickerSheet, { type PickerStep } from './damage-picker-sheet'
import DamageMarkerDetail from './damage-marker-detail'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DamageTaggerProps {
  // Where pins are read and saved: the vehicle (intake/outtake) or one inspection.
  store: DamageStore
  vehicleTemplate: VehicleTemplate
  // False once an inspection is submitted: pins show but cannot change.
  editable?: boolean
  onMarkersChange?: (markers: DamageMarkerWithPhoto[]) => void
  // Phase 10: when set, renders this image as the tap surface instead of the
  // placeholder, and scopes marker load/save to this specific view of this
  // specific model asset. All optional so the pre-Phase-10 placeholder mode
  // (no real diagram resolved yet) keeps working unchanged.
  backgroundImageUrl?: string
  view?: DamageMarkerView
  modelAssetId?: string
  assetType?: DamageMarkerAssetType
}

type PendingPin = { x: number; y: number } | null

const TEMPLATE_LABEL: Record<VehicleTemplate, string> = {
  sedan: 'Sedan', suv: 'SUV', truck: 'Truck', van: 'Van',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DamageTagger({
  store, vehicleTemplate, editable = true, onMarkersChange,
  backgroundImageUrl, view, modelAssetId, assetType,
}: DamageTaggerProps) {
  const surfaceRef = useRef<HTMLDivElement>(null)

  const [areaCodes, setAreaCodes] = useState<DamageAreaCode[]>([])
  const [typeCodes, setTypeCodes] = useState<DamageTypeCode[]>([])
  const [severityCodes, setSeverityCodes] = useState<DamageSeverityCode[]>([])
  const [markers, setMarkers] = useState<DamageMarkerWithPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [pendingPin, setPendingPin] = useState<PendingPin>(null)
  const [pickerStep, setPickerStep] = useState<PickerStep>(null)
  const [pickedArea, setPickedArea] = useState<DamageAreaCode | null>(null)
  const [pickedType, setPickedType] = useState<DamageTypeCode | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      getDamageAreaCodes(),
      getDamageTypeCodes(),
      getDamageSeverityCodes(),
      store.listMarkers(modelAssetId ? { modelAssetId, view } : undefined),
    ]).then(([areas, types, severities, existingMarkers]) => {
      if (cancelled) return
      setAreaCodes(areas)
      setTypeCodes(types)
      setSeverityCodes(severities)
      setMarkers(existingMarkers)
      setLoading(false)
    }).catch(e => {
      if (cancelled) return
      setSaveError(e?.message ?? 'Could not load damage pins')
      setLoading(false)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.key, modelAssetId, view])

  useEffect(() => { onMarkersChange?.(markers) }, [markers, onMarkersChange])

  // ── Tap-to-percentage coordinate capture — mirrors lot-setup-overlay.tsx's
  // cpt() helper exactly, so this stays consistent with the Lot Map's own
  // tap-to-place system rather than reinventing the math. ──────────────────────
  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editable || saving || pickerStep) return
    const target = e.target as HTMLElement
    if (target.closest('[data-pin]')) return
    const rect = surfaceRef.current!.getBoundingClientRect()
    const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100))
    const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100))
    setSelectedMarkerId(null)
    setPendingPin({ x, y })
    setPickedArea(null)
    setPickedType(null)
    setPickerStep('area')
  }

  const cancelPicker = () => {
    setPendingPin(null)
    setPickerStep(null)
    setPickedArea(null)
    setPickedType(null)
  }

  const backPicker = () => {
    if (pickerStep === 'type') { setPickerStep('area'); setPickedType(null) }
    else if (pickerStep === 'severity') { setPickerStep('type') }
  }

  const pickArea = (area: DamageAreaCode) => { setPickedArea(area); setPickerStep('type') }
  const pickType = (type: DamageTypeCode) => { setPickedType(type); setPickerStep('severity') }

  const pickSeverity = async (severity: DamageSeverityCode) => {
    if (!pendingPin || !pickedArea || !pickedType) return
    setSaving(true)
    setSaveError(null)
    try {
      const created = await store.createMarker({
        areaCodeId: pickedArea.id,
        typeCodeId: pickedType.id,
        severityCodeId: severity.id,
        xPosition: pendingPin.x,
        yPosition: pendingPin.y,
        modelAssetId, assetType, view,
      })
      if (created) {
        setMarkers(prev => [created, ...prev])
        // Open the new pin so its optional photo is one tap away.
        setSelectedMarkerId(created.id)
      } else {
        setSaveError('The damage pin was not saved. Try again.')
      }
    } catch (e: any) {
      setSaveError(e?.message ?? 'The damage pin was not saved. Try again.')
    } finally {
      setSaving(false)
      cancelPicker()
    }
  }

  const removeMarker = async (id: string) => {
    const previous = markers
    setSelectedMarkerId(null)
    setMarkers(prev => prev.filter(m => m.id !== id))
    try {
      await store.deleteMarker(id)
    } catch (e: any) {
      setMarkers(previous)
      setSaveError(e?.message ?? 'Could not remove the damage pin')
    }
  }

  const updatePhoto = (id: string, photoUrl: string | null, photoPath: string | null) =>
    setMarkers(prev => prev.map(m => (m.id === id ? { ...m, photo_url: photoUrl, photo_path: photoPath } : m)))

  const selectedMarker = markers.find(m => m.id === selectedMarkerId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── Diagram surface — real image when backgroundImageUrl is resolved
          (Phase 10), placeholder otherwise. Structured like lot-setup-overlay.tsx:
          a positioned background + absolutely positioned overlay pins, sized to
          the image's own natural box (no letterboxing) so tap-percentage math
          maps 1:1 onto the image. ── */}
      <div
        ref={surfaceRef}
        onClick={handleSurfaceClick}
        style={{
          position: 'relative',
          width: '100%',
          ...(backgroundImageUrl ? {} : { aspectRatio: '4 / 3', background: '#F5F8FA', border: '2px dashed #CBD5E1' }),
          borderRadius: 12,
          cursor: !editable || pickerStep ? 'default' : 'crosshair',
          overflow: 'hidden',
          userSelect: 'none',
        }}
      >
        {backgroundImageUrl ? (
          <img
            src={backgroundImageUrl}
            alt={`${TEMPLATE_LABEL[vehicleTemplate]} — ${view ?? ''} view`}
            draggable={false}
            style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none', userSelect: 'none' }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 4, color: '#94A3B8', pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {TEMPLATE_LABEL[vehicleTemplate]}
            </span>
            <span style={{ fontSize: 12 }}>Diagram artwork coming soon — tap anywhere to tag damage</span>
          </div>
        )}

        {markers.map(m => (
          <button
            key={m.id}
            data-pin
            onClick={(e) => { e.stopPropagation(); setSelectedMarkerId(id => id === m.id ? null : m.id) }}
            title={composeDamageLabel(m.area, m.type, m.severity)}
            style={{
              position: 'absolute',
              left: `${m.x_position}%`,
              top: `${m.y_position}%`,
              transform: 'translate(-50%, -50%)',
              width: 18, height: 18, borderRadius: '50%',
              background: selectedMarkerId === m.id ? '#0097B2' : '#00B4D8',
              border: '2px solid #FFFFFF',
              boxShadow: '0 1px 4px rgba(13,27,42,0.3)',
              cursor: 'pointer', padding: 0,
            }}
          />
        ))}

        {pendingPin && (
          <div style={{
            position: 'absolute',
            left: `${pendingPin.x}%`, top: `${pendingPin.y}%`,
            transform: 'translate(-50%, -50%)',
            width: 18, height: 18, borderRadius: '50%',
            background: '#F4A62A', border: '2px solid #FFFFFF',
            boxShadow: '0 1px 4px rgba(13,27,42,0.3)',
            pointerEvents: 'none',
          }} />
        )}
      </div>

      {loading && <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Loading damage codes…</p>}
      {saveError && <p role="alert" style={{ fontSize: 12, color: '#B91C1C', margin: 0 }}>{saveError}</p>}

      {/* ── Selected pin: label, optional photo, remove ── */}
      {selectedMarker && (
        <DamageMarkerDetail
          key={selectedMarker.id}
          marker={selectedMarker}
          store={store}
          editable={editable}
          onRemove={removeMarker}
          onPhotoChange={updatePhoto}
        />
      )}

      {/* ── Marker list ── */}
      {markers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            {markers.length} {markers.length === 1 ? 'marker' : 'markers'}
          </p>
          {markers.map(m => (
            <div key={m.id}
              onClick={() => setSelectedMarkerId(id => id === m.id ? null : m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                background: selectedMarkerId === m.id ? '#F0FDFF' : '#FAFAFA',
                border: '1px solid #E1E8F0', borderRadius: 8, cursor: 'pointer',
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#00B4D8', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#374151', flex: 1 }}>
                {composeDamageLabel(m.area, m.type, m.severity)}
              </span>
              {m.photo_url && <Camera size={13} color="#94A3B8" aria-label="Has photo" />}
            </div>
          ))}
        </div>
      )}

      {/* ── Area → Type → Severity picker ── */}
      <DamagePickerSheet
        pickerStep={pickerStep}
        areaCodes={areaCodes}
        typeCodes={typeCodes}
        severityCodes={severityCodes}
        pickedArea={pickedArea}
        pickedType={pickedType}
        saving={saving}
        onPickArea={pickArea}
        onPickType={pickType}
        onPickSeverity={pickSeverity}
        onBack={backPicker}
        onCancel={cancelPicker}
      />
    </div>
  )
}

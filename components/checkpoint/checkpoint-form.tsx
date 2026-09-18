'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Minus, Plus, Camera, Trash2, Loader2 } from 'lucide-react'
import DamageTaggerToggle from '@/components/damage/damage-tagger-toggle'
import { vehicleDamageStore } from '@/lib/damage-store'
// The camera pulls in the capture and barcode code; it loads when it opens.
const CameraCapture = dynamic(() => import('@/components/ui/camera-capture'), { ssr: false })
import SectionCard from '@/components/ui/section-card'
import {
  getCheckpoint, createCheckpoint, deleteCheckpoint,
  type CheckpointDirection, type FuelLevel, type VehicleCheckpoint,
} from '@/lib/checkpoint-actions'
import { uploadCheckpointPhoto } from '@/lib/checkpoint-server-actions'
import { updateWorkOrderStatus } from '@/lib/work-order-status'
import type { VehicleTemplate } from '@/lib/damage-actions'
import {
  PRIMARY, PRIMARY_LIGHT, PRIMARY_PILL_TEXT, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100,
  DANGER, DANGER_LIGHT, SUCCESS,
} from '@/lib/design-tokens'

export interface CheckpointFormProps {
  vehicleId: string
  companyId: string
  direction: CheckpointDirection
  vehicleTemplate: VehicleTemplate
  // Phase 10/11: the vehicle's resolved 2D/3D diagram assets (Phase 9). Null
  // means no real diagram resolved yet (e.g. vehicle_template just got set and
  // the lazy-resolve step upstream hasn't run) — DamageTaggerToggle handles
  // either or both being unavailable.
  modelAsset2dId?: string | null
  modelAsset3dId?: string | null
  vin: string
  inspectorId: string
  onComplete?: () => void
}

// Phase 13: 7 required shots — was 4 (front/rear/driver/passenger only). Added
// interior/dash plus the two gauge close-ups, which exist specifically to
// cross-verify the odometer/fuel values entered in the Vehicle Condition card
// during this same live pass.
const REQUIRED_PHOTO_SLOTS: { key: string; label: string }[] = [
  { key: 'front', label: 'Front' },
  { key: 'rear', label: 'Rear' },
  { key: 'driver_side', label: 'Driver Side' },
  { key: 'passenger_side', label: 'Passenger Side' },
  { key: 'interior_dash', label: 'Interior / Dash' },
  { key: 'odometer_closeup', label: 'Odometer Close-up' },
  { key: 'fuel_gauge_closeup', label: 'Fuel Gauge Close-up' },
]

const FUEL_LEVELS: FuelLevel[] = ['E', '1/4', '1/2', '3/4', 'F']

const DIRECTION_LABEL: Record<CheckpointDirection, string> = { intake: 'Intake', outtake: 'Outtake' }

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: GRAY_900 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))} style={{ width: 36, height: 36, borderRadius: 18, background: WHITE, border: `1.5px solid ${GRAY_300}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Minus size={15} color={GRAY_700} />
        </button>
        <span style={{ fontSize: 20, fontWeight: 700, color: GRAY_900, width: 24, textAlign: 'center' }}>{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} style={{ width: 36, height: 36, borderRadius: 18, background: WHITE, border: `1.5px solid ${GRAY_300}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Plus size={15} color={GRAY_700} />
        </button>
      </div>
    </div>
  )
}

const fieldLabelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', height: 44, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: GRAY_100, boxSizing: 'border-box', fontFamily: 'inherit' }
const textareaStyle: React.CSSProperties = { ...inputStyle, height: 80, padding: '10px 12px', resize: 'vertical' as const }

export default function CheckpointForm({
  vehicleId, companyId, direction, vehicleTemplate, modelAsset2dId, modelAsset3dId, vin, inspectorId, onComplete,
}: CheckpointFormProps) {
  const [existing, setExisting] = useState<VehicleCheckpoint | null | undefined>(undefined)
  const [odometer, setOdometer] = useState('')
  const [fuelLevel, setFuelLevel] = useState<FuelLevel | null>(null)
  // Smart default: a vehicle arriving with at least one key is by far the
  // common case — still freely adjustable via the counter.
  const [keyCount, setKeyCount] = useState(1)
  const [belongingsNote, setBelongingsNote] = useState('')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState<Record<string, string>>({}) // key -> local dataUrl or uploaded URL
  const [uploadedPhotos, setUploadedPhotos] = useState<Record<string, string>>({})
  const [activePhotoKey, setActivePhotoKey] = useState<string | null>(null)
  const [sequenceActive, setSequenceActive] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const damageStore = useMemo(
    () => vehicleDamageStore({ vehicleId, companyId, vehicleTemplate, source: direction, createdBy: inspectorId }),
    [vehicleId, companyId, vehicleTemplate, direction, inspectorId],
  )

  const damageRef = useRef<HTMLDivElement>(null)
  const photosRef = useRef<HTMLDivElement>(null)
  const notesRef = useRef<HTMLDivElement>(null)
  const autoScrolledToNotes = useRef(false)

  useEffect(() => {
    getCheckpoint(vehicleId, direction).then(setExisting)
  }, [vehicleId, direction])

  const uploadSlot = useCallback(async (key: string, dataUrl: string) => {
    setPhotos(prev => ({ ...prev, [key]: dataUrl }))
    try {
      const url = await uploadCheckpointPhoto(vehicleId, companyId, direction, dataUrl, key)
      setUploadedPhotos(prev => ({ ...prev, [key]: url }))
    } catch (e: any) {
      setError(`Photo upload failed (${key}): ${e.message}`)
      setPhotos(prev => { const next = { ...prev }; delete next[key]; return next })
    }
  }, [vehicleId, companyId, direction])

  const handlePhotoCapture = useCallback(async (dataUrl: string) => {
    const key = activePhotoKey
    if (!key) return
    setActivePhotoKey(null)
    await uploadSlot(key, dataUrl)
  }, [activePhotoKey, uploadSlot])

  const handleSequenceCapture = useCallback((index: number, dataUrl: string) => {
    uploadSlot(REQUIRED_PHOTO_SLOTS[index].key, dataUrl)
  }, [uploadSlot])

  const allPhotosReady = REQUIRED_PHOTO_SLOTS.every(s => uploadedPhotos[s.key])
  const photosDoneCount = REQUIRED_PHOTO_SLOTS.filter(s => uploadedPhotos[s.key]).length
  const firstIncompleteIndex = REQUIRED_PHOTO_SLOTS.findIndex(s => !uploadedPhotos[s.key])

  // Auto-advance: picking a fuel level is a clear "I'm done with this field"
  // signal, unlike Odometer (free text, mid-typing) or Keys (a counter the
  // user may tap multiple times) — so only this one scrolls automatically.
  const pickFuelLevel = (level: FuelLevel) => {
    setFuelLevel(level)
    requestAnimationFrame(() => damageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // Auto-advance: once every photo is uploaded, move on to Notes. Damage has
  // no equivalent auto-trigger — zero markers is a valid finished state, so
  // there's no reliable "done" signal to hook, hence the manual Continue
  // button on that card instead.
  useEffect(() => {
    if (allPhotosReady && !autoScrolledToNotes.current) {
      autoScrolledToNotes.current = true
      requestAnimationFrame(() => notesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [allPhotosReady])

  const requiredDone = [odometer.trim() !== '', fuelLevel !== null, allPhotosReady].filter(Boolean).length
  const requiredTotal = 3

  const handleSubmit = async () => {
    if (!allPhotosReady) { setError('All required photos must finish uploading first.'); return }
    setSaving(true)
    setError(null)
    try {
      const created = await createCheckpoint(companyId, {
        vehicleId,
        direction,
        odometer: odometer ? parseInt(odometer, 10) : null,
        fuelLevel,
        keyCount,
        photos: REQUIRED_PHOTO_SLOTS.map(s => uploadedPhotos[s.key]),
        belongingsNote: belongingsNote || undefined,
        notes: notes || undefined,
        inspectorId,
      })
      if (!created) throw new Error('Failed to save checkpoint')
      if (direction === 'intake') {
        await updateWorkOrderStatus(vehicleId, 'checked_in', inspectorId)
      }
      onComplete?.()
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleRedo = async () => {
    if (!existing) return
    await deleteCheckpoint(existing.id)
    setExisting(null)
  }

  if (existing === undefined) {
    return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 size={22} color={GRAY_500} className="animate-spin" /></div>
  }

  if (existing) {
    return (
      <div style={{ padding: 20, maxWidth: 560, margin: '0 auto' }}>
        <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 16, padding: 20 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: GRAY_900, margin: '0 0 4px' }}>
            {DIRECTION_LABEL[direction]} already completed
          </h2>
          <p style={{ fontSize: 13, color: GRAY_500, margin: '0 0 16px' }}>
            {new Date(existing.created_at).toLocaleString()}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: GRAY_700, marginBottom: 20 }}>
            {existing.odometer != null && <p style={{ margin: 0 }}>Odometer: {existing.odometer.toLocaleString()} mi</p>}
            {existing.fuel_level && <p style={{ margin: 0 }}>Fuel: {existing.fuel_level}</p>}
            <p style={{ margin: 0 }}>Keys: {existing.key_count}</p>
            {existing.belongings_note && <p style={{ margin: 0 }}>Belongings: {existing.belongings_note}</p>}
            {existing.notes && <p style={{ margin: 0 }}>Notes: {existing.notes}</p>}
          </div>
          <button
            onClick={handleRedo}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1px solid ${DANGER}`, color: DANGER, borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <Trash2 size={14} /> Delete and redo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* ── Sticky header + lightweight progress bar ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: WHITE, padding: '16px 20px 12px', borderBottom: `1px solid ${GRAY_300}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: GRAY_900, margin: 0 }}>{DIRECTION_LABEL[direction]}</h2>
            <p style={{ fontSize: 13, color: GRAY_500, margin: 0, fontFamily: 'monospace' }}>{vin}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: GRAY_500, whiteSpace: 'nowrap' }}>
            {requiredDone} of {requiredTotal} required steps
          </span>
        </div>
        <div style={{ height: 4, background: GRAY_100, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: 4, width: `${(requiredDone / requiredTotal) * 100}%`, background: PRIMARY, borderRadius: 2, transition: 'width 300ms ease' }} />
        </div>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {error && (
          <p style={{ fontSize: 13, color: DANGER, background: DANGER_LIGHT, borderRadius: 8, padding: '10px 14px', margin: '0 0 12px' }}>{error}</p>
        )}

        <SectionCard title="Vehicle Condition">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={fieldLabelStyle}>Odometer</label>
              <input type="number" inputMode="numeric" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="Miles" style={inputStyle} />
            </div>
            <div>
              <label style={fieldLabelStyle}>Fuel Level</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {FUEL_LEVELS.map(level => (
                  <button key={level} type="button" onClick={() => pickFuelLevel(level)}
                    style={{
                      flex: 1, height: 40, borderRadius: 10,
                      border: `1.5px solid ${fuelLevel === level ? PRIMARY : GRAY_300}`,
                      background: fuelLevel === level ? PRIMARY_LIGHT : GRAY_100,
                      color: fuelLevel === level ? PRIMARY_PILL_TEXT : GRAY_700,
                      fontSize: 13, fontWeight: fuelLevel === level ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    {level}
                  </button>
                ))}
              </div>
            </div>
            <Counter label="Keys" value={keyCount} onChange={setKeyCount} />
          </div>
        </SectionCard>

        <div ref={damageRef}>
          <SectionCard title="Damage">
            <DamageTaggerToggle
              store={damageStore}
              vehicleTemplate={vehicleTemplate}
              modelAsset2dId={modelAsset2dId}
              modelAsset3dId={modelAsset3dId}
            />
            <button
              type="button"
              onClick={() => photosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              style={{ marginTop: 14, background: 'none', border: 'none', color: PRIMARY, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
            >
              Continue to Photos →
            </button>
          </SectionCard>
        </div>

        <div ref={photosRef}>
          <SectionCard title="Photos" count={photosDoneCount}>
            {!allPhotosReady && (
              <button
                type="button"
                onClick={() => setSequenceActive(true)}
                style={{
                  width: '100%', height: 46, borderRadius: 10, border: 'none', background: PRIMARY, color: WHITE,
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Camera size={16} />
                {photosDoneCount === 0 ? 'Start Photos' : 'Continue Photos'} ({photosDoneCount}/{REQUIRED_PHOTO_SLOTS.length})
              </button>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {REQUIRED_PHOTO_SLOTS.map(slot => (
                <button key={slot.key} type="button" onClick={() => setActivePhotoKey(slot.key)}
                  style={{
                    height: 88, borderRadius: 10, border: `1.5px solid ${uploadedPhotos[slot.key] ? SUCCESS : GRAY_300}`,
                    background: photos[slot.key] ? `url(${photos[slot.key]}) center/cover` : GRAY_100,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                    cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  }}>
                  {!photos[slot.key] && <Camera size={20} color={GRAY_500} />}
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: photos[slot.key] ? WHITE : GRAY_700,
                    textShadow: photos[slot.key] ? '0 1px 3px rgba(0,0,0,0.6)' : 'none',
                  }}>
                    {slot.label}{!uploadedPhotos[slot.key] && photos[slot.key] ? ' — uploading…' : ''}
                  </span>
                </button>
              ))}
            </div>
          </SectionCard>
        </div>

        <div ref={notesRef}>
          <SectionCard title="Notes">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={fieldLabelStyle}>Personal Property / Belongings</label>
                <textarea value={belongingsNote} onChange={e => setBelongingsNote(e.target.value)} placeholder="Items left in the vehicle…" style={textareaStyle} />
              </div>
              <div>
                <label style={fieldLabelStyle}>Notes</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything else worth noting…" style={textareaStyle} />
              </div>
            </div>
          </SectionCard>
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            height: 48, borderRadius: 12, border: 'none', background: PRIMARY, color: WHITE,
            fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit',
            marginTop: 12,
          }}
        >
          {saving ? 'Saving…' : `Complete ${DIRECTION_LABEL[direction]}`}
        </button>
      </div>

      {sequenceActive && (
        <CameraCapture
          photoSequence={REQUIRED_PHOTO_SLOTS.map(s => s.label)}
          currentSequenceIndex={firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex}
          onSequenceCapture={handleSequenceCapture}
          onClose={() => setSequenceActive(false)}
        />
      )}

      {activePhotoKey && (
        <CameraCapture
          onCapture={handlePhotoCapture}
          onClose={() => setActivePhotoKey(null)}
          title={REQUIRED_PHOTO_SLOTS.find(s => s.key === activePhotoKey)?.label}
        />
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Trash2, Camera, Loader2, X } from 'lucide-react'
import { composeDamageLabel } from '@/lib/damage-actions'
import type { DamageStore, DamageMarkerWithPhoto } from '@/lib/damage-store'
import { PRIMARY, WHITE, GRAY_900, GRAY_500, GRAY_300, DANGER } from '@/lib/design-tokens'

const CameraCapture = dynamic(() => import('@/components/ui/camera-capture'), { ssr: false })

// The selected pin's label, its optional close-up photo, and remove. Shared by
// the 2D and 3D taggers so both behave the same.
export default function DamageMarkerDetail({
  marker, store, editable = true, onRemove, onPhotoChange,
}: {
  marker: DamageMarkerWithPhoto
  store: DamageStore
  editable?: boolean
  onRemove: (id: string) => void
  onPhotoChange: (id: string, photoUrl: string | null, photoPath: string | null) => void
}) {
  const [capturing, setCapturing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const savePhoto = async (dataUrl: string) => {
    setBusy(true)
    setError(null)
    try {
      const url = await store.uploadPhoto(marker.id, dataUrl)
      onPhotoChange(marker.id, url, marker.photo_path ?? 'uploaded')
    } catch (e: any) {
      setError(e?.message ?? 'Photo upload failed')
    } finally {
      setBusy(false)
    }
  }

  const removePhoto = async () => {
    setBusy(true)
    setError(null)
    try {
      await store.removePhoto(marker.id)
      onPhotoChange(marker.id, null, null)
    } catch (e: any) {
      setError(e?.message ?? 'Could not remove the photo')
    } finally {
      setBusy(false)
    }
  }

  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
    fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: 'inherit', padding: 4,
  }

  return (
    <div style={{ padding: '10px 14px', background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 13, color: GRAY_900, fontWeight: 600 }}>
          {composeDamageLabel(marker.area, marker.type, marker.severity)}
        </span>
        {editable && (
          <button onClick={() => onRemove(marker.id)} disabled={busy} style={{ ...btn, color: DANGER }}>
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>

      {marker.photo_url && (
        <div style={{ position: 'relative', width: 120 }}>
          <img src={marker.photo_url} alt="Damage close-up" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
          {editable && (
            <button onClick={removePhoto} disabled={busy} aria-label="Remove photo"
              style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 12, border: 'none', background: 'rgba(13,27,42,0.7)', color: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {editable && (
        <button onClick={() => setCapturing(true)} disabled={busy} style={{ ...btn, color: PRIMARY, alignSelf: 'flex-start' }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
          {marker.photo_url ? 'Retake photo' : 'Add photo (optional)'}
        </button>
      )}
      {error && <p style={{ fontSize: 12, color: DANGER, margin: 0 }}>{error}</p>}
      {!editable && !marker.photo_url && <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>No photo</p>}

      {capturing && (
        <CameraCapture
          mode="square"
          title="Damage close-up"
          onCapture={dataUrl => { setCapturing(false); savePhoto(dataUrl) }}
          onClose={() => setCapturing(false)}
        />
      )}
    </div>
  )
}

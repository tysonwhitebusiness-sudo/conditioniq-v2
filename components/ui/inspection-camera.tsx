'use client'

import { useMemo, useRef } from 'react'
import CameraCapture from './camera-capture'
import { reportBoxForField } from '@/lib/report/layout'

// Photo slots for the full inspection (exterior walk-around, interior, damage
// close-ups, documents). The camera itself is the shared CameraCapture, so these
// photos get the same confirm step as intake and outtake.
//
// Each accepted photo uploads before the camera moves on, so a field only ever
// carries a short storage URL through wizard state, not base64 (the 413
// body-size fix). If an upload fails, the photo is kept locally and handed to
// onUploadError so the slot can be flagged for retry; it is never lost.

export interface CameraSlot {
  key: string
  label: string
}

interface InspectionCameraProps {
  slots: CameraSlot[]
  values: Record<string, string | null | undefined>
  startKey?: string
  inspectionId: string
  onCapture: (key: string, url: string) => void
  // Shows the photo in its slot the moment it is accepted, from the device,
  // while the upload runs behind it. Slots that pass this advance without
  // waiting; slots that don't keep the old behaviour of waiting for the upload.
  onPendingCapture?: (key: string, dataUrl: string) => void
  onUploadError?: (key: string, dataUrl: string) => void
  onClose: () => void
  mode?: 'vehicle' | 'square'
}

// The tapped slot first, then every other empty slot after it, wrapping around.
// Retaking a filled slot shoots just that one plus whatever is still empty.
export function cameraSlotOrder(
  slots: CameraSlot[],
  values: Record<string, string | null | undefined>,
  startKey?: string,
): CameraSlot[] {
  if (slots.length === 0) return []
  const firstEmpty = slots.find(s => !values[s.key])?.key
  const startIdx = Math.max(0, slots.findIndex(s => s.key === (startKey ?? firstEmpty)))
  const rotated = [...slots.slice(startIdx), ...slots.slice(0, startIdx)]
  return [rotated[0], ...rotated.slice(1).filter(s => !values[s.key])]
}

export default function InspectionCamera({
  slots,
  values,
  startKey,
  inspectionId,
  onCapture,
  onPendingCapture,
  onUploadError,
  onClose,
  mode = 'vehicle',
}: InspectionCameraProps) {
  // Fixed when the camera opens, for the life of this camera session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const order = useMemo(() => cameraSlotOrder(slots, values, startKey), [])

  // Callbacks from the latest render, so a slow upload reports to current state.
  const latest = useRef({ onCapture, onPendingCapture, onUploadError })
  latest.current = { onCapture, onPendingCapture, onUploadError }

  const upload = async (slotKey: string, dataUrl: string): Promise<void | string> => {
    try {
      const { uploadInspectionPhoto } = await import('@/lib/inspection-server-actions')
      const url = await uploadInspectionPhoto(inspectionId, dataUrl, slotKey)
      latest.current.onCapture(slotKey, url)
    } catch (err) {
      console.error('[camera] upload failed', err)
      // Deliberately NOT calling onCapture here — that callback means "upload succeeded."
      latest.current.onUploadError?.(slotKey, dataUrl)
      return 'Upload failed. The photo is saved on this device and can be retried from the photo grid.'
    }
  }

  const save = async (index: number, dataUrl: string): Promise<void | string> => {
    const slot = order[index]
    if (!slot) return

    // Optimistic: fill the slot from the device and let the next shot start
    // straight away. The upload is registered so the wizard can wait for every
    // outstanding one before it finishes the inspection.
    if (latest.current.onPendingCapture) {
      latest.current.onPendingCapture(slot.key, dataUrl)
      const { trackUpload } = await import('@/lib/photo-uploads')
      trackUpload(upload(slot.key, dataUrl))
      return
    }

    return upload(slot.key, dataUrl)
  }

  if (order.length === 0) return null

  return (
    <CameraCapture
      mode={mode}
      photoSequence={order.map(s => s.label)}
      currentSequenceIndex={0}
      // Each slot confirms against the report box its field prints in.
      reportPreview={i => (order[i] ? { box: mode === 'square' ? 'damage' : reportBoxForField(order[i].key), caption: order[i].label } : null)}
      onSequenceCapture={save}
      onClose={onClose}
    />
  )
}

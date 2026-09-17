'use client'

import { useMemo, useRef } from 'react'
import CameraCapture from './camera-capture'

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
  onUploadError,
  onClose,
  mode = 'vehicle',
}: InspectionCameraProps) {
  // Fixed when the camera opens, for the life of this camera session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const order = useMemo(() => cameraSlotOrder(slots, values, startKey), [])

  // Callbacks from the latest render, so a slow upload reports to current state.
  const latest = useRef({ onCapture, onUploadError })
  latest.current = { onCapture, onUploadError }

  const save = async (index: number, dataUrl: string): Promise<void | string> => {
    const slot = order[index]
    if (!slot) return
    try {
      const { uploadInspectionPhoto } = await import('@/lib/inspection-server-actions')
      const url = await uploadInspectionPhoto(inspectionId, dataUrl, slot.key)
      latest.current.onCapture(slot.key, url)
    } catch (err) {
      console.error('[camera] upload failed', err)
      // Deliberately NOT calling onCapture here — that callback means "upload succeeded."
      latest.current.onUploadError?.(slot.key, dataUrl)
      return 'Upload failed. The photo is saved on this device and can be retried from the photo grid.'
    }
  }

  if (order.length === 0) return null

  return (
    <CameraCapture
      mode={mode}
      photoSequence={order.map(s => s.label)}
      currentSequenceIndex={0}
      onSequenceCapture={save}
      onClose={onClose}
    />
  )
}

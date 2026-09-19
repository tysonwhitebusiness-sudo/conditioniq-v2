'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { measureQuality, qualityProblems, QUALITY_EDGE, PROBLEM_TEXT, type QualityProblem } from '@/lib/photo-quality'
import { WARN_LIGHT, WARN_DARK } from '@/lib/design-tokens'
import { GAUGE_SLOTS } from '@/lib/ai/gauges'

// D · Shown on the camera's confirm screen, over the photo, before Use Photo.
//
// Blur and darkness are measured here on the phone the moment the photo is
// taken (free, instant). When the photo belongs to an inspection slot, a small
// copy also goes to /api/photo-check, which says whether it shows the right
// thing and is framed. Nothing here stops the inspector keeping the photo.

interface Props {
  src: string
  /** The inspection slot this photo fills, e.g. exteriorFrontPhoto. */
  slotKey?: string
  inspectionId?: string
}

/** A small grayscale copy for measuring, and a small JPEG for the AI check. */
async function prepare(src: string, aiEdge: number): Promise<{ gray: Uint8ClampedArray; width: number; height: number; jpeg: string }> {
  const img = new Image()
  img.src = src
  await img.decode()
  const scale = Math.min(1, QUALITY_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, width, height)
  const rgba = ctx.getImageData(0, 0, width, height).data
  const gray = new Uint8ClampedArray(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
  if (aiEdge <= QUALITY_EDGE) return { gray, width, height, jpeg: canvas.toDataURL('image/jpeg', 0.8) }
  // Gauge slots: a larger copy so the odometer digits can be read.
  const big = Math.min(1, aiEdge / Math.max(img.naturalWidth, img.naturalHeight))
  const large = document.createElement('canvas')
  large.width = Math.max(1, Math.round(img.naturalWidth * big))
  large.height = Math.max(1, Math.round(img.naturalHeight * big))
  large.getContext('2d')!.drawImage(img, 0, 0, large.width, large.height)
  return { gray, width, height, jpeg: large.toDataURL('image/jpeg', 0.85) }
}

export default function PhotoCheckNotice({ src, slotKey, inspectionId }: Props) {
  const [problems, setProblems] = useState<QualityProblem[]>([])
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setProblems([])
    setNote(null)
    prepare(src, slotKey && GAUGE_SLOTS.has(slotKey) ? 1280 : QUALITY_EDGE).then(({ gray, width, height, jpeg }) => {
      if (cancelled) return
      const measure = measureQuality(gray, width, height)
      const found = qualityProblems(measure)
      setProblems(found)
      if (!slotKey || !inspectionId) return
      // The check is stored even if the inspector moves on before it returns.
      fetch('/api/photo-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspectionId, slot: slotKey, image: jpeg, sharpness: measure.sharpness, brightness: measure.brightness, problems: found }),
      })
        .then(r => (r.ok ? r.json() : null))
        .then(result => { if (!cancelled && result?.note) setNote(result.note) })
        .catch(() => {})
    }).catch(() => {})
    return () => { cancelled = true }
  }, [src, slotKey, inspectionId])

  const lines = [...problems.map(p => `${PROBLEM_TEXT[p]}.`), ...(note ? [note] : [])]
  if (!lines.length) return null
  return (
    <div role="status" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, background: WARN_LIGHT, color: WARN_DARK, borderRadius: 10, padding: '10px 12px', display: 'flex', gap: 8, alignItems: 'flex-start', boxShadow: '0 2px 10px rgba(0,0,0,0.25)' }}>
      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 13, lineHeight: 1.4 }}>
        {lines.map((l, i) => <p key={i} style={{ margin: 0, fontWeight: i === 0 ? 700 : 500 }}>{l}</p>)}
        <p style={{ margin: '2px 0 0', fontWeight: 500 }}>Retake it, or keep it if it is right.</p>
      </div>
    </div>
  )
}

'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { X, Upload } from 'lucide-react'

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

const GUIDE_W_PCT = 85
const GUIDE_H_PCT = 60
const OFFSET_UP_PCT = 5
const SQUARE_SIZE_PCT = 75

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
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null)
  const [currentKey, setCurrentKey] = useState<string>(() => {
    if (startKey) return startKey
    return slots.find(s => !values[s.key])?.key ?? slots[0]?.key ?? ''
  })

  const currentSlot = slots.find(s => s.key === currentKey) ?? slots[0]
  const currentIdx = slots.findIndex(s => s.key === currentKey)
  const showProgress = slots.length > 1

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setStreaming(false)
  }, [])

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setStreaming(true)
      }
    } catch {
      setError('Camera access denied. Use the Upload button to add a photo instead.')
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  const advanceOrClose = useCallback(
    (justCapturedKey: string, updatedValues: Record<string, string | null | undefined>) => {
      if (slots.length === 1) {
        stopCamera()
        onClose()
        return
      }
      const startIdx = slots.findIndex(s => s.key === justCapturedKey)
      const searchOrder = [...slots.slice(startIdx + 1), ...slots.slice(0, startIdx)]
      const next = searchOrder.find(s => !updatedValues[s.key])
      if (next) {
        setCurrentKey(next.key)
      } else {
        stopCamera()
        onClose()
      }
    },
    [slots, stopCamera, onClose],
  )

  // Uploads immediately so the field only ever carries a short storage URL
  // through wizard state, not base64 — this is what actually fixes the
  // 413 body-size error, not just moving it to a later point in the flow.
  const processCaptured = useCallback(
    async (key: string, dataUrl: string) => {
      setUploading(true)
      setUploadErrorMsg(null)
      try {
        const { uploadInspectionPhoto } = await import('@/lib/inspection-server-actions')
        const url = await uploadInspectionPhoto(inspectionId, dataUrl, key)
        onCapture(key, url)
        advanceOrClose(key, { ...values, [key]: url })
      } catch (err) {
        console.error('[camera] upload failed', err)
        // Never lose the photo — hand the parent the local base64 capture so it
        // can keep it as the field value and flag this slot for retry. Deliberately
        // NOT calling onCapture here — that callback means "upload succeeded."
        onUploadError?.(key, dataUrl)
        setUploadErrorMsg('Upload failed — photo saved locally. You can retry from the photo grid.')
        await new Promise(resolve => setTimeout(resolve, 1800))
        advanceOrClose(key, { ...values, [key]: dataUrl })
      } finally {
        setUploading(false)
      }
    },
    [inspectionId, values, onCapture, onUploadError, advanceOrClose],
  )

  const capturePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !streaming || uploading) return

    const W = video.clientWidth || window.innerWidth
    const H = video.clientHeight || window.innerHeight

    let guideLeft: number, guideTop: number, guideW: number, guideH: number

    if (mode === 'square') {
      const size = Math.min(W, H) * SQUARE_SIZE_PCT / 100
      guideW = size
      guideH = size
      guideLeft = (W - size) / 2
      guideTop = (H - size) / 2
    } else {
      guideW = W * GUIDE_W_PCT / 100
      guideH = H * GUIDE_H_PCT / 100
      guideLeft = (W - guideW) / 2
      guideTop = H / 2 - guideH / 2 - H * OFFSET_UP_PCT / 100
    }

    // objectFit: cover math
    const vW = video.videoWidth
    const vH = video.videoHeight
    const scale = Math.max(W / vW, H / vH)
    const offsetX = (W - vW * scale) / 2
    const offsetY = (H - vH * scale) / 2

    const srcX = Math.max(0, (guideLeft - offsetX) / scale)
    const srcY = Math.max(0, (guideTop - offsetY) / scale)
    const srcW = Math.min(vW - srcX, guideW / scale)
    const srcH = Math.min(vH - srcY, guideH / scale)

    canvas.width = Math.round(srcW)
    canvas.height = Math.round(srcH)
    canvas.getContext('2d')?.drawImage(video, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)

    processCaptured(currentKey, dataUrl)
  }, [streaming, uploading, currentKey, mode, processCaptured])

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || uploading) return
      const reader = new FileReader()
      reader.onload = ev => {
        const dataUrl = ev.target?.result as string
        processCaptured(currentKey, dataUrl)
      }
      reader.readAsDataURL(file)
    },
    [currentKey, uploading, processCaptured],
  )

  const handleClose = useCallback(() => { stopCamera(); onClose() }, [stopCamera, onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#000' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      {/* Live video */}
      <video
        ref={videoRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        playsInline
        muted
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Upload progress / failure — sits above everything else while a capture is in flight */}
      {(uploading || uploadErrorMsg) && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 14, background: 'rgba(0,0,0,0.72)', padding: 32, textAlign: 'center',
        }}>
          {uploading ? (
            <>
              <div style={{
                width: 40, height: 40, borderRadius: 20,
                border: '3px solid rgba(255,255,255,0.25)', borderTopColor: '#00B4D8',
                animation: 'spin 0.8s linear infinite',
              }} />
              <p style={{ color: '#FFF', fontSize: 14, fontWeight: 600, margin: 0 }}>Uploading photo…</p>
            </>
          ) : (
            <p style={{ color: '#FBBF24', fontSize: 14, fontWeight: 600, margin: 0, maxWidth: 260, lineHeight: 1.5 }}>
              {uploadErrorMsg}
            </p>
          )}
        </div>
      )}

      {error ? (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32, background: '#000',
        }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Upload size={28} color="#EF4444" />
          </div>
          <p style={{ color: '#FFF', fontSize: 15, textAlign: 'center', lineHeight: 1.6, maxWidth: 280 }}>{error}</p>
          <label style={{ background: '#00B4D8', color: '#FFF', padding: '14px 28px', borderRadius: 12, fontWeight: 600, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Upload size={18} /> Upload Photo
            <input ref={fileInputRef} type="file" accept="image/*,image/heic,image/heif" style={{ display: 'none' }} onChange={handleFileUpload} />
          </label>
          <button onClick={handleClose} style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
        </div>
      ) : mode === 'square' ? (
        <>
          {/* ── Square mode overlay ─────────────────────────────────────────────── */}
          {/* Top */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 'calc(50% - 37.5vmin)', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          {/* Bottom */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: 'calc(50% + 37.5vmin)', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          {/* Left */}
          <div style={{ position: 'absolute', top: 'calc(50% - 37.5vmin)', bottom: 'calc(50% - 37.5vmin)', left: 0, width: 'calc(50% - 37.5vmin)', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />
          {/* Right */}
          <div style={{ position: 'absolute', top: 'calc(50% - 37.5vmin)', bottom: 'calc(50% - 37.5vmin)', right: 0, width: 'calc(50% - 37.5vmin)', background: 'rgba(0,0,0,0.6)', pointerEvents: 'none' }} />

          {/* ── Square guide box ──────────────────────────────────────────────── */}
          <div style={{
            position: 'absolute',
            left: 'calc(50% - 37.5vmin)',
            top: 'calc(50% - 37.5vmin)',
            width: '75vmin',
            height: '75vmin',
            pointerEvents: 'none',
          }}>
            {([
              { top: 0,    left: 0,    borderTop: '3px solid #FFF', borderLeft: '3px solid #FFF' },
              { top: 0,    right: 0,   borderTop: '3px solid #FFF', borderRight: '3px solid #FFF' },
              { bottom: 0, left: 0,    borderBottom: '3px solid #FFF', borderLeft: '3px solid #FFF' },
              { bottom: 0, right: 0,   borderBottom: '3px solid #FFF', borderRight: '3px solid #FFF' },
            ] as React.CSSProperties[]).map((style, i) => (
              <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...style }} />
            ))}

            {/* Label above */}
            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, paddingBottom: 12, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#FFF', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
                {currentSlot?.label ?? 'Damage Photo'}
              </p>
            </div>

            {/* Instruction below */}
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, paddingTop: 10, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.65)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                Center damage within frame
              </p>
            </div>
          </div>

          {/* ── X button ─────────────────────────────────────────────────────── */}
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: 'max(20px, env(safe-area-inset-top))',
              left: 20, zIndex: 10,
              width: 40, height: 40, borderRadius: 20,
              background: 'rgba(0,0,0,0.5)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={20} color="#FFF" />
          </button>

          {/* ── Bottom row: upload + shutter ─────────────────────────────────── */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
            padding: '20px 40px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={20} color="#FFF" />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>Upload</span>
              <input type="file" accept="image/*,image/heic,image/heif" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>

            <button
              onClick={capturePhoto}
              disabled={!streaming || uploading}
              style={{
                width: 76, height: 76, borderRadius: 38,
                background: '#FFF',
                border: '5px solid rgba(255,255,255,0.35)',
                boxShadow: '0 0 0 3px rgba(255,255,255,0.15)',
                cursor: streaming ? 'pointer' : 'default',
                opacity: streaming ? 1 : 0.5,
                padding: 0, flexShrink: 0,
              }}
            />

            <div style={{ width: 44 }} />
          </div>
        </>
      ) : (
        <>
          {/* ── Vehicle mode overlay (4 surrounding panels) ──────────────────── */}
          {/* Top */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: `calc(50% - ${GUIDE_H_PCT / 2}vh - ${OFFSET_UP_PCT}vh)`,
            background: 'rgba(0,0,0,0.55)', pointerEvents: 'none',
          }} />
          {/* Bottom */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            top: `calc(50% + ${GUIDE_H_PCT / 2}vh - ${OFFSET_UP_PCT}vh)`,
            background: 'rgba(0,0,0,0.55)', pointerEvents: 'none',
          }} />
          {/* Left */}
          <div style={{
            position: 'absolute',
            top: `calc(50% - ${GUIDE_H_PCT / 2}vh - ${OFFSET_UP_PCT}vh)`,
            bottom: `calc(50% - ${GUIDE_H_PCT / 2}vh + ${OFFSET_UP_PCT}vh)`,
            left: 0, width: `calc(50% - ${GUIDE_W_PCT / 2}vw)`,
            background: 'rgba(0,0,0,0.55)', pointerEvents: 'none',
          }} />
          {/* Right */}
          <div style={{
            position: 'absolute',
            top: `calc(50% - ${GUIDE_H_PCT / 2}vh - ${OFFSET_UP_PCT}vh)`,
            bottom: `calc(50% - ${GUIDE_H_PCT / 2}vh + ${OFFSET_UP_PCT}vh)`,
            right: 0, width: `calc(50% - ${GUIDE_W_PCT / 2}vw)`,
            background: 'rgba(0,0,0,0.55)', pointerEvents: 'none',
          }} />

          {/* ── Guide rectangle ───────────────────────────────────────────────── */}
          <div style={{
            position: 'absolute',
            left: `${(100 - GUIDE_W_PCT) / 2}vw`,
            top: `calc(50% - ${GUIDE_H_PCT / 2}vh - ${OFFSET_UP_PCT}vh)`,
            width: `${GUIDE_W_PCT}vw`,
            height: `${GUIDE_H_PCT}vh`,
            pointerEvents: 'none',
          }}>
            {([
              { top: 0,    left: 0,    borderTop: '3px solid #FFF', borderLeft: '3px solid #FFF' },
              { top: 0,    right: 0,   borderTop: '3px solid #FFF', borderRight: '3px solid #FFF' },
              { bottom: 0, left: 0,    borderBottom: '3px solid #FFF', borderLeft: '3px solid #FFF' },
              { bottom: 0, right: 0,   borderBottom: '3px solid #FFF', borderRight: '3px solid #FFF' },
            ] as React.CSSProperties[]).map((style, i) => (
              <div key={i} style={{ position: 'absolute', width: 24, height: 24, ...style }} />
            ))}

            {/* Label above guide */}
            <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, paddingBottom: 12, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#FFF', textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
                {currentSlot?.label}
              </p>
              {showProgress && (
                <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.6)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                  {currentIdx + 1} of {slots.length}
                </p>
              )}
            </div>

            {/* Instruction below guide */}
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, paddingTop: 10, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.65)', textShadow: '0 1px 4px rgba(0,0,0,0.8)', letterSpacing: '0.01em' }}>
                Position vehicle within frame
              </p>
            </div>
          </div>

          {/* ── X button top left ─────────────────────────────────────────────── */}
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: 'max(20px, env(safe-area-inset-top))',
              left: 20, zIndex: 10,
              width: 40, height: 40, borderRadius: 20,
              background: 'rgba(0,0,0,0.5)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={20} color="#FFF" />
          </button>

          {/* ── Bottom row: upload + shutter ──────────────────────────────────── */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingBottom: 'max(40px, env(safe-area-inset-bottom))',
            padding: '20px 40px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            {/* Upload fallback */}
            <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 44, height: 44, borderRadius: 22, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={20} color="#FFF" />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>Upload</span>
              <input type="file" accept="image/*,image/heic,image/heif" style={{ display: 'none' }} onChange={handleFileUpload} />
            </label>

            {/* Shutter */}
            <button
              onClick={capturePhoto}
              disabled={!streaming || uploading}
              style={{
                width: 76, height: 76, borderRadius: 38,
                background: '#FFF',
                border: '5px solid rgba(255,255,255,0.35)',
                boxShadow: '0 0 0 3px rgba(255,255,255,0.15)',
                cursor: streaming ? 'pointer' : 'default',
                opacity: streaming ? 1 : 0.5,
                padding: 0, flexShrink: 0,
              }}
            />

            {/* Spacer */}
            <div style={{ width: 44 }} />
          </div>
        </>
      )}
    </div>
  )
}

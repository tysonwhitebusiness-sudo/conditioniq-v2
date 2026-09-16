'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { X, RotateCcw, Check, Upload, Camera } from 'lucide-react'

interface CameraCaptureProps {
  // Optional because it's never actually called in sequence mode (see accept()
  // below) — only the single-shot path uses it.
  onCapture?: (dataUrl: string) => void
  onClose: () => void
  liveScan?: 'vin'
  photoSequence?: string[]
  currentSequenceIndex?: number
  onSequenceCapture?: (index: number, dataUrl: string) => void
}

export default function CameraCapture({
  onCapture,
  onClose,
  photoSequence,
  currentSequenceIndex = 0,
  onSequenceCapture,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [streaming, setStreaming] = useState(false)
  const [captured, setCaptured] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seqIdx, setSeqIdx] = useState(currentSequenceIndex)
  const [isCapturing, setIsCapturing] = useState(false)
  const [flash, setFlash] = useState(false)

  // Guards against a real race: React 18 StrictMode double-invokes this
  // component's mount effect in dev (mount -> cleanup -> mount again), which
  // fires startCamera() twice. The first call's getUserMedia() can resolve
  // after the second call has already reassigned videoRef.current.srcObject,
  // aborting the first call's in-flight .play() with a genuine AbortError —
  // this is exactly the class of bug StrictMode's double-invoke exists to
  // surface, not a fluke. Each startCamera() call tags itself with a request
  // id; if a newer call has superseded it by the time its async work
  // resolves, it stops its now-orphaned stream instead of racing the newer
  // one, rather than swallowing the resulting AbortError as if it were a
  // real camera failure.
  const requestIdRef = useRef(0)

  const stopCamera = useCallback(() => {
    requestIdRef.current++
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setStreaming(false)
  }, [])

  const startCamera = useCallback(async () => {
    const myRequestId = ++requestIdRef.current
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      if (myRequestId !== requestIdRef.current) { stream.getTracks().forEach(t => t.stop()); return }
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        if (myRequestId === requestIdRef.current) setStreaming(true)
      }
    } catch (e) {
      if (myRequestId !== requestIdRef.current) return
      console.error('[camera] startCamera failed:', e)
      setError('Camera access denied. Please allow camera access and try again.')
    }
  }, [])

  // Auto-start on mount
  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || isCapturing) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    // Grab the frame now, at the moment of the tap — the shutter-feedback
    // delay below is purely visual and must not affect which frame is used.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)

    setIsCapturing(true)
    setFlash(true)
    setTimeout(() => setFlash(false), 200)
    setTimeout(() => {
      setCaptured(dataUrl)
      stopCamera()
      setIsCapturing(false)
    }, 160)
  }, [stopCamera, isCapturing])

  const retake = useCallback(() => {
    setCaptured(null)
    startCamera()
  }, [startCamera])

  const accept = useCallback(() => {
    if (!captured) return
    if (photoSequence && onSequenceCapture) {
      onSequenceCapture(seqIdx, captured)
      if (seqIdx < photoSequence.length - 1) {
        setSeqIdx(i => i + 1)
        setCaptured(null)
        startCamera()
        return
      }
    } else {
      onCapture?.(captured)
    }
    stopCamera()
    onClose()
  }, [captured, photoSequence, onSequenceCapture, seqIdx, onCapture, stopCamera, onClose, startCamera])

  // Camera-denied fallback. Must mirror accept()'s sequence branching — before
  // this fix, uploading a file here while in sequence mode silently dropped the
  // shot into the single-capture path instead of advancing the sequence, since
  // this never had a real caller to catch it against (first live use is
  // checkpoint-form.tsx's guided photo capture).
  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      if (photoSequence && onSequenceCapture) {
        onSequenceCapture(seqIdx, dataUrl)
        if (seqIdx < photoSequence.length - 1) {
          setSeqIdx(i => i + 1)
          return
        }
      } else {
        onCapture?.(dataUrl)
      }
      onClose()
    }
    reader.readAsDataURL(file)
  }, [photoSequence, onSequenceCapture, seqIdx, onCapture, onClose])

  const handleClose = () => { stopCamera(); onClose() }

  const label = photoSequence ? photoSequence[seqIdx] : undefined
  const progress = photoSequence ? `${seqIdx + 1} / ${photoSequence.length}` : undefined

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#000000', display: 'flex', flexDirection: 'column',
      animation: 'camera-capture-fade-in 180ms ease',
    }}>
      <style>{`
        @keyframes camera-capture-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes camera-capture-view-fade-in { from { opacity: 0; transform: scale(0.98) } to { opacity: 1; transform: scale(1) } }
      `}</style>

      {/* Shutter flash — rendered outside the branch ternary so it persists
          across the live-viewfinder -> preview swap instead of unmounting
          mid-flash. */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: '#FFFFFF',
        opacity: flash ? 0.85 : 0,
        transition: flash ? 'none' : 'opacity 200ms ease',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        background: 'linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0))',
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
      }}>
        <button
          onClick={handleClose}
          style={{
            width: 40, height: 40, borderRadius: 20,
            background: 'rgba(255,255,255,0.15)', border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={20} color="#FFFFFF" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }} />
        </button>

        <div key={seqIdx} style={{ textAlign: 'center', animation: 'camera-capture-view-fade-in 220ms ease' }}>
          {label && <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, margin: 0, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{label}</p>}
          {progress && <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: 0, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{progress}</p>}
        </div>

        <div style={{ width: 40 }} />
      </div>

      {/* Error state */}
      {error ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32,
        }}>
          <div style={{
            width: 72, height: 72, borderRadius: 36,
            background: 'rgba(239,68,68,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Camera size={32} color="#EF4444" />
          </div>
          <p style={{ color: '#FFFFFF', fontSize: 15, textAlign: 'center', lineHeight: 1.5 }}>{error}</p>
          <label style={{
            background: '#00B4D8', color: '#FFFFFF',
            padding: '14px 28px', borderRadius: 12,
            fontWeight: 600, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Upload size={18} /> Upload Photo
            <input
              ref={fileRef}
              type="file"
              accept="image/*,image/heic,image/heif"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </label>
          <button
            onClick={handleClose}
            style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>

      /* Preview state */
      ) : captured ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, animation: 'camera-capture-view-fade-in 240ms ease' }}>
          <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
            <img
              src={captured}
              alt="Preview"
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />
          </div>
          {/* Bottom action bar — a normal in-flow flex row with a guaranteed
              minHeight, not absolutely positioned against a container whose
              resolved height turned out not to be reliable in every real
              browser (confirmed reproducible twice on real hardware, never
              once in extensive automated testing across every viewport/
              device/browser-profile combination tried — this restructure
              removes the dependency on whatever that unconfirmed condition
              is, rather than the layout being contingent on it). */}
          <div style={{
            flexShrink: 0, minHeight: 120,
            paddingTop: 16, paddingLeft: 32, paddingRight: 32,
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
            background: '#000000',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
          }}>
            <button
              onClick={retake}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: 28,
                background: '#00B4D8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <RotateCcw size={24} color="#FFFFFF" />
              </div>
              <span style={{ color: '#00B4D8', fontSize: 12, fontWeight: 600 }}>Retake</span>
            </button>
            <button
              onClick={accept}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', cursor: 'pointer',
              }}
            >
              <div style={{
                width: 56, height: 56, borderRadius: 28,
                background: '#10B981',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Check size={24} color="#FFFFFF" />
              </div>
              <span style={{ color: '#10B981', fontSize: 12, fontWeight: 600 }}>Use Photo</span>
            </button>
          </div>
        </div>

      /* Live viewfinder */
      ) : (
        // This div is the video's own flex box — flex:1 with an explicit
        // minHeight:0, resolved against the outer position:fixed;inset:0
        // wrapper's definite viewport height. That combination is what
        // makes its height reliable (unlike the pre-fix version of this
        // component, which anchored the control row to a flex child that
        // didn't force minHeight:0 and could size ambiguously in some real
        // browsers — confirmed reproducible twice on real hardware, never
        // once across ~15 automated test profiles). The control row below
        // is positioned absolutely WITHIN this specific box, not the outer
        // container, so it floats over the video without recreating that
        // fragile setup.
        <div style={{ flex: 1, position: 'relative', minHeight: 0, animation: 'camera-capture-view-fade-in 240ms ease' }}>
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            playsInline
            muted
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Shutter + upload row */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingTop: 16, paddingLeft: 40, paddingRight: 40,
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
          }}>
            {/* Upload option */}
            <label style={{ flexShrink: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 22,
                background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Upload size={20} color="#FFFFFF" />
              </div>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Upload</span>
              <input
                type="file"
                accept="image/*,image/heic,image/heif"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
            </label>

            {/* Shutter button */}
            <button
              onClick={capturePhoto}
              disabled={!streaming || isCapturing}
              aria-label="Capture photo"
              style={{
                flexShrink: 0,
                width: 72, height: 72, borderRadius: 36,
                background: '#FFFFFF',
                border: '4px solid rgba(255,255,255,0.4)',
                boxShadow: '0 0 0 3px rgba(255,255,255,0.2)',
                cursor: streaming ? 'pointer' : 'default',
                opacity: streaming ? 1 : 0.5,
                transform: isCapturing ? 'scale(0.86)' : 'scale(1)',
                transition: 'transform 120ms ease',
              }}
            />

            {/* Spacer to balance layout */}
            <div style={{ flexShrink: 0, width: 44 }} />
          </div>
        </div>
      )}
    </div>
  )
}

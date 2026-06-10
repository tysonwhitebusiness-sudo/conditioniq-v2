'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { X, RotateCcw, Check, Upload, Camera } from 'lucide-react'

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void
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
      setError('Camera access denied. Please allow camera access and try again.')
    }
  }, [])

  // Auto-start on mount
  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88)
    setCaptured(dataUrl)
    stopCamera()
  }, [stopCamera])

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
      onCapture(captured)
    }
    stopCamera()
    onClose()
  }, [captured, photoSequence, onSequenceCapture, seqIdx, onCapture, stopCamera, onClose, startCamera])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      onCapture(dataUrl)
      onClose()
    }
    reader.readAsDataURL(file)
  }, [onCapture, onClose])

  const handleClose = () => { stopCamera(); onClose() }

  const label = photoSequence ? photoSequence[seqIdx] : undefined
  const progress = photoSequence ? `${seqIdx + 1} / ${photoSequence.length}` : undefined

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#000000', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        background: 'rgba(0,0,0,0.6)',
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
          <X size={20} color="#FFFFFF" />
        </button>

        <div style={{ textAlign: 'center' }}>
          {label && <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, margin: 0 }}>{label}</p>}
          {progress && <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: 0 }}>{progress}</p>}
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
        <div style={{ flex: 1, position: 'relative' }}>
          <img
            src={captured}
            alt="Preview"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
          {/* Bottom action bar */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '20px 32px',
            paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
            display: 'flex', justifyContent: 'center', gap: 24,
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
                background: '#F4A62A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <RotateCcw size={24} color="#0D1B2A" />
              </div>
              <span style={{ color: '#F4A62A', fontSize: 12, fontWeight: 600 }}>Retake</span>
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
        <div style={{ flex: 1, position: 'relative' }}>
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            playsInline
            muted
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* Shutter + upload row */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
            padding: '20px 40px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.6))',
          }}>
            {/* Upload option */}
            <label style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
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
              disabled={!streaming}
              style={{
                width: 72, height: 72, borderRadius: 36,
                background: '#FFFFFF',
                border: '4px solid rgba(255,255,255,0.4)',
                boxShadow: '0 0 0 3px rgba(255,255,255,0.2)',
                cursor: streaming ? 'pointer' : 'default',
                opacity: streaming ? 1 : 0.5,
              }}
            />

            {/* Spacer to balance layout */}
            <div style={{ width: 44 }} />
          </div>
        </div>
      )}
    </div>
  )
}

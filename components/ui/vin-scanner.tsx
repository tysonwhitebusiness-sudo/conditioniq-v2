'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { X, Keyboard, ScanLine, Camera, Loader2 } from 'lucide-react'
import { BarcodeDetector } from 'barcode-detector/pure'
import { extractVin } from '@/lib/scan/vin'
import { scanPhoto, recordSavedScan, type ScanResult } from '@/lib/scan/client'

// Continuous VIN barcode scanner. Standalone — not a revival of camera-capture.tsx's
// unused liveScan prop, since this is a fundamentally different interaction
// (continuous auto-detect, no shutter) built on the same getUserMedia foundation.
//
// Native BarcodeDetector isn't available on iOS Safari (WebKit doesn't implement
// it on any iOS browser), so this always uses the barcode-detector package's
// ponyfill (ZXing-C++ via WebAssembly) rather than feature-detecting window.BarcodeDetector
// — one code path, works the same everywhere, including the phones field staff
// actually use.

export interface VinScannerProps {
  onScan: (vin: string) => void
  onManualEntry: () => void
  onClose: () => void
  /** Ties a photo read to its inspection, for the spend ceiling and the scan log. */
  inspectionId?: string | null
}

// S · Newer vehicles carry the VIN in a Data Matrix or QR label as well as the
// Code 39 barcode, and labels often hold more than the VIN, so the VIN is found
// inside whatever a barcode says. A read counts only if its check digit passes.
const BARCODE_FORMATS = ['code_39', 'code_128', 'data_matrix', 'qr_code', 'pdf417'] as const

const SCAN_INTERVAL_MS = 350
const NO_DETECT_HINT_MS = 12000

export function isValidVin(value: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(value)
}

export default function VinScanner({ onScan, onManualEntry, onClose, inspectionId = null }: VinScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<BarcodeDetector | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scannedRef = useRef(false)

  const [error, setError] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(false)
  // A read from a still photo, waiting for the inspector to confirm.
  const [photoRead, setPhotoRead] = useState<ScanResult | null>(null)
  const [readingPhoto, setReadingPhoto] = useState(false)

  const stopScanning = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const runDetectLoop = useCallback(() => {
    if (!detectorRef.current) detectorRef.current = new BarcodeDetector({ formats: [...BARCODE_FORMATS] })
    intervalRef.current = setInterval(async () => {
      if (scannedRef.current || !videoRef.current || videoRef.current.readyState < 2) return
      try {
        const results = await detectorRef.current!.detect(videoRef.current)
        for (const r of results) {
          const candidate = extractVin(r.rawValue)
          if (candidate) {
            scannedRef.current = true
            stopScanning()
            onScan(candidate)
            return
          }
        }
      } catch {
        // Decode failure on a single frame — keep scanning, don't surface it.
      }
    }, SCAN_INTERVAL_MS)
  }, [onScan, stopScanning])

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
        runDetectLoop()
      }
    } catch {
      setError('Camera access denied. You can enter the VIN manually instead.')
    }
  }, [runDetectLoop])

  useEffect(() => {
    startCamera()
    const hintTimer = setTimeout(() => setShowHint(true), NO_DETECT_HINT_MS)
    return () => { stopScanning(); clearTimeout(hintTimer) }
  }, [startCamera, stopScanning])

  // S · When no barcode can be read, read the VIN from the frame on screen:
  // the text reader first, then AI if the account allows it.
  const readFromPhoto = async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')!.drawImage(video, 0, 0)
    setReadingPhoto(true)
    setPhotoRead(null)
    try {
      setPhotoRead(await scanPhoto('vin', canvas.toDataURL('image/jpeg', 0.9), { inspectionId }))
    } catch {
      setPhotoRead({ id: null, value: null, source: null })
    } finally {
      setReadingPhoto(false)
    }
  }

  const acceptPhotoRead = () => {
    if (!photoRead?.value) return
    recordSavedScan(photoRead.id, photoRead.value)
    scannedRef.current = true
    stopScanning()
    onScan(photoRead.value)
  }

  const handleClose = () => { stopScanning(); onClose() }
  const handleManualEntry = () => { stopScanning(); onManualEntry() }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000000', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', paddingTop: 'max(16px, env(safe-area-inset-top))',
        background: 'rgba(0,0,0,0.6)', position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
      }}>
        <button onClick={handleClose} style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.15)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <X size={20} color="#FFFFFF" />
        </button>
        <p style={{ color: '#FFFFFF', fontSize: 15, fontWeight: 600, margin: 0 }}>Scan VIN Barcode</p>
        <button onClick={handleManualEntry} title="Enter manually" style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.15)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Keyboard size={18} color="#FFFFFF" />
        </button>
      </div>

      {error ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
          <div style={{ width: 72, height: 72, borderRadius: 36, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ScanLine size={32} color="#EF4444" />
          </div>
          <p style={{ color: '#FFFFFF', fontSize: 15, textAlign: 'center', lineHeight: 1.5 }}>{error}</p>
          <button
            onClick={handleManualEntry}
            style={{ background: '#00B4D8', color: '#FFFFFF', padding: '14px 28px', borderRadius: 12, fontWeight: 600, fontSize: 15, cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Keyboard size={18} /> Enter VIN Manually
          </button>
          <button onClick={handleClose} style={{ color: 'rgba(255,255,255,0.5)', background: 'none', border: 'none', fontSize: 14, cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, position: 'relative' }}>
          <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} playsInline muted />

          {/* Scan guide frame */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '80%', maxWidth: 420, height: 90,
            border: '2px solid #00B4D8', borderRadius: 10,
            boxShadow: '0 0 0 2000px rgba(0,0,0,0.45)',
            pointerEvents: 'none',
          }} />

          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '20px 32px', paddingBottom: 'max(32px, env(safe-area-inset-bottom))',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          }}>
            {photoRead ? (
              photoRead.value ? (
                <div style={{ width: '100%', maxWidth: 420, background: 'rgba(255,255,255,0.96)', borderRadius: 12, padding: 12 }}>
                  <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>Read from the photo — check it matches the vehicle</p>
                  <p style={{ fontSize: 17, fontWeight: 700, fontFamily: 'monospace', letterSpacing: '0.06em', color: '#0F172A', margin: '4px 0 10px', wordBreak: 'break-all' }}>{photoRead.value}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={acceptPhotoRead} style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', background: '#00B4D8', color: '#FFFFFF', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Use this VIN</button>
                    <button onClick={() => { recordSavedScan(photoRead.id, ''); setPhotoRead(null) }} style={{ height: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: '#E2E8F0', color: '#0F172A', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Try again</button>
                  </div>
                </div>
              ) : (
                <p style={{ color: '#FFFFFF', fontSize: 13, textAlign: 'center', margin: 0 }}>Couldn&apos;t read a VIN from that photo. Move closer, avoid glare, and try again.</p>
              )
            ) : (
              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', margin: 0 }}>
                Align the VIN barcode (windshield or door jamb) inside the frame
              </p>
            )}
            {!photoRead?.value && (
              <button
                onClick={readFromPhoto}
                disabled={readingPhoto}
                style={{ color: '#FFFFFF', background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 10, height: 38, padding: '0 14px', fontSize: 13, fontWeight: 600, cursor: readingPhoto ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {readingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                {readingPhoto ? 'Reading…' : 'No barcode? Read the VIN from the photo'}
              </button>
            )}
            {showHint && (
              <button
                onClick={handleManualEntry}
                style={{ color: '#00B4D8', background: 'none', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Keyboard size={14} /> Having trouble? Enter VIN manually
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

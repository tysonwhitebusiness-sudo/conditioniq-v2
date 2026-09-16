'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { X, Keyboard, ScanLine } from 'lucide-react'
import { BarcodeDetector } from 'barcode-detector/pure'

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
}

const SCAN_INTERVAL_MS = 350
const NO_DETECT_HINT_MS = 12000

export function isValidVin(value: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(value)
}

export default function VinScanner({ onScan, onManualEntry, onClose }: VinScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectorRef = useRef<BarcodeDetector | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scannedRef = useRef(false)

  const [error, setError] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(false)

  const stopScanning = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const runDetectLoop = useCallback(() => {
    if (!detectorRef.current) detectorRef.current = new BarcodeDetector({ formats: ['code_39'] })
    intervalRef.current = setInterval(async () => {
      if (scannedRef.current || !videoRef.current || videoRef.current.readyState < 2) return
      try {
        const results = await detectorRef.current!.detect(videoRef.current)
        for (const r of results) {
          const candidate = r.rawValue.trim().toUpperCase()
          if (isValidVin(candidate)) {
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
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center', margin: 0 }}>
              Align the VIN barcode (windshield or door jamb) inside the frame
            </p>
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

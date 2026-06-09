'use client'

import { useRef, useState, useCallback } from 'react'
import { Camera, X, RotateCcw, Check } from 'lucide-react'

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
  liveScan,
  photoSequence,
  currentSequenceIndex = 0,
  onSequenceCapture,
}: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [captured, setCaptured] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [seqIdx, setSeqIdx] = useState(currentSequenceIndex)

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play()
        setStreaming(true)
      }
    } catch {
      setError('Camera access denied. Please allow camera access and try again.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setStreaming(false)
  }, [])

  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    setCaptured(dataUrl)
    stopCamera()
  }, [stopCamera])

  const acceptPhoto = useCallback(() => {
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

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 bg-black/80">
        <button onClick={() => { stopCamera(); onClose() }} className="text-white p-2">
          <X size={24} />
        </button>
        {photoSequence && (
          <span className="text-white text-sm">
            {photoSequence[seqIdx]} ({seqIdx + 1}/{photoSequence.length})
          </span>
        )}
        <div className="w-10" />
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
          <p className="text-white text-center">{error}</p>
          <label className="bg-blue-600 text-white px-6 py-3 rounded-lg cursor-pointer">
            Upload Photo Instead
            <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </label>
          <button onClick={onClose} className="text-gray-400">Cancel</button>
        </div>
      ) : captured ? (
        <div className="flex-1 relative">
          <img src={captured} alt="Preview" className="w-full h-full object-contain" />
          <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6">
            <button
              onClick={() => { setCaptured(null); startCamera() }}
              className="bg-gray-700 text-white p-4 rounded-full"
            >
              <RotateCcw size={24} />
            </button>
            <button onClick={acceptPhoto} className="bg-green-600 text-white p-4 rounded-full">
              <Check size={24} />
            </button>
          </div>
        </div>
      ) : streaming ? (
        <div className="flex-1 relative">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="absolute bottom-8 left-0 right-0 flex justify-center">
            <button onClick={capturePhoto} className="w-16 h-16 rounded-full bg-white border-4 border-gray-300" />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <Camera size={48} className="text-white" />
          <button onClick={startCamera} className="bg-blue-600 text-white px-8 py-3 rounded-lg text-lg">
            Open Camera
          </button>
          <label className="text-gray-300 cursor-pointer underline text-sm">
            Or upload a photo
            <input type="file" accept="image/*,image/heic,image/heif" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      )}
    </div>
  )
}

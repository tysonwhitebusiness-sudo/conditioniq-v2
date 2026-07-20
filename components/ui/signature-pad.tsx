'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Trash2 } from 'lucide-react'

interface SignaturePadProps {
  onSignature: (dataUrl: string) => void
  existingSignature?: string | null
  inspectionId: string
}

export default function SignaturePad({ onSignature, existingSignature, inspectionId }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isEmpty, setIsEmpty] = useState(!existingSignature)
  const [uploading, setUploading] = useState(false)
  const [uploadFailed, setUploadFailed] = useState(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)
  // Guards against an earlier stroke's upload resolving after a later one and
  // overwriting it — signatures are small, so uploading on every stroke-end is
  // cheap; this just ensures only the most recent attempt's result ever wins.
  const uploadGeneration = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    ctx.strokeStyle = '#1e3a5f'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (existingSignature) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = existingSignature
    }
  }, [existingSignature])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    setIsDrawing(true)
    lastPos.current = getPos(e)
  }, [])

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing || !canvasRef.current || !lastPos.current) return
    const ctx = canvasRef.current.getContext('2d')!
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setIsEmpty(false)
  }, [isDrawing])

  const endDraw = useCallback(() => {
    if (!isDrawing) return
    setIsDrawing(false)
    lastPos.current = null
    if (!isEmpty && canvasRef.current) {
      const dataUrl = canvasRef.current.toDataURL('image/png')
      onSignature(dataUrl) // immediate local update — keeps canSubmit/preview responsive

      const generation = ++uploadGeneration.current
      setUploading(true)
      setUploadFailed(false)
      ;(async () => {
        try {
          const { uploadInspectionPhoto } = await import('@/lib/inspection-server-actions')
          const url = await uploadInspectionPhoto(inspectionId, dataUrl, 'signature')
          if (uploadGeneration.current === generation) onSignature(url)
        } catch (err) {
          console.error('[signature] upload failed', err)
          if (uploadGeneration.current === generation) setUploadFailed(true)
        } finally {
          if (uploadGeneration.current === generation) setUploading(false)
        }
      })()
    }
  }, [isDrawing, isEmpty, onSignature, inspectionId])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    uploadGeneration.current++ // invalidate any in-flight upload for the cleared signature
    setUploading(false)
    setUploadFailed(false)
    onSignature('')
  }, [onSignature])

  return (
    <div className="space-y-2">
      <div className="relative border-2 border-gray-300 rounded-lg bg-white" style={{ height: 140 }}>
        <canvas
          ref={canvasRef}
          className="w-full h-full touch-none"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-gray-400 text-sm">Sign here</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-500"
        >
          <Trash2 size={14} /> Clear signature
        </button>
        {uploading && <span className="text-xs text-gray-400">Saving…</span>}
        {uploadFailed && !uploading && <span className="text-xs text-amber-600">⚠ Save failed, will retry</span>}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Camera, X } from 'lucide-react'
import dynamic from 'next/dynamic'

const CameraCapture = dynamic(() => import('./camera-capture'), { ssr: false })

interface PhotoFieldProps {
  label: string
  value?: string | null
  onChange: (url: string) => void
  required?: boolean
}

export default function PhotoField({ label, value, onChange, required }: PhotoFieldProps) {
  const [showCamera, setShowCamera] = useState(false)

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {value ? (
        <div className="relative rounded-xl overflow-hidden border border-gray-200" style={{ height: 160 }}>
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <button
            onClick={() => onChange('')}
            className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          className="w-full h-32 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
        >
          <Camera size={24} />
          <span className="text-sm">Tap to capture</span>
        </button>
      )}

      {showCamera && (
        <CameraCapture
          onCapture={url => { onChange(url); setShowCamera(false) }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Camera } from 'lucide-react'
import dynamic from 'next/dynamic'

const InspectionCamera = dynamic(() => import('./inspection-camera'), { ssr: false })

interface PhotoFieldProps {
  label: string
  value?: string | null
  onChange: (url: string) => void
  required?: boolean
  inspectionId: string
  fieldKey: string
}

export default function PhotoField({ label, value, onChange, required, inspectionId, fieldKey }: PhotoFieldProps) {
  const [showCamera, setShowCamera] = useState(false)
  const [uploadFailed, setUploadFailed] = useState(false)

  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 4 }}>*</span>}
      </label>

      {value ? (
        <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', outline: uploadFailed ? '2px solid #F59E0B' : 'none' }}>
          <img src={value} alt={label} style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }} />
          {uploadFailed && (
            <span style={{
              position: 'absolute', top: 8, left: 8,
              background: '#F59E0B', color: '#FFFFFF',
              fontSize: 10, fontWeight: 700,
              borderRadius: 20, padding: '3px 9px',
            }}>
              ⚠ Retry upload
            </span>
          )}
          <button
            onClick={() => setShowCamera(true)}
            style={{
              position: 'absolute', bottom: 8, right: 8,
              background: '#00B4D8', color: '#FFFFFF',
              fontSize: 11, fontWeight: 700,
              borderRadius: 20, padding: '4px 10px',
              border: 'none', cursor: 'pointer',
            }}
          >
            Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCamera(true)}
          style={{
            width: '100%', minHeight: 140,
            background: '#FFFFFF',
            border: '2px dashed #CBD5E1',
            borderRadius: 14,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer',
          }}
        >
          <Camera size={28} style={{ color: '#94A3B8' }} />
          <span style={{ fontSize: 13, color: '#94A3B8' }}>Tap to capture</span>
        </button>
      )}

      {showCamera && (
        <InspectionCamera
          slots={[{ key: fieldKey, label }]}
          values={{ [fieldKey]: value ?? null }}
          startKey={fieldKey}
          inspectionId={inspectionId}
          onCapture={(_, url) => { setUploadFailed(false); onChange(url) }}
          onUploadError={(_, dataUrl) => { setUploadFailed(true); onChange(dataUrl) }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  )
}

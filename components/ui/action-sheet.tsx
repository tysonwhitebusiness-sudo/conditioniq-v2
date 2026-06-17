'use client'

import { useEffect } from 'react'
import { Car, Send, ChevronRight } from 'lucide-react'

interface ActionSheetProps {
  open: boolean
  onClose: () => void
  onStartInspection: () => void
  onSendToInspector: () => void
  showDispatch?: boolean
}

export default function ActionSheet({ open, onClose, onStartInspection, onSendToInspector, showDispatch = true }: ActionSheetProps) {
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.65)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'relative',
        background: '#FFFFFF',
        borderRadius: '28px 28px 0 0',
        padding: '12px 16px',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        maxHeight: '55vh',
        overflow: 'hidden',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: '#E1E8F0', borderRadius: 2, margin: '0 auto 16px' }} />

        {/* Label */}
        <p style={{
          fontSize: 11, fontWeight: 700, color: '#94A3B8',
          textTransform: 'uppercase', letterSpacing: '0.08em',
          textAlign: 'center', margin: '0 0 16px',
        }}>
          New Inspection
        </p>

        {/* Rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          <button
            onClick={() => { onClose(); onStartInspection() }}
            style={{
              width: '100%', height: 72, display: 'flex', alignItems: 'center', gap: 16,
              padding: '0 16px', background: '#F0F4F8', border: 'none', cursor: 'pointer',
              borderRadius: 16, textAlign: 'left',
            }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 22, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Car size={20} color="white" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: 0, lineHeight: 1.2 }}>Start Inspection</p>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, marginTop: 2 }}>Run an inspection yourself</p>
            </div>
            <ChevronRight size={16} color="#94A3B8" />
          </button>

          {showDispatch && (
            <button
              onClick={() => { onClose(); onSendToInspector() }}
              style={{
                width: '100%', height: 72, display: 'flex', alignItems: 'center', gap: 16,
                padding: '0 16px', background: '#F0F4F8', border: 'none', cursor: 'pointer',
                borderRadius: 16, textAlign: 'left',
              }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 22, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Send size={20} color="white" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: 0, lineHeight: 1.2 }}>Send to Inspector</p>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, marginTop: 2 }}>Generate a link for someone else</p>
              </div>
              <ChevronRight size={16} color="#94A3B8" />
            </button>
          )}
        </div>

        {/* Cancel */}
        <button
          onClick={onClose}
          style={{
            width: '100%', height: 52, borderRadius: 14, background: '#FFFFFF',
            border: '1.5px solid #E1E8F0', color: '#4A5568',
            fontWeight: 600, fontSize: 15, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

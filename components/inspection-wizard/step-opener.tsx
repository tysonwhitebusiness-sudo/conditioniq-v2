'use client'

import { Info } from 'lucide-react'

interface StepOpenerProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  instructionTitle: string
  instructionText: string
  complete: boolean
  remainingText?: string
}

export default function StepOpener({
  icon, title, subtitle, instructionTitle, instructionText, complete, remainingText,
}: StepOpenerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 24px 0' }}>
      {/* Icon circle */}
      <div style={{
        width: 80, height: 80, borderRadius: 40,
        background: '#FFFFFF',
        boxShadow: '0 2px 8px rgba(13,27,42,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        {icon}
      </div>

      {/* Title */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0D1B2A', textAlign: 'center', marginTop: 16, marginBottom: 0 }}>
        {title}
      </h1>

      {/* Subtitle */}
      <p style={{ fontSize: 14, color: '#4A5568', textAlign: 'center', marginTop: 4, marginBottom: 0 }}>
        {subtitle}
      </p>

      {/* Completion badge */}
      <div style={{
        marginTop: 12,
        background: complete ? '#D1FAE5' : '#FEF3C7',
        color: complete ? '#065F46' : '#92400E',
        borderRadius: 20,
        padding: '4px 12px',
        fontSize: 12,
        fontWeight: 600,
      }}>
        {complete ? 'All complete' : (remainingText ?? 'Fields remaining')}
      </div>

      {/* Cyan instruction card */}
      <div style={{
        width: '100%',
        background: '#E0F7FC',
        borderLeft: '4px solid #00B4D8',
        borderRadius: 12,
        padding: 16,
        marginTop: 16,
        marginBottom: 24,
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        <Info size={20} style={{ color: '#00B4D8', flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>{instructionTitle}</p>
          <p style={{ fontSize: 13, color: '#4A5568', marginTop: 2, marginBottom: 0 }}>{instructionText}</p>
        </div>
      </div>
    </div>
  )
}

'use client'

import type { ElementType } from 'react'

interface Props {
  icon: ElementType
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '32px 20px' }}>
      <div style={{
        width: 44, height: 44, borderRadius: 22, background: '#F0F4F8',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
      }}>
        <Icon size={20} color="#94A3B8" />
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>{title}</p>
      {description && <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 16px', maxWidth: 320, lineHeight: 1.5 }}>{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            height: 38, padding: '0 18px', borderRadius: 10, border: '1.5px solid #00B4D8',
            background: '#FFFFFF', color: '#00B4D8', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', marginTop: description ? 0 : 14,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

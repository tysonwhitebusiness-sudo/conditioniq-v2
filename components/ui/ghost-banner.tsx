'use client'

import { Ghost, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

const AMBER = '#F4A62A'
const MIDNIGHT = '#0D1B2A'

export default function GhostBanner() {
  const { impersonatedCompany, exitGhostMode } = useAuth()
  if (!impersonatedCompany) return null

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '10px 16px',
      background: AMBER, color: MIDNIGHT,
      borderBottom: `2px solid ${MIDNIGHT}`,
      fontSize: 13, fontFamily: 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Ghost size={16} style={{ flexShrink: 0 }} />
        <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Viewing as {impersonatedCompany.name} — Ghost Mode active
        </span>
      </div>
      <button
        onClick={() => exitGhostMode()}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          height: 30, padding: '0 14px', borderRadius: 8,
          border: `1.5px solid ${MIDNIGHT}`, background: MIDNIGHT, color: '#FFF',
          fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <LogOut size={13} /> Exit Ghost Mode
      </button>
    </div>
  )
}

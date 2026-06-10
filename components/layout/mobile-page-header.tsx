'use client'

import { Car } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'

export default function MobilePageHeader() {
  const { effectiveCompany, user, userProfile } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const router = useRouter()

  if (isDesktop) return null

  const name = userProfile?.full_name ?? user?.email ?? ''
  const initials = name.charAt(0).toUpperCase() || 'U'

  return (
    <div style={{
      background: '#0D1B2A',
      paddingTop: 'max(14px, env(safe-area-inset-top))',
      paddingBottom: 14,
      paddingLeft: 16,
      paddingRight: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Car size={17} color="#FFFFFF" />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', margin: 0, lineHeight: 1.2 }}>Condition IQ</p>
          <p style={{ fontSize: 11, color: '#00B4D8', margin: 0, lineHeight: 1 }}>{effectiveCompany?.name ?? '—'}</p>
        </div>
      </div>
      <button
        onClick={() => router.push('/profile')}
        style={{ width: 34, height: 34, borderRadius: 17, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 13 }}>{initials}</span>
      </button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Search, Bell, ChevronDown } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'

interface Props {
  pageTitle?: string
  isInspecting?: boolean
  sidebarWidth?: number
}

export default function DesktopTopBar({ pageTitle = 'Condition IQ', isInspecting = false, sidebarWidth = 256 }: Props) {
  const { user, userProfile, isOwnerUser, signOut } = useAuth()
  const router = useRouter()
  const [showAvatarMenu, setShowAvatarMenu] = useState(false)

  const displayName = userProfile?.full_name ?? user?.email ?? ''
  const initials = displayName.split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'U'

  return (
    <div style={{
      position: 'fixed', top: 0, left: sidebarWidth, right: 0, height: 64, zIndex: 30,
      transition: 'left 200ms ease',
      background: '#0D1B2A',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Left: page title */}
      <div>
        {isInspecting ? (
          <span style={{ fontSize: 15, fontWeight: 600, color: '#00B4D8' }}>
            Inspection in Progress
          </span>
        ) : (
          <span style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF' }}>
            {pageTitle}
          </span>
        )}
      </div>

      {/* Right: search + bell + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Search */}
        {!isInspecting && (
          <div style={{ position: 'relative' }}>
            <Search size={15} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              placeholder="Search VIN, company..."
              style={{
                height: 36, width: 260,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 10,
                paddingLeft: 32, paddingRight: 12,
                color: '#FFFFFF', fontSize: 13,
                outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>
        )}

        {/* Bell */}
        <button style={{
          width: 36, height: 36, borderRadius: 8,
          background: 'rgba(255,255,255,0.06)', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <Bell size={18} color="rgba(255,255,255,0.7)" />
        </button>

        {/* Avatar */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowAvatarMenu(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 18,
              background: '#00B4D8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#FFFFFF',
            }}>
              {initials}
            </div>
            <ChevronDown size={14} color="rgba(255,255,255,0.5)" />
          </button>

          {showAvatarMenu && (
            <>
              {/* backdrop */}
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                onClick={() => setShowAvatarMenu(false)}
              />
              <div style={{
                position: 'absolute', top: 44, right: 0, zIndex: 50,
                background: '#FFFFFF', borderRadius: 12, minWidth: 180,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                border: '1px solid #E1E8F0', overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #F0F4F8' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>{displayName || 'Account'}</p>
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{user?.email}</p>
                </div>
                {isOwnerUser && (
                  <button
                    onClick={() => { setShowAvatarMenu(false); router.push('/admin/overview') }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#0D1B2A', fontFamily: 'inherit' }}
                  >
                    Admin Center
                  </button>
                )}
                <button
                  onClick={() => signOut()}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#EF4444', fontFamily: 'inherit' }}
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

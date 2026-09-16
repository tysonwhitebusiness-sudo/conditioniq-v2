'use client'

import { useState } from 'react'
import { Search, Bell, ChevronDown, Ghost } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { PRIMARY, AMBER, AMBER_DARK, DANGER, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'

interface Props {
  pageTitle?: string
  isInspecting?: boolean
  sidebarWidth?: number
}

export default function DesktopTopBar({ pageTitle = 'Condition IQ', isInspecting = false, sidebarWidth = 256 }: Props) {
  const { user, userProfile, isOwnerUser, signOut, impersonatedCompany } = useAuth()
  const router = useRouter()
  const [showAvatarMenu, setShowAvatarMenu] = useState(false)

  const displayName = userProfile?.full_name ?? user?.email ?? ''
  const initials = displayName.split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'U'

  return (
    <div style={{
      position: 'fixed', top: 0, left: sidebarWidth, right: 0, height: 64, zIndex: 30,
      transition: 'left 200ms ease',
      background: WHITE,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px',
      borderBottom: `1px solid ${GRAY_300}`,
    }}>
      {/* Left: page title */}
      <div>
        {isInspecting ? (
          <span style={{ fontSize: 15, fontWeight: 600, color: PRIMARY }}>
            Inspection in Progress
          </span>
        ) : (
          <span style={{ fontSize: 18, fontWeight: 700, color: GRAY_900 }}>
            {pageTitle}
          </span>
        )}
      </div>

      {/* Right: search + bell + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Search */}
        {!isInspecting && (
          <div style={{ position: 'relative' }}>
            <Search size={15} color={GRAY_500} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              placeholder="Search VIN, company..."
              style={{
                height: 36, width: 260,
                background: GRAY_100,
                border: `1px solid ${GRAY_300}`,
                borderRadius: 10,
                paddingLeft: 32, paddingRight: 12,
                color: GRAY_900, fontSize: 13,
                outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>
        )}

        {/* Ghost Mode qualifier */}
        {impersonatedCompany && (
          <span
            title={`Ghost Mode: viewing ${impersonatedCompany.name}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 9px', borderRadius: 20,
              background: AMBER, color: GRAY_900,
              fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
            }}
          >
            <Ghost size={11} /> GHOST
          </span>
        )}

        {/* Bell */}
        <button style={{
          width: 36, height: 36, borderRadius: 8,
          background: GRAY_100, border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
        }}>
          <Bell size={18} color={GRAY_700} />
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
              background: PRIMARY,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: WHITE,
            }}>
              {initials}
            </div>
            <ChevronDown size={14} color={GRAY_500} />
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
                background: WHITE, borderRadius: 12, minWidth: 180,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                border: `1px solid ${GRAY_300}`, overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${GRAY_100}` }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: GRAY_900, margin: 0 }}>{displayName || 'Account'}</p>
                  <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>{user?.email}</p>
                  {impersonatedCompany && (
                    <p style={{ fontSize: 11, fontWeight: 700, color: AMBER_DARK, margin: '4px 0 0' }}>
                      Viewing: {impersonatedCompany.name}
                    </p>
                  )}
                </div>
                {isOwnerUser && (
                  <button
                    onClick={() => { setShowAvatarMenu(false); router.push('/admin/overview') }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: GRAY_900, fontFamily: 'inherit' }}
                  >
                    Admin Center
                  </button>
                )}
                <button
                  onClick={() => signOut()}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: DANGER, fontFamily: 'inherit' }}
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

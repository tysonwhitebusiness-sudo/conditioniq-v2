'use client'

import { useState, useEffect, useRef } from 'react'
import { Car, CreditCard, Palette, Users, Shield, User, LogOut, ChevronLeft, Settings, Lock, Send, DollarSign } from 'lucide-react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useFeatureFlag } from '@/hooks/use-feature-flag'

export default function MobilePageHeader() {
  const { effectiveCompany, user, userProfile, isOwnerUser, companyRole, platformRole, signOut, impersonatedCompany } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const router = useRouter()
  const whiteLabelEnabled = useFeatureFlag('white_label')
  const dispatchEnabled = useFeatureFlag('dispatch')
  const lotBillingEnabled = useFeatureFlag('lot_billing')
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const pathname = usePathname()
  const isAdmin = isOwnerUser || companyRole === 'admin'
  const isSuperAdmin = isOwnerUser && platformRole === 'super_admin'
  const isSettingsSubPage = pathname.startsWith('/settings/')

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (isDesktop) return null

  const name = userProfile?.full_name ?? user?.email ?? ''
  const initials = name.charAt(0).toUpperCase() || 'U'

  const nav = (path: string) => { setOpen(false); router.push(path) }

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 16px', cursor: 'pointer', background: 'none',
    border: 'none', width: '100%', textAlign: 'left',
    fontFamily: 'inherit',
  }

  const iconBox = (bg: string, icon: React.ReactNode) => (
    <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {icon}
    </div>
  )

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
      position: 'relative',
      zIndex: 50,
    }}>
      {isSettingsSubPage ? (
        <button
          onClick={() => router.push('/settings')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', color: '#00B4D8' }}
        >
          <ChevronLeft size={18} color="#00B4D8" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#00B4D8' }}>Settings</span>
        </button>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Car size={17} color="#FFFFFF" />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF', margin: 0, lineHeight: 1.2 }}>Condition IQ</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <p style={{ fontSize: 11, color: '#00B4D8', margin: 0, lineHeight: 1 }}>{effectiveCompany?.name ?? '—'}</p>
              {impersonatedCompany && (
                <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 20, background: '#F4A62A', color: '#0D1B2A', flexShrink: 0 }}>GHOST</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{ width: 34, height: 34, borderRadius: 17, background: open ? '#0097B2' : '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 13 }}>{initials}</span>
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 42, right: 0,
            background: '#FFFFFF', borderRadius: 16,
            boxShadow: '0 8px 32px rgba(13,27,42,0.18)',
            minWidth: 220, overflow: 'hidden',
            border: '1px solid #E1E8F0',
          }}>
            {/* User info */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #F0F4F8' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userProfile?.full_name || user?.email || 'User'}
              </p>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0', textTransform: 'capitalize' }}>
                {effectiveCompany?.name} · {userProfile?.role ?? 'inspector'}
              </p>
              {impersonatedCompany && (
                <p style={{ fontSize: 10, fontWeight: 700, color: '#C2820A', margin: '4px 0 0' }}>Ghost Mode active</p>
              )}
            </div>

            {/* Nav items */}
            <div style={{ paddingTop: 4, paddingBottom: 4 }}>
              <button onClick={() => nav('/settings')} style={itemStyle}>
                {iconBox('#F0F4F8', <Settings size={15} color="#4A5568" />)}
                <span style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A' }}>Settings</span>
              </button>

              <button onClick={() => nav('/settings/profile')} style={itemStyle}>
                {iconBox('#F0F4F8', <User size={15} color="#4A5568" />)}
                <span style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A' }}>Profile</span>
              </button>

              <button onClick={() => nav('/settings/billing')} style={itemStyle}>
                {iconBox('#E0F7FC', <CreditCard size={15} color="#0097B2" />)}
                <span style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A' }}>Billing & Plan</span>
              </button>

              <button onClick={() => nav('/storage/dispatch')} style={itemStyle}>
                {iconBox(dispatchEnabled === false ? '#F0F4F8' : '#E0F7FC', <Send size={15} color={dispatchEnabled === false ? '#94A3B8' : '#0097B2'} />)}
                <span style={{ fontSize: 14, fontWeight: 500, color: dispatchEnabled === false ? '#94A3B8' : '#0D1B2A', flex: 1 }}>Dispatch</span>
                {dispatchEnabled === false && <Lock size={13} color="#CBD5E1" style={{ flexShrink: 0 }} />}
              </button>

              <button onClick={() => nav('/lot-billing')} style={itemStyle}>
                {iconBox(lotBillingEnabled === false ? '#F0F4F8' : '#F0FDF4', <DollarSign size={15} color={lotBillingEnabled === false ? '#94A3B8' : '#059669'} />)}
                <span style={{ fontSize: 14, fontWeight: 500, color: lotBillingEnabled === false ? '#94A3B8' : '#0D1B2A', flex: 1 }}>Lot Billing</span>
                {lotBillingEnabled === false && <Lock size={13} color="#CBD5E1" style={{ flexShrink: 0 }} />}
              </button>

              {isAdmin && (
                <button onClick={() => nav('/settings/branding')} style={itemStyle}>
                  {iconBox('#EDE9FE', <Palette size={15} color="#7C3AED" />)}
                  <span style={{ fontSize: 14, fontWeight: 500, color: whiteLabelEnabled === false ? '#94A3B8' : '#0D1B2A', flex: 1 }}>Branding</span>
                  {whiteLabelEnabled === false && <Lock size={13} color="#CBD5E1" style={{ flexShrink: 0 }} />}
                </button>
              )}

              {isAdmin && (
                <button onClick={() => nav('/settings/members')} style={itemStyle}>
                  {iconBox('#FEF3C7', <Users size={15} color="#D97706" />)}
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A' }}>Team Members</span>
                </button>
              )}

              {isSuperAdmin && (
                <button onClick={() => nav('/admin/overview')} style={itemStyle}>
                  {iconBox('#FEE2E2', <Shield size={15} color="#DC2626" />)}
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#0D1B2A' }}>Admin Center</span>
                </button>
              )}
            </div>

            {/* Sign out */}
            <div style={{ borderTop: '1px solid #F0F4F8', padding: '4px 0 8px' }}>
              <button
                onClick={async () => { setOpen(false); await signOut(); router.replace('/') }}
                style={{ ...itemStyle }}>
                {iconBox('#FEE2E2', <LogOut size={15} color="#EF4444" />)}
                <span style={{ fontSize: 14, fontWeight: 500, color: '#EF4444' }}>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

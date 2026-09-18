'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Home, Car, Plus, LayoutGrid, ClipboardList, Lock, Settings } from 'lucide-react'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import { usePlan } from '@/hooks/use-plan'
import { usePrefetch } from '@/hooks/use-prefetch'

// NavTab kept for backward-compat imports
export type NavTab = 'home' | 'vehicles' | 'dispatch' | 'account'

interface BottomNavProps {
  onStartPress?: () => void
}

export default function BottomNav({ onStartPress: _onStartPress }: BottomNavProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const pathname = usePathname()
  const router = useRouter()
  const lotMapEnabled = useFeatureFlag('lot_map')
  const { plan } = usePlan()
  // A tab is warmed on touch-down, before the tap completes.
  const prefetch = usePrefetch()

  if (isDesktop) return null

  const isActive = (route: string) =>
    route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(route + '/')

  // Pay Per Use has no vehicle list to add from, so its center button starts an
  // inspection on the home screen instead.
  const handleCenter = () => router.push(plan.hasPlatform ? '/vehicles?add=true' : '/?start=1')

  const tabBtn = (id: string, Icon: React.ElementType, label: string, route: string, locked = false) => {
    const active = isActive(route)
    return (
      <button key={id} onClick={() => router.push(route)} {...prefetch(route)}
        style={{
          flex: 1, height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <Icon size={22} color={locked ? '#D1D5DB' : active ? '#00B4D8' : '#6B7280'} strokeWidth={active && !locked ? 2.5 : 2} />
          {locked && (
            <Lock size={10} color="#9CA3AF" style={{ position: 'absolute', bottom: -2, right: -3 }} />
          )}
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: locked ? '#D1D5DB' : active ? '#00B4D8' : '#6B7280', lineHeight: 1 }}>
          {label}
        </span>
      </button>
    )
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#FFFFFF',
        borderTop: '1px solid #D1D5DB',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -1px 12px rgba(17,24,39,0.08)',
      }}>
        <div style={{ display: 'flex', height: 64, position: 'relative' }}>
          {/* Left tabs */}
          <div style={{ flex: 1, display: 'flex' }}>
            {plan.hasPlatform
              ? <>{tabBtn('home', Home, 'Home', '/')}{tabBtn('vehicles', Car, 'Vehicles', '/vehicles')}</>
              : tabBtn('inspections', ClipboardList, 'Inspections', '/')}
          </div>

          {/* Center FAB */}
          <div style={{ width: 72, flexShrink: 0, position: 'relative' }}>
            <button
              onClick={handleCenter}
              style={{
                position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', zIndex: 51,
                width: 56, height: 56, borderRadius: '50%',
                background: '#00B4D8',
                boxShadow: '0 4px 16px rgba(0,180,216,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer',
              }}
              aria-label={plan.hasPlatform ? 'Add Vehicle' : 'Start Inspection'}
            >
              <Plus size={26} color="#FFFFFF" strokeWidth={2.5} />
            </button>
          </div>

          {/* Right tabs */}
          <div style={{ flex: 1, display: 'flex' }}>
            {plan.hasPlatform
              ? <>{tabBtn('lot', LayoutGrid, 'Lot', '/lot', lotMapEnabled === false)}{tabBtn('inspections', ClipboardList, 'Inspections', '/inspections')}</>
              : tabBtn('settings', Settings, 'Settings', '/settings')}
          </div>
        </div>
      </div>

    </>
  )
}

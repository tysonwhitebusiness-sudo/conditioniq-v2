'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Car, Plus, Send, LayoutGrid, DollarSign } from 'lucide-react'
import { useMediaQuery } from '@/hooks/use-media-query'
import StartInspectionSheet from '@/components/ui/start-inspection-sheet'
import { useFeatureFlag } from '@/hooks/use-feature-flag'

// NavTab kept for backward-compat imports
export type NavTab = 'home' | 'vehicles' | 'dispatch' | 'account'

interface BottomNavProps {
  onStartPress?: () => void
}

const BASE_LEFT_TABS = [
  { id: 'home',     icon: Home, label: 'Home',     route: '/' },
  { id: 'vehicles', icon: Car,  label: 'Vehicles', route: '/vehicles' },
]
const BASE_RIGHT_TABS = [
  { id: 'dispatch', icon: Send, label: 'Dispatch', route: '/storage/dispatch' },
]

export default function BottomNav({ onStartPress }: BottomNavProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const pathname = usePathname()
  const router = useRouter()
  const [showStartSheet, setShowStartSheet] = useState(false)
  const lotMapEnabled = useFeatureFlag('lot_map')
  const dispatchEnabled = useFeatureFlag('dispatch')

  if (isDesktop) return null

  const LEFT_TABS = BASE_LEFT_TABS
  const RIGHT_TABS = [
    ...(lotMapEnabled ? [{ id: 'lot', icon: LayoutGrid, label: 'Lot', route: '/lot' }] : []),
    ...(lotMapEnabled ? [{ id: 'lot-billing', icon: DollarSign, label: 'Lot Billing', route: '/lot-billing' }] : []),
    ...(dispatchEnabled ? BASE_RIGHT_TABS : []),
  ]

  const isActive = (route: string) =>
    route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(route + '/')

  const handleCenter = () => {
    if (onStartPress) onStartPress()
    else setShowStartSheet(true)
  }

  const tabBtn = (id: string, Icon: any, label: string, route: string) => {
    const active = isActive(route)
    return (
      <button key={id} onClick={() => router.push(route)}
        style={{
          flex: 1, height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}>
        <Icon size={22} color={active ? '#00B4D8' : 'rgba(255,255,255,0.4)'} strokeWidth={active ? 2.5 : 2} />
        <span style={{ fontSize: 10, fontWeight: 600, color: active ? '#00B4D8' : 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
          {label}
        </span>
      </button>
    )
  }

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#0D1B2A',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        boxShadow: '0 -2px 12px rgba(13,27,42,0.15)',
      }}>
        <div style={{ display: 'flex', height: 64, position: 'relative' }}>
          {/* Left tabs — flex group so they share space evenly */}
          <div style={{ flex: 1, display: 'flex' }}>
            {LEFT_TABS.map(({ id, icon, label, route }) => tabBtn(id, icon, label, route))}
          </div>

          {/* Center FAB — fixed width so it's always at the exact midpoint */}
          <div style={{ width: 72, flexShrink: 0, position: 'relative' }}>
            <button
              onClick={handleCenter}
              style={{
                position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', zIndex: 51,
                width: 56, height: 56, borderRadius: '50%',
                background: '#F4A62A',
                boxShadow: '0 4px 16px rgba(244,166,42,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: 'none', cursor: 'pointer',
              }}
              aria-label="New Inspection"
            >
              <Plus size={26} color="#0D1B2A" strokeWidth={2.5} />
            </button>
          </div>

          {/* Right tabs — flex group so they share space evenly */}
          <div style={{ flex: 1, display: 'flex' }}>
            {RIGHT_TABS.map(({ id, icon, label, route }) => tabBtn(id, icon, label, route))}
          </div>
        </div>
      </div>

      <StartInspectionSheet open={showStartSheet} onClose={() => setShowStartSheet(false)} />
    </>
  )
}

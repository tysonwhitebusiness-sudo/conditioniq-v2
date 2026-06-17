'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Car, Plus, LayoutGrid, DollarSign, Lock } from 'lucide-react'
import { useMediaQuery } from '@/hooks/use-media-query'
import StartInspectionSheet from '@/components/ui/start-inspection-sheet'
import { useFeatureFlag } from '@/hooks/use-feature-flag'

// NavTab kept for backward-compat imports
export type NavTab = 'home' | 'vehicles' | 'dispatch' | 'account'

interface BottomNavProps {
  onStartPress?: () => void
}

export default function BottomNav({ onStartPress }: BottomNavProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const pathname = usePathname()
  const router = useRouter()
  const [showStartSheet, setShowStartSheet] = useState(false)
  const lotMapEnabled = useFeatureFlag('lot_map')
  const lotBillingEnabled = useFeatureFlag('lot_billing')

  if (isDesktop) return null

  const isActive = (route: string) =>
    route === '/' ? pathname === '/' : pathname === route || pathname.startsWith(route + '/')

  const handleCenter = () => {
    if (onStartPress) onStartPress()
    else setShowStartSheet(true)
  }

  const tabBtn = (id: string, Icon: React.ElementType, label: string, route: string, locked = false) => {
    const active = isActive(route)
    return (
      <button key={id} onClick={() => router.push(route)}
        style={{
          flex: 1, height: '100%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
        }}>
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <Icon size={22} color={locked ? 'rgba(255,255,255,0.25)' : active ? '#00B4D8' : 'rgba(255,255,255,0.4)'} strokeWidth={active && !locked ? 2.5 : 2} />
          {locked && (
            <Lock size={10} color="rgba(255,255,255,0.45)" style={{ position: 'absolute', bottom: -2, right: -3 }} />
          )}
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: locked ? 'rgba(255,255,255,0.25)' : active ? '#00B4D8' : 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
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
          {/* Left tabs */}
          <div style={{ flex: 1, display: 'flex' }}>
            {tabBtn('home', Home, 'Home', '/')}
            {tabBtn('vehicles', Car, 'Vehicles', '/vehicles')}
          </div>

          {/* Center FAB */}
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

          {/* Right tabs — fixed: Lot + Lot Billing */}
          <div style={{ flex: 1, display: 'flex' }}>
            {tabBtn('lot', LayoutGrid, 'Lot', '/lot', lotMapEnabled === false)}
            {tabBtn('lot-billing', DollarSign, 'Lot Billing', '/lot-billing', lotBillingEnabled === false)}
          </div>
        </div>
      </div>

      <StartInspectionSheet open={showStartSheet} onClose={() => setShowStartSheet(false)} />
    </>
  )
}

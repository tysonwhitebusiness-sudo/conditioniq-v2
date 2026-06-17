'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { useMediaQuery } from '@/hooks/use-media-query'
import DesktopSidebar from '@/components/layout/desktop-sidebar'
import DesktopTopBar from '@/components/layout/desktop-topbar'
import StartInspectionSheet from '@/components/ui/start-inspection-sheet'
import FeedbackButton from '@/components/ui/feedback-button'

const PAGE_TITLES: Record<string, string> = {
  '/vehicles': 'Vehicles',
  '/inventory': 'Vehicle Detail',
  '/storage/inventory': 'Vehicle Inventory',
  '/storage/dispatch': 'Dispatch',
  '/storage/locations': 'Locations',
  '/fleet': 'Fleet Dashboard',
  '/fleet/dispatch': 'Fleet Dispatch',
  '/fleet/inventory': 'Fleet Inventory',
  '/fleet/reports': 'Fleet Reports',
  '/account': 'My Profile',
  '/profile': 'My Profile',
  '/billing': 'Billing',
  '/admin/overview': 'Admin Center',
  '/admin/customers': 'Customers',
  '/admin/crm': 'CRM',
  '/admin/users': 'Users & Roles',
  '/settings': 'Settings',
  '/settings/profile': 'Profile',
  '/settings/billing': 'Billing & Plan',
  '/settings/branding': 'Branding',
  '/settings/lot-billing': 'Lot Billing',
  '/lot-billing': 'Lot Billing',
  '/settings/members': 'Team Members',
  '/lot': 'Lot Map',
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showStartSheet, setShowStartSheet] = useState(false)

  const pageTitle = Object.entries(PAGE_TITLES).find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1] ?? 'Condition IQ'
  const sidebarWidth = sidebarCollapsed ? 64 : 256

  if (!isDesktop) return <>{children}<FeedbackButton /></>

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F4F8' }}>
      <DesktopSidebar
        onStartPress={() => setShowStartSheet(true)}
        collapsed={sidebarCollapsed}
        onCollapseChange={setSidebarCollapsed}
      />
      <div style={{ marginLeft: sidebarWidth, flex: 1, display: 'flex', flexDirection: 'column', transition: 'margin-left 200ms ease' }}>
        <DesktopTopBar pageTitle={pageTitle} sidebarWidth={sidebarWidth} />
        <main style={{ paddingTop: 64, flex: 1, minHeight: '100vh' }}>
          {children}
        </main>
      </div>
      <StartInspectionSheet open={showStartSheet} onClose={() => setShowStartSheet(false)} />
      <FeedbackButton />
    </div>
  )
}

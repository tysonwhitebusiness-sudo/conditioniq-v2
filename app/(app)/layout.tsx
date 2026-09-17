'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useAuth } from '@/contexts/auth-context'
import { getPlan, isPlatformRoute } from '@/lib/pricing'
import DesktopSidebar from '@/components/layout/desktop-sidebar'
import DesktopTopBar from '@/components/layout/desktop-topbar'
import FeedbackButton from '@/components/ui/feedback-button'

const PAGE_TITLES: Record<string, string> = {
  '/vehicles': 'Vehicles',
  '/inventory': 'Vehicle Detail',
  '/storage/inventory': 'Vehicle Inventory',
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
  '/inspections': 'Inspections',
}

// Pay Per Use has no lot platform, and its home screen is the inspections list,
// so the lot routes and the standalone /inspections page send it to '/'. This is
// route blocking only (decision 1a): the database rules are unchanged.
function isInspectionsRoute(pathname: string): boolean {
  return pathname === '/inspections' || pathname.startsWith('/inspections/')
}

function usePlatformRedirect(): boolean {
  const pathname = usePathname()
  const router = useRouter()
  const { effectiveCompany, loading } = useAuth()

  const guarded = isPlatformRoute(pathname) || isInspectionsRoute(pathname)
  const blocked = guarded && !!effectiveCompany && !getPlan(effectiveCompany.subscription_tier).hasPlatform

  useEffect(() => {
    if (!blocked) return
    // Keep the inspections filters and send-link prefill; the home list reads them.
    const query = isInspectionsRoute(pathname) ? window.location.search.slice(1) : ''
    router.replace(query ? `/?${query}` : '/')
  }, [blocked, pathname, router])

  // Render nothing on a guarded route until the plan is known, so a lot page
  // never flashes for an account that is about to be redirected.
  return blocked || (guarded && loading)
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const hold = usePlatformRedirect()

  const pageTitle = Object.entries(PAGE_TITLES).find(([k]) => pathname === k || pathname.startsWith(k + '/'))?.[1] ?? 'Condition IQ'
  const sidebarWidth = sidebarCollapsed ? 64 : 256
  const content = hold ? null : children

  if (!isDesktop) return <>{content}<FeedbackButton /></>

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F4F8' }}>
      <DesktopSidebar
        collapsed={sidebarCollapsed}
        onCollapseChange={setSidebarCollapsed}
      />
      <div style={{ marginLeft: sidebarWidth, flex: 1, display: 'flex', flexDirection: 'column', transition: 'margin-left 200ms ease' }}>
        <DesktopTopBar pageTitle={pageTitle} sidebarWidth={sidebarWidth} />
        <main style={{ paddingTop: 64, flex: 1, minHeight: '100vh' }}>
          {content}
        </main>
      </div>
      <FeedbackButton />
    </div>
  )
}

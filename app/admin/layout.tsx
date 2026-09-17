'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useRouter, usePathname } from 'next/navigation'
import AdminSidebar from '@/components/admin/admin-sidebar'
import AdminTopBar from '@/components/admin/admin-topbar'
import { WHITE, GRAY_100, GRAY_300 } from '@/lib/design-tokens'

// Same white and hairline-card look as the main app (lib/design-tokens).
const ADMIN_CSS = `
  .adm-sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; width: 256px;
    background: ${WHITE}; border-right: 1px solid ${GRAY_300}; z-index: 40;
    display: flex; flex-direction: column; overflow-y: auto;
    transition: transform 0.25s ease;
  }
  .adm-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(15,23,42,0.45); z-index: 39;
  }
  .adm-topbar {
    position: fixed; top: 0; left: 256px; right: 0; height: 60px;
    background: ${WHITE}; z-index: 30;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; border-bottom: 1px solid ${GRAY_300};
  }
  .adm-main { margin-left: 256px; padding-top: 60px; min-height: 100vh; }
  .adm-hamburger { display: none !important; }
  .adm-search { display: flex; }

  /* Page layout helpers. Grids collapse at phone width; wide tables scroll
     sideways inside their card instead of the page. */
  .adm-page { padding: 24px; box-sizing: border-box; width: 100%; }
  .adm-g2  { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .adm-g3  { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .adm-g5  { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); }
  .adm-g6  { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); }
  .adm-g32 { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); }
  .adm-g55 { display: grid; grid-template-columns: minmax(0, 55fr) minmax(0, 45fr); }
  .adm-scroll-x { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
  .adm-wrap { flex-wrap: wrap; }
  .adm-show-mobile { display: none !important; }
  @media (max-width: 1100px) {
    .adm-g5, .adm-g6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  @media (max-width: 767px) {
    .adm-sidebar { transform: translateX(-256px); box-shadow: none; }
    .adm-sidebar.mob-open { transform: translateX(0); box-shadow: 4px 0 24px rgba(15,23,42,0.18); }
    .adm-topbar { padding: 0 16px; }
    .adm-overlay.mob-open { display: block; }
    .adm-topbar { left: 0; }
    .adm-main { margin-left: 0; }
    .adm-hamburger { display: flex !important; }
    .adm-search { display: none !important; }
    .adm-page { padding: 16px; }
    .adm-g2, .adm-g3, .adm-g32, .adm-g55 { grid-template-columns: minmax(0, 1fr); }
    .adm-g5, .adm-g6 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .adm-hide-mobile { display: none !important; }
    .adm-show-mobile { display: block !important; }
    .adm-grow-mobile { flex: 1 1 100% !important; width: 100% !important; }
    /* A side panel becomes a full-screen sheet. */
    .adm-side-panel {
      position: fixed !important; inset: 0 !important; top: 0 !important;
      width: auto !important; max-height: none !important;
      border-radius: 0 !important; z-index: 60;
    }
  }
`

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, platformRole, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Close drawer on route change
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/login')
      else if (platformRole !== 'super_admin') router.replace('/')
    }
  }, [user, platformRole, loading, router])

  if (loading || !user || platformRole !== 'super_admin') return null

  return (
    <div style={{ minHeight: '100vh', background: GRAY_100 }}>
      <style>{ADMIN_CSS}</style>
      <AdminSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
      <AdminTopBar onHamburgerClick={() => setSidebarOpen(true)} />
      <main className="adm-main">
        {children}
      </main>
    </div>
  )
}

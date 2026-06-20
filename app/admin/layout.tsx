'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useRouter, usePathname } from 'next/navigation'
import AdminSidebar from '@/components/admin/admin-sidebar'
import AdminTopBar from '@/components/admin/admin-topbar'

const ADMIN_CSS = `
  .adm-sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; width: 256px;
    background: #1B2D40; z-index: 40;
    display: flex; flex-direction: column; overflow-y: auto;
    transition: transform 0.25s ease;
  }
  .adm-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,0.55); z-index: 39;
  }
  .adm-topbar {
    position: fixed; top: 0; left: 256px; right: 0; height: 60px;
    background: #0D1B2A; z-index: 30;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .adm-main { margin-left: 256px; padding-top: 60px; min-height: 100vh; }
  .adm-hamburger { display: none !important; }
  .adm-search { display: flex; }
  @media (max-width: 767px) {
    .adm-sidebar { transform: translateX(-256px); box-shadow: none; }
    .adm-sidebar.mob-open { transform: translateX(0); box-shadow: 4px 0 24px rgba(0,0,0,0.4); }
    .adm-overlay.mob-open { display: block; }
    .adm-topbar { left: 0; }
    .adm-main { margin-left: 0; }
    .adm-hamburger { display: flex !important; }
    .adm-search { display: none !important; }
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
    <div style={{ minHeight: '100vh', background: '#F0F4F8' }}>
      <style>{ADMIN_CSS}</style>
      <AdminSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />
      <AdminTopBar onHamburgerClick={() => setSidebarOpen(true)} />
      <main className="adm-main">
        {children}
      </main>
    </div>
  )
}

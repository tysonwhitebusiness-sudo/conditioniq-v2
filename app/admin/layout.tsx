'use client'

import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import AdminSidebar from '@/components/admin/admin-sidebar'
import AdminTopBar from '@/components/admin/admin-topbar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, platformRole, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/login')
      else if (platformRole !== 'super_admin') router.replace('/')
    }
  }, [user, platformRole, loading, router])

  if (loading || !user || platformRole !== 'super_admin') return null

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8' }}>
      <AdminSidebar />
      <AdminTopBar />
      <main style={{ marginLeft: 256, paddingTop: 64 }}>
        {children}
      </main>
    </div>
  )
}

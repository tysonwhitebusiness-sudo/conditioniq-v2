'use client'

import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import AdminNav from '@/components/admin/admin-nav'

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
    <div className="min-h-screen bg-[#0f172a]">
      <AdminNav />
      {children}
    </div>
  )
}

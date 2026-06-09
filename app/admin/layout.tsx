'use client'

import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { isOwner } from '@/lib/auth'
import AdminNav from '@/components/admin/admin-nav'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/login')
      else if (!isOwner(user)) router.replace('/')
    }
  }, [user, loading, router])

  if (loading || !user || !isOwner(user)) return null

  return (
    <div className="min-h-screen bg-[#0f172a]">
      <AdminNav />
      {children}
    </div>
  )
}

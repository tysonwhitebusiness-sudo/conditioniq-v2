'use client'

import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import FleetNav from '@/components/fleet/fleet-nav'

export default function FleetLayout({ children }: { children: React.ReactNode }) {
  const { user, company, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (!user) router.replace('/login')
      else if (company && company.account_type !== 'fmc') router.replace('/')
    }
  }, [user, company, loading, router])

  if (loading || !user) return null
  if (company && company.account_type !== 'fmc') return null

  return (
    <div className="min-h-screen bg-gray-50">
      <FleetNav />
      {children}
    </div>
  )
}

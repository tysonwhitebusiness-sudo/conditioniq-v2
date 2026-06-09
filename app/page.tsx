'use client'

import { useAuth } from '@/contexts/auth-context'
import VehicleInspectionApp from '@/components/dashboard/vehicle-inspection-app'
import LandingPage from '@/components/landing/landing-page'

export default function HomePage() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1e3a5f]">
        <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <LandingPage />
  return <VehicleInspectionApp />
}

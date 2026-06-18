'use client'

import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import LotBillingPage from '@/components/settings/lot-billing-page'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import { Lock } from 'lucide-react'
import LoadingOverlay from '@/components/ui/loading-overlay'

export default function LotBillingRoutePage() {
  const { user, loading, isOwnerUser, companyRole } = useAuth()
  const router = useRouter()
  const lotBillingEnabled = useFeatureFlag('lot_billing')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (!loading && user && companyRole !== null && !(isOwnerUser || companyRole === 'admin')) router.replace('/')
  }, [user, loading, isOwnerUser, companyRole, router])

  if (loading || !user) return null
  if (lotBillingEnabled === null) return <LoadingOverlay show fullScreen />
  if (lotBillingEnabled === false) {
    return (
      <>
        <MobilePageHeader />
        <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Lock size={28} color="#94A3B8" />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px', textAlign: 'center' }}>
            Lot Billing is not enabled for your account.
          </h2>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0, textAlign: 'center' }}>
            Contact us to get access.
          </p>
        </div>
        <BottomNav />
      </>
    )
  }
  return <LotBillingPage />
}

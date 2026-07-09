'use client'

import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import LotBillingPage from '@/components/settings/lot-billing-page'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import LockedFeatureNotice from '@/components/ui/locked-feature-notice'
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
        <LockedFeatureNotice featureName="Lot Billing" description="Generate and track storage invoices, log payments, and manage overdue balances." />
        <BottomNav />
      </>
    )
  }
  return <LotBillingPage />
}

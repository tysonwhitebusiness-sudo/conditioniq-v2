'use client'

import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import LotBillingPage from '@/components/settings/lot-billing-page'

export default function LotBillingSettingsPage() {
  const { user, loading, isOwnerUser, companyRole } = useAuth()
  const router = useRouter()
  const lotMapEnabled = useFeatureFlag('lot_map')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (!loading && user && companyRole !== null && !(isOwnerUser || companyRole === 'admin')) router.replace('/')
  }, [user, loading, isOwnerUser, companyRole, router])

  if (loading || !user) return null
  if (lotMapEnabled === false) {
    router.replace('/')
    return null
  }
  return <LotBillingPage />
}

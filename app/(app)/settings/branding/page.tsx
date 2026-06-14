'use client'

import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import BrandingPage from '@/components/settings/branding-page'

export default function BrandingSettingsPage() {
  const { user, loading, isOwnerUser, companyRole } = useAuth()
  const router = useRouter()
  const whiteLabelEnabled = useFeatureFlag('white_label')

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (!loading && user && companyRole !== null && !(isOwnerUser || companyRole === 'admin')) router.replace('/')
  }, [user, loading, isOwnerUser, companyRole, router])

  if (loading || !user) return null
  if (whiteLabelEnabled === false) {
    router.replace('/')
    return null
  }
  return <BrandingPage />
}

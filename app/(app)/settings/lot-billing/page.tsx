'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LotBillingSettingsRedirect() {
  const router = useRouter()
  useEffect(() => { router.replace('/lot-billing') }, [router])
  return null
}

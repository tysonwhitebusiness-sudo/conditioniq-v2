'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { getFeatureFlags } from '@/lib/feature-flags'
import type { FeatureKey } from '@/lib/feature-flags'

export function useFeatureFlag(key: FeatureKey): boolean | null {
  const { effectiveCompany } = useAuth()
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    const id = effectiveCompany?.id
    if (!id) return
    getFeatureFlags(id).then(flags => setEnabled(flags[key]?.enabled ?? false))
  }, [effectiveCompany?.id, key])

  return enabled
}

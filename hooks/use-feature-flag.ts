'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { getFeatureFlags } from '@/lib/feature-flags'
import type { FeatureKey } from '@/lib/feature-flags'

// Module-level cache: survives soft navigations within the same page session.
// Keyed by companyId → { featureKey: enabled }
const flagCache = new Map<string, Partial<Record<FeatureKey, boolean>>>()

export function useFeatureFlag(key: FeatureKey): boolean | null {
  const { effectiveCompany } = useAuth()
  const id = effectiveCompany?.id ?? null

  const [enabled, setEnabled] = useState<boolean | null>(() => {
    if (!id) return null
    const cached = flagCache.get(id)
    return cached ? (cached[key] ?? false) : null
  })

  useEffect(() => {
    if (!id) return
    getFeatureFlags(id).then(flags => {
      const flat: Partial<Record<FeatureKey, boolean>> = {}
      for (const [k, v] of Object.entries(flags) as [FeatureKey, { enabled: boolean }][]) {
        flat[k] = v.enabled
      }
      flagCache.set(id, flat)
      setEnabled(flags[key]?.enabled ?? false)
    })
  }, [id, key])

  return enabled
}

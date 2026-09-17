'use client'

import { useEffect, useState } from 'react'
import { checkUsageState, type UsageState } from '@/lib/usage-actions'

// Usage for chrome that remounts on every navigation (the sidebar meter).
// A short module-level cache stops each page change from re-running the query;
// pages that act on usage, like the start-inspection modal, fetch fresh.
const TTL_MS = 60_000
const cache = new Map<string, { at: number; state: UsageState }>()

export function usePlanUsage(companyId: string | null | undefined): UsageState | null {
  const cached = companyId ? cache.get(companyId) : undefined
  const [state, setState] = useState<UsageState | null>(cached?.state ?? null)

  useEffect(() => {
    if (!companyId) { setState(null); return }
    const hit = cache.get(companyId)
    if (hit && Date.now() - hit.at < TTL_MS) { setState(hit.state); return }

    let cancelled = false
    checkUsageState(companyId)
      .then(next => {
        cache.set(companyId, { at: Date.now(), state: next })
        if (!cancelled) setState(next)
      })
      .catch(() => { /* the meter is informational; leave it hidden on failure */ })
    return () => { cancelled = true }
  }, [companyId])

  return state
}

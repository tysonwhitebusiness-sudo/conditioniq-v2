'use client'

import { useAuth } from '@/contexts/auth-context'
import { getPlan, type Plan } from '@/lib/pricing'

// The signed-in (or impersonated) account's plan, read synchronously from the
// company already in auth context. `ready` is false until that company loads;
// before then the plan resolves to the default and callers that hide or redirect
// on it should wait, so nothing flickers away and back.
export function usePlan(): { plan: Plan; ready: boolean } {
  const { effectiveCompany, loading } = useAuth()
  return {
    plan: getPlan(effectiveCompany?.subscription_tier),
    ready: !loading && !!effectiveCompany,
  }
}

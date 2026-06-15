'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type { CompanyRole } from '@/lib/roles'

/**
 * Fetch the authenticated user's role within a company, bypassing RLS.
 * Called from the auth context browser client where the anon-key RLS policy
 * on company_members blocks the SELECT, causing companyRole to silently stay null.
 */
export async function getUserCompanyRole(
  userId: string,
  companyId: string,
): Promise<CompanyRole | null> {
  if (!userId || !companyId) return null
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('company_members')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle()
  return (data?.role as CompanyRole) ?? null
}

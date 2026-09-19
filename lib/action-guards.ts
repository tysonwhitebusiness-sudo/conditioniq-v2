import { createClient } from '@/lib/supabase/server'
import { authorizeCompanyAccess } from '@/lib/inspection-auth'
import { isPlatformAdmin } from '@/lib/ai/admin-auth'

if (typeof window !== 'undefined') throw new Error('lib/action-guards is server-only')

// Checks for server actions that use the service role. A 'use server' export
// can be called by anyone who has its action id (it ships in the page's
// JavaScript), so an action that reads or writes with the admin client must
// check the caller itself. Each throws when the caller may not proceed.

export async function requireUser(): Promise<string> {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) throw new Error('Sign in required')
  return user.id
}

/** Staff of the company, or a platform owner or admin. */
export async function requireCompanyAccess(companyId: string): Promise<void> {
  if (!companyId || !(await authorizeCompanyAccess(companyId))) throw new Error('Not authorized for this account')
}

/** The platform owner or a platform admin. Returns their user id. */
export async function requirePlatformAdmin(): Promise<string> {
  const userId = await requireUser()
  if (!(await isPlatformAdmin())) throw new Error('Platform admins only')
  return userId
}

/** The signed-in user acting on their own record, or a platform admin. */
export async function requireSelfOrPlatformAdmin(userId: string): Promise<void> {
  const me = await requireUser()
  if (me !== userId && !(await isPlatformAdmin())) throw new Error('Not authorized')
}

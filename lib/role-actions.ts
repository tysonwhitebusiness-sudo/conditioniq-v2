'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserCompanyRole } from './auth-server-actions'
import type { PlatformRole, CompanyRole } from '@/lib/roles'

// ── Authorization guard ───────────────────────────────────────────────────────
// company_members' members_update/members_delete RLS policies only check the
// caller's company_id membership, not their role within it — so this in-code
// check is load-bearing, not defense-in-depth on top of an already-strict policy.

async function assertCallerIsCompanyAdmin(companyId: string): Promise<void> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: isPlatformOwner } = await supabase.rpc('is_platform_owner')
  if (isPlatformOwner) return

  const role = await getUserCompanyRole(user.id, companyId)
  if (role !== 'admin' && role !== 'owner') {
    throw new Error('Not authorized to manage company members.')
  }
}

// ── Super admin: list all users ───────────────────────────────────────────────

export async function getAllUsers() {
  const supabase = createClient()
  const { data } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, platform_role, company_id, created_at, companies:company_id(name)')
    .order('created_at', { ascending: false })
  return data ?? []
}

// ── Super admin: change platform role ────────────────────────────────────────

export async function updatePlatformRole(userId: string, role: PlatformRole) {
  const supabase = createClient()
  const { error } = await supabase
    .from('user_profiles')
    .update({ platform_role: role })
    .eq('id', userId)
  if (error) throw error
}

// ── Company members ───────────────────────────────────────────────────────────

export async function getCompanyMembers(companyId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('company_members')
    .select('id, role, created_at, user_id, user:user_profiles!user_id(full_name, email, platform_role)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function addCompanyMember(
  companyId: string,
  email: string,
  role: CompanyRole,
  invitedBy: string,
): Promise<{ error?: string }> {
  try {
    await assertCallerIsCompanyAdmin(companyId)
  } catch (e: any) {
    return { error: e.message }
  }

  const supabase = createClient()

  // Find user by email
  const { data: profile, error: lookupError } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (lookupError) return { error: `Lookup failed: ${lookupError.message}` }
  if (!profile) return { error: 'No account found with that email. They must sign up first.' }

  const { error } = await supabase
    .from('company_members')
    .upsert(
      { company_id: companyId, user_id: profile.id, role, invited_by: invitedBy },
      { onConflict: 'company_id,user_id' },
    )
  if (error) return { error: error.message }
  return {}
}

export async function updateCompanyMemberRole(memberId: string, role: CompanyRole) {
  if (role !== 'admin' && role !== 'inspector') throw new Error('Invalid role.')

  const admin = createAdminClient()
  const { data: current } = await admin.from('company_members').select('role, company_id').eq('id', memberId).maybeSingle()
  if (!current) throw new Error('Member not found.')
  if (current.role === 'owner') throw new Error('The account owner role cannot be changed.')

  await assertCallerIsCompanyAdmin(current.company_id)

  const supabase = createClient()
  const { error } = await supabase
    .from('company_members')
    .update({ role })
    .eq('id', memberId)
  if (error) throw error
}

export async function removeCompanyMember(memberId: string) {
  const admin = createAdminClient()
  const { data: current } = await admin.from('company_members').select('role, company_id').eq('id', memberId).maybeSingle()
  if (!current) throw new Error('Member not found.')
  if (current.role === 'owner') throw new Error('The account owner cannot be removed.')

  await assertCallerIsCompanyAdmin(current.company_id)

  const supabase = createClient()
  const { error } = await supabase
    .from('company_members')
    .delete()
    .eq('id', memberId)
  if (error) throw error
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserCompanyRole } from './auth-server-actions'
import type { PlatformRole, CompanyRole } from '@/lib/roles'
import { getDefaultMemberCap } from '@/lib/pricing'

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

// Seat limits were stored (team_members.config.cap, set from the admin screen)
// and shown on the billing page, but never checked here. An admin-set cap wins
// over the plan's default; null means unlimited. Someone who is already a
// member is exempt, because the upsert below also serves as a role change.
async function checkSeatAvailable(companyId: string, userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const [{ data: existing }, { count }, { data: company }, { data: capFlag }] = await Promise.all([
    admin.from('company_members').select('id').eq('company_id', companyId).eq('user_id', userId).maybeSingle(),
    admin.from('company_members').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    admin.from('companies').select('subscription_tier').eq('id', companyId).maybeSingle(),
    admin.from('company_feature_flags').select('config').eq('company_id', companyId).eq('feature_key', 'team_members').maybeSingle(),
  ])
  if (existing) return null

  const overrideCap = (capFlag?.config as { cap?: number } | null)?.cap
  const cap = typeof overrideCap === 'number' ? overrideCap : getDefaultMemberCap(company?.subscription_tier)
  if (cap === null) return null

  if ((count ?? 0) >= cap) {
    return `Your plan includes ${cap} seat${cap === 1 ? '' : 's'}, and all are in use. Remove a member or upgrade your plan to add another.`
  }
  return null
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

  const seatError = await checkSeatAvailable(companyId, profile.id)
  if (seatError) return { error: seatError }

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

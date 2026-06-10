'use server'

import { createClient } from '@/lib/supabase/server'
import type { PlatformRole, CompanyRole } from '@/lib/roles'

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

export async function addCompanyMember(companyId: string, email: string, role: CompanyRole, invitedBy: string) {
  const supabase = createClient()

  // Find user by email
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (!profile) throw new Error('No account found with that email. They must sign up first.')

  const { error } = await supabase
    .from('company_members')
    .upsert({ company_id: companyId, user_id: profile.id, role, invited_by: invitedBy }, { onConflict: 'company_id,user_id' })
  if (error) throw error
}

export async function updateCompanyMemberRole(memberId: string, role: CompanyRole) {
  const supabase = createClient()
  const { error } = await supabase
    .from('company_members')
    .update({ role })
    .eq('id', memberId)
  if (error) throw error
}

export async function removeCompanyMember(memberId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('company_members')
    .delete()
    .eq('id', memberId)
  if (error) throw error
}

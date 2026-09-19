'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { currentUserId, isPlatformAdmin } from './admin-auth'

// A · The account's AI switch and the platform kill switch.
//
// Reading the account switch is open to anyone in the company; changing it
// needs the company's owner or an admin. The kill switch is for platform
// admins only. All writes go through the service role after the check here.

async function isCompanyAdmin(userId: string, companyId: string): Promise<boolean> {
  const { data } = await createAdminClient()
    .from('company_members').select('role').eq('user_id', userId).eq('company_id', companyId).maybeSingle()
  return data?.role === 'owner' || data?.role === 'admin'
}

export async function getCompanyAiEnabled(companyId: string): Promise<boolean | null> {
  const userId = await currentUserId()
  if (!userId || !companyId) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('user_profiles').select('company_id').eq('id', userId).maybeSingle()
  if (profile?.company_id !== companyId && !(await isPlatformAdmin())) return null
  const { data } = await admin.from('companies').select('ai_enabled').eq('id', companyId).maybeSingle()
  return data ? data.ai_enabled !== false : null
}

export async function setCompanyAiEnabled(companyId: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> {
  const userId = await currentUserId()
  if (!userId) return { ok: false, error: 'Not signed in' }
  if (!(await isCompanyAdmin(userId, companyId)) && !(await isPlatformAdmin())) return { ok: false, error: 'Only an account admin can change this' }
  const { error } = await createAdminClient().from('companies').update({ ai_enabled: enabled }).eq('id', companyId)
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Whether the server has an Anthropic key. Says only yes or no; the key never leaves the server. */
export async function getAiKeyConfigured(): Promise<boolean | null> {
  if (!(await isPlatformAdmin())) return null
  return !!process.env.ANTHROPIC_API_KEY?.trim()
}

export async function getAiKillSwitch(): Promise<boolean | null> {
  if (!(await isPlatformAdmin())) return null
  const { data } = await createAdminClient().from('ai_settings').select('kill_switch').maybeSingle()
  return data?.kill_switch ?? false
}

export async function setAiKillSwitch(on: boolean): Promise<{ ok: boolean; error?: string }> {
  const userId = await currentUserId()
  if (!userId || !(await isPlatformAdmin())) return { ok: false, error: 'Platform admins only' }
  const { error } = await createAdminClient().from('ai_settings')
    .update({ kill_switch: on, updated_at: new Date().toISOString(), updated_by: userId }).eq('id', true)
  return error ? { ok: false, error: error.message } : { ok: true }
}

'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import { requireSuperAdmin } from '@/lib/admin-actions'
import { authorizeCompanyAccess } from '@/lib/inspection-auth'
import { captureSecurityEvent } from '@/lib/sentry'

const MAX_SUBMISSIONS_PER_WINDOW = 5
const WINDOW_HOURS = 1

export async function submitContactRequest(data: {
  name: string
  email: string
  company_name: string
  company_type: string
  message?: string
}) {
  const supabase = createAdminClient()

  const headersList = headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim()
    ?? headersList.get('x-real-ip')
    ?? 'unknown'

  const windowStart = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('contact_requests')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .gte('created_at', windowStart)

  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_WINDOW) {
    const err = new Error('submitContactRequest: rate limit exceeded')
    captureSecurityEvent(err, 'medium', { ip, reason: 'rate_limited' }, ip)
    throw err
  }

  const { error } = await supabase.from('contact_requests').insert({
    name: data.name,
    email: data.email,
    company_name: data.company_name,
    company_type: data.company_type,
    message: data.message ?? null,
    source: 'landing_page',
    status: 'new',
    ip_address: ip,
  })
  if (error) throw new Error(error.message)
}

export async function getContactRequests() {
  await requireSuperAdmin()
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('contact_requests')
    .select('*')
    .eq('source', 'landing_page')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data ?? []
}

export async function updateContactRequestStatus(id: string, status: string) {
  await requireSuperAdmin()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('contact_requests')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function submitUpgradeRequest({
  companyId,
  companyName,
  name,
  email,
  currentPlan,
  targetPlan,
}: {
  companyId: string
  companyName: string
  name: string
  email: string
  currentPlan: string
  targetPlan: string
}): Promise<{ error: string | null }> {
  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) return { error: 'Not authorized' }

  const supabase = createAdminClient()
  const { error } = await supabase.from('contact_requests').insert({
    name,
    email,
    company: companyId,
    company_name: companyName,
    message: `Upgrade request: ${currentPlan} → ${targetPlan}`,
    plan_interest: targetPlan,
    source: 'upgrade_request',
    status: 'new',
  })
  if (error) return { error: error.message }
  return { error: null }
}

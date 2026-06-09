'use server'

import { createClient } from '@/lib/supabase/server'

export async function getCRMLeads(filters?: {
  status?: string
  company_type?: string
  email_status?: string
  li_connection_status?: string
  search?: string
  limit?: number
  offset?: number
}) {
  const supabase = createClient()
  let q = supabase.from('crm_leads').select('*', { count: 'exact' })

  if (filters?.status) q = q.eq('status', filters.status)
  if (filters?.company_type) q = q.eq('company_type', filters.company_type)
  if (filters?.email_status) q = q.eq('email_status', filters.email_status)
  if (filters?.li_connection_status) q = q.eq('li_connection_status', filters.li_connection_status)
  if (filters?.search) {
    q = q.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,company.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)
  }

  q = q.order('pinned', { ascending: false }).order('created_at', { ascending: true })

  if (filters?.limit) q = q.limit(filters.limit)
  if (filters?.offset) q = q.range(filters.offset, (filters.offset ?? 0) + (filters.limit ?? 50) - 1)

  const { data, count, error } = await q
  if (error) throw error
  return { leads: data ?? [], total: count ?? 0 }
}

export async function getCRMLead(id: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('crm_leads')
    .select(`*, crm_email_touches(*), crm_notes(*), crm_activity_log(*)`)
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function upsertCRMLead(lead: Record<string, any>) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('crm_leads')
    .upsert({ ...lead, updated_at: new Date().toISOString() })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateLeadStatus(id: string, status: string) {
  const supabase = createClient()
  await supabase
    .from('crm_leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function markEmailSent({
  leadId,
  touchNumber,
  subject,
  body,
}: {
  leadId: string
  touchNumber: number
  subject: string
  body: string
}) {
  const supabase = createClient()
  const now = new Date().toISOString()

  await Promise.all([
    supabase.from('crm_email_touches').insert({ lead_id: leadId, touch_number: touchNumber, subject, body, sent_at: now }),
    supabase.from('crm_activity_log').insert({ lead_id: leadId, activity_type: 'email_sent', description: `Touch ${touchNumber}: ${subject}` }),
    supabase.from('crm_leads').update({ status: 'contacted', updated_at: now }).eq('id', leadId).eq('status', 'new'),
  ])

  const today = new Date().toISOString().split('T')[0]
  const { data: existing } = await supabase.from('crm_daily_goals').select('id, emails_sent').eq('date', today).single()
  if (existing) {
    await supabase.from('crm_daily_goals').update({ emails_sent: existing.emails_sent + 1 }).eq('id', existing.id)
  } else {
    await supabase.from('crm_daily_goals').insert({ date: today, emails_sent: 1 })
  }
}

export async function addCRMNote(leadId: string, note: string) {
  const supabase = createClient()
  await Promise.all([
    supabase.from('crm_notes').insert({ lead_id: leadId, note }),
    supabase.from('crm_activity_log').insert({ lead_id: leadId, activity_type: 'note_added', description: note.slice(0, 80) }),
  ])
}

export async function updateLinkedInStatus(leadId: string, status: string) {
  const supabase = createClient()
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('crm_leads').update({ li_connection_status: status, li_connection_date: now.split('T')[0], updated_at: now }).eq('id', leadId),
    supabase.from('crm_activity_log').insert({ lead_id: leadId, activity_type: 'linkedin_status_changed', description: `LinkedIn: ${status}` }),
  ])
}

export async function getCRMDashboardStats() {
  const supabase = createClient()
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [emailsWeek, emailsMonth, replies, converted, goals] = await Promise.all([
    supabase.from('crm_email_touches').select('id', { count: 'exact', head: true }).gte('sent_at', weekAgo),
    supabase.from('crm_email_touches').select('id', { count: 'exact', head: true }).gte('sent_at', monthAgo),
    supabase.from('crm_email_touches').select('id', { count: 'exact', head: true }).eq('replied', true),
    supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('status', 'converted'),
    supabase.from('crm_daily_goals').select('*').order('date', { ascending: false }).limit(8),
  ])

  const totalSent = emailsMonth.count ?? 0
  const totalReplied = replies.count ?? 0
  const replyRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0

  return {
    emailsThisWeek: emailsWeek.count ?? 0,
    emailsThisMonth: totalSent,
    replyRate,
    totalConverted: converted.count ?? 0,
    weeklyGoals: goals.data ?? [],
  }
}

export async function bulkImportLeads(leads: Record<string, any>[]): Promise<{ imported: number; skipped: number }> {
  const supabase = createClient()
  let imported = 0
  let skipped = 0

  for (const lead of leads) {
    const { error } = await supabase
      .from('crm_leads')
      .upsert({
        ...lead,
        email_status: lead.email_status ?? 'unverified',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'email', ignoreDuplicates: false })
    if (error) skipped++
    else imported++
  }

  return { imported, skipped }
}

export async function getTodayGoals() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('crm_daily_goals').select('*').eq('date', today).single()
  return data ?? { emails_sent: 0, calls_made: 0, linkedin_requests: 0, email_goal: 25, call_goal: 10, linkedin_goal: 15 }
}

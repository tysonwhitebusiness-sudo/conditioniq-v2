'use server'

import { createClient } from '@/lib/supabase/server'

export async function getCRMLeads(filters?: {
  status?: string; company_type?: string; email_status?: string
  li_connection_status?: string; search?: string; limit?: number; offset?: number
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
    .select('*, crm_email_touches(*), crm_notes(*), crm_activity_log(*)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function getQueueLeads() {
  const supabase = createClient()
  const { data } = await supabase
    .from('crm_leads')
    .select(`id, first_name, last_name, email, company, job_title, company_type, priority, pinned, status, created_at, updated_at,
      crm_email_touches(id, touch_number, sent_at, replied)`)
    .not('status', 'in', '(converted,not_interested,archived)')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function getPipelineLeads() {
  const supabase = createClient()
  const { data } = await supabase
    .from('crm_leads')
    .select('id, first_name, last_name, company, company_type, priority, status, updated_at, created_at')
    .not('status', 'eq', 'archived')
    .order('updated_at', { ascending: false })
  return data ?? []
}

export async function upsertCRMLead(lead: Record<string, unknown>) {
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
  await supabase.from('crm_leads').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
}

export async function updateLeadStatusAndLog(leadId: string, newStatus: string, oldStatus: string) {
  const supabase = createClient()
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('crm_leads').update({ status: newStatus, updated_at: now }).eq('id', leadId),
    supabase.from('crm_activity_log').insert({ lead_id: leadId, activity_type: 'status_changed', description: `Status: ${oldStatus} → ${newStatus}` }),
  ])
}

export async function updateLeadField(leadId: string, field: string, value: unknown) {
  const supabase = createClient()
  await supabase.from('crm_leads').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', leadId)
}

export async function updateLeadPin(leadId: string, pinned: boolean) {
  const supabase = createClient()
  await supabase.from('crm_leads').update({ pinned, updated_at: new Date().toISOString() }).eq('id', leadId)
}

export async function markEmailSent({ leadId, touchNumber, subject, body }: { leadId: string; touchNumber: number; subject: string; body: string }) {
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

export async function deleteCRMNote(noteId: string) {
  const supabase = createClient()
  await supabase.from('crm_notes').delete().eq('id', noteId)
}

export async function updateLinkedInStatus(leadId: string, status: string) {
  const supabase = createClient()
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('crm_leads').update({ li_connection_status: status, li_connection_date: now.split('T')[0], updated_at: now }).eq('id', leadId),
    supabase.from('crm_activity_log').insert({ lead_id: leadId, activity_type: 'linkedin_status_changed', description: `LinkedIn: ${status}` }),
  ])
}

export async function logLinkedInRequest(leadId: string) {
  const supabase = createClient()
  const now = new Date().toISOString()
  await Promise.all([
    supabase.from('crm_leads').update({ li_connection_status: 'requested', li_connection_date: now.split('T')[0], updated_at: now }).eq('id', leadId),
    supabase.from('crm_activity_log').insert({ lead_id: leadId, activity_type: 'linkedin_request', description: 'LinkedIn connection request sent' }),
  ])
  await incrementDailyGoal('linkedin_requests')
}

export async function getTodayGoals() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('crm_daily_goals').select('*').eq('date', today).single()
  return data ?? { emails_sent: 0, calls_made: 0, linkedin_requests: 0, email_goal: 25, call_goal: 10, linkedin_goal: 15 }
}

export async function updateGoalTargets(date: string, targets: { email_goal?: number; call_goal?: number; linkedin_goal?: number }) {
  const supabase = createClient()
  const { data: existing } = await supabase.from('crm_daily_goals').select('id').eq('date', date).single()
  if (existing) {
    await supabase.from('crm_daily_goals').update(targets).eq('date', date)
  } else {
    await supabase.from('crm_daily_goals').insert({ date, emails_sent: 0, calls_made: 0, linkedin_requests: 0, ...targets })
  }
}

export async function incrementDailyGoal(field: 'calls_made' | 'linkedin_requests') {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('crm_daily_goals').select('*').eq('date', today).single()
  if (data) {
    await supabase.from('crm_daily_goals').update({ [field]: ((data as Record<string, unknown>)[field] as number ?? 0) + 1 }).eq('date', today)
  } else {
    await supabase.from('crm_daily_goals').insert({ date: today, [field]: 1, emails_sent: 0 })
  }
}

export async function getStreak() {
  const supabase = createClient()
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const { data } = await supabase.from('crm_daily_goals').select('*').eq('date', dateStr).single()
    const row = data as Record<string, unknown> | null
    days.push({
      date: dateStr,
      goalHit: row ? (row.emails_sent as number ?? 0) >= (row.email_goal as number ?? 25) : false,
      isFuture: false,
    })
  }
  return days
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

export async function getWeeklyEmailVolume() {
  const supabase = createClient()
  const result = []
  for (let i = 7; i >= 0; i--) {
    const end = new Date()
    end.setDate(end.getDate() - i * 7)
    const start = new Date(end)
    start.setDate(start.getDate() - 7)
    const { count } = await supabase
      .from('crm_email_touches')
      .select('id', { count: 'exact', head: true })
      .gte('sent_at', start.toISOString())
      .lt('sent_at', end.toISOString())
    result.push({ week: `W${8 - i}`, count: count ?? 0 })
  }
  return result
}

export async function getReplyRateTrend() {
  const supabase = createClient()
  const result = []
  for (let i = 7; i >= 0; i--) {
    const end = new Date()
    end.setDate(end.getDate() - i * 7)
    const start = new Date(end)
    start.setDate(start.getDate() - 7)
    const [sent, replied] = await Promise.all([
      supabase.from('crm_email_touches').select('id', { count: 'exact', head: true }).gte('sent_at', start.toISOString()).lt('sent_at', end.toISOString()),
      supabase.from('crm_email_touches').select('id', { count: 'exact', head: true }).gte('sent_at', start.toISOString()).lt('sent_at', end.toISOString()).eq('replied', true),
    ])
    const sentCount = sent.count ?? 0
    result.push({ week: `W${8 - i}`, rate: sentCount > 0 ? Math.round(((replied.count ?? 0) / sentCount) * 100) : 0 })
  }
  return result
}

export async function getPipelineStageSummary() {
  const supabase = createClient()
  const stages = ['new', 'contacted', 'demo_sent', 'trial_active', 'proposal', 'converted', 'not_interested']
  const counts = await Promise.all(
    stages.map(stage =>
      supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('status', stage)
        .then(r => ({ stage, count: r.count ?? 0 }))
    )
  )
  return counts
}

export async function getCompanyBreakdown() {
  const supabase = createClient()
  const { data: leads } = await supabase.from('crm_leads').select('company, company_type, status')
  const byCompany: Record<string, { company: string; company_type: string; total: number; contacted: number; converted: number }> = {}
  for (const lead of (leads ?? []) as Record<string, unknown>[]) {
    const key = (lead.company as string) ?? 'Unknown'
    if (!byCompany[key]) {
      byCompany[key] = { company: key, company_type: (lead.company_type as string) ?? 'other', total: 0, contacted: 0, converted: 0 }
    }
    byCompany[key].total++
    if (['contacted', 'demo_sent', 'trial_active', 'proposal', 'converted'].includes(lead.status as string)) byCompany[key].contacted++
    if (lead.status === 'converted') byCompany[key].converted++
  }
  return Object.values(byCompany).sort((a, b) => b.total - a.total)
}

export async function bulkImportLeads(leads: Record<string, unknown>[]): Promise<{ imported: number; skipped: number }> {
  const supabase = createClient()
  let imported = 0; let skipped = 0
  for (const lead of leads) {
    const { error } = await supabase.from('crm_leads').upsert({ ...lead, email_status: lead.email_status ?? 'unverified', updated_at: new Date().toISOString() }, { onConflict: 'email', ignoreDuplicates: false })
    if (error) skipped++; else imported++
  }
  return { imported, skipped }
}

export async function logEmailTouch(leadId: string, touchNumber: number) {
  return markEmailSent({ leadId, touchNumber, subject: '', body: '' })
}

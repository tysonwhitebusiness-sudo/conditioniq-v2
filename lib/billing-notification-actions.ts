'use server'

import { requireCompanyAccess, requireSelfOrPlatformAdmin } from './action-guards'
import { createAdminClient } from '@/lib/supabase/admin'

export interface BillingNotification {
  id: string
  company_id: string
  title: string
  message: string
  unbilled_count: number | null
  is_read: boolean
  created_at: string
  read_at: string | null
}

export async function getUnreadBillingNotifications(companyId: string): Promise<BillingNotification[]> {
  await requireCompanyAccess(companyId)
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('billing_notifications')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(5)
  return (data ?? []) as BillingNotification[]
}

export async function dismissBillingNotification(notificationId: string): Promise<void> {
  const supabase = createAdminClient()
  const { data: row } = await supabase.from('billing_notifications').select('company_id').eq('id', notificationId).maybeSingle()
  if (!row) return
  await requireCompanyAccess(row.company_id)
  await supabase
    .from('billing_notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', notificationId)
}

export async function getBillingSchedule(companyId: string): Promise<number | null> {
  await requireCompanyAccess(companyId)
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('companies')
    .select('billing_day_of_month')
    .eq('id', companyId)
    .single()
  return data?.billing_day_of_month ?? null
}

export async function saveBillingSchedule(
  companyId: string,
  day: number | null,
): Promise<{ error: string | null }> {
  await requireCompanyAccess(companyId)
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) return { error: 'Pick a day from 1 to 31' }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('companies')
    .update({ billing_day_of_month: day })
    .eq('id', companyId)
  return { error: error?.message ?? null }
}

export async function getBillingReminderPreference(userId: string): Promise<boolean> {
  await requireSelfOrPlatformAdmin(userId)
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('notification_settings')
    .select('billing_reminders')
    .eq('user_id', userId)
    .single()
  return data?.billing_reminders ?? true
}

export async function saveBillingReminderPreference(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await requireSelfOrPlatformAdmin(userId)
  const supabase = createAdminClient()
  await supabase
    .from('notification_settings')
    .upsert({ user_id: userId, billing_reminders: enabled }, { onConflict: 'user_id' })
}

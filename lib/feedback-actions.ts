'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type FeedbackCategory = 'bug' | 'feature_request' | 'question'
export type FeedbackStatus = 'new' | 'in_review' | 'resolved'

export interface CustomerFeedback {
  id: string
  company_id: string | null
  user_id: string | null
  category: FeedbackCategory
  description: string
  screenshot_url: string | null
  page_url: string | null
  status: FeedbackStatus
  created_at: string
  company?: { name: string } | null
  user?: { full_name: string | null; email: string | null } | null
}

export async function submitFeedback({
  companyId,
  userId,
  category,
  description,
  screenshotUrl,
  pageUrl,
}: {
  companyId: string
  userId: string
  category: FeedbackCategory
  description: string
  screenshotUrl?: string | null
  pageUrl?: string | null
}): Promise<{ id: string } | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('customer_feedback')
    .insert({
      company_id: companyId,
      user_id: userId,
      category,
      description,
      screenshot_url: screenshotUrl ?? null,
      page_url: pageUrl ?? null,
      status: 'new',
    })
    .select('id')
    .single()

  if (error) {
    console.error('[submitFeedback]', error)
    return null
  }
  return data
}

export async function getAllFeedback(filters?: {
  category?: FeedbackCategory | ''
  status?: FeedbackStatus | ''
}): Promise<CustomerFeedback[]> {
  const supabase = createAdminClient()
  let query = supabase
    .from('customer_feedback')
    .select('*, company:companies(name), user:user_profiles(full_name, email)')
    .order('created_at', { ascending: false })

  if (filters?.category) query = query.eq('category', filters.category)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) { console.error('[getAllFeedback]', error); return [] }
  return (data ?? []) as CustomerFeedback[]
}

export async function updateFeedbackStatus(
  feedbackId: string,
  status: FeedbackStatus,
): Promise<void> {
  const supabase = createAdminClient()
  await supabase
    .from('customer_feedback')
    .update({ status })
    .eq('id', feedbackId)
}

export async function createScreenshotUploadUrl(
  companyId: string,
  ext: string,
): Promise<{ token: string; path: string } | null> {
  const supabase = createAdminClient()
  const path = `feedback/${companyId}/${Date.now()}.${ext}`
  const { data, error } = await supabase.storage
    .from('feedback-screenshots')
    .createSignedUploadUrl(path)
  if (error) { console.error('[createScreenshotUploadUrl]', error); return null }
  return { token: data.token, path }
}

export async function getScreenshotSignedUrl(path: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from('feedback-screenshots')
    .createSignedUrl(path, 3600)
  if (error) { console.error('[getScreenshotSignedUrl]', error); return null }
  return data?.signedUrl ?? null
}

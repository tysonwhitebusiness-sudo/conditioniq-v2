'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { currentUserId, isPlatformAdmin } from './admin-auth'
import { loadAiDashboard, loadReviewQueue, type ReviewFilter, type ReviewItem } from './dashboard-data'

// H · The admin AI dashboard: spend against the ceiling, accuracy from what
// inspectors did, and the review queue that decides which collected records
// join the test sets. Platform admins only; everything is read with the
// service role after that check.

async function guard(): Promise<string> {
  const userId = await currentUserId()
  if (!userId || !(await isPlatformAdmin())) throw new Error('Platform admins only')
  return userId
}

export type { ReviewFilter, ReviewItem } from './dashboard-data'

export async function getAiDashboard(days = 30) {
  await guard()
  return loadAiDashboard(days)
}

/** Decided suggestions, newest first, with the photo each came from. */
export async function listReviewQueue(filter: ReviewFilter = 'to_review', limit = 24): Promise<ReviewItem[]> {
  await guard()
  return loadReviewQueue(filter, limit)
}

/** Approve for the test sets, exclude, or put back in the queue (null). */
export async function reviewSuggestion(id: string, decision: 'approved' | 'excluded' | null): Promise<{ ok: boolean; error?: string }> {
  const userId = await guard()
  if (decision !== null && decision !== 'approved' && decision !== 'excluded') return { ok: false, error: 'Unknown decision' }
  const { error } = await createAdminClient().from('damage_suggestions')
    .update({ review_status: decision, reviewed_at: decision ? new Date().toISOString() : null, reviewed_by: decision ? userId : null })
    .eq('id', id).in('status', ['accepted', 'edited', 'rejected'])
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** The per-inspection spend ceiling and the part of it kept back for the summary. */
export async function setAiCeiling(ceilingUsd: number, summaryReserveUsd: number): Promise<{ ok: boolean; error?: string }> {
  const userId = await guard()
  if (!Number.isFinite(ceilingUsd) || ceilingUsd < 0.01 || ceilingUsd > 2) return { ok: false, error: 'The ceiling must be between $0.01 and $2.00' }
  if (!Number.isFinite(summaryReserveUsd) || summaryReserveUsd < 0 || summaryReserveUsd >= ceilingUsd) return { ok: false, error: 'The summary reserve must be less than the ceiling' }
  const { error } = await createAdminClient().from('ai_settings')
    .update({ per_inspection_ceiling_usd: ceilingUsd, summary_reserve_usd: summaryReserveUsd, updated_at: new Date().toISOString(), updated_by: userId })
    .eq('id', true)
  return error ? { ok: false, error: error.message } : { ok: true }
}

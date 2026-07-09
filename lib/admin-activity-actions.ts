'use server'

import { createAdminClient } from './supabase/admin'

export type AdminActionType =
  | 'flag_toggled'
  | 'plan_changed'
  | 'report_limit_adjusted'
  | 'member_cap_changed'
  | 'ghost_mode_entered'
  | 'ghost_mode_exited'
  | 'role_changed'
  | 'note_added'

export interface AdminActivityEntry {
  id: string
  account_id: string | null
  actor_id: string | null
  action_type: AdminActionType
  description: string
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface AdminActivityRow extends AdminActivityEntry {
  actorName: string | null
  accountName: string | null
}

// Best-effort, append-only audit log insert — same convention as the
// vehicle_events logger. A logging failure must never block the real
// admin action it's describing.
export async function logAdminActivity({
  accountId,
  actorId,
  actionType,
  description,
  metadata,
}: {
  accountId?: string | null
  actorId?: string | null
  actionType: AdminActionType
  description: string
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('admin_activity_log').insert({
      account_id: accountId ?? null,
      actor_id: actorId ?? null,
      action_type: actionType,
      description,
      metadata: metadata ?? null,
    })
    if (error) console.error('[admin-activity] insert failed', error)
  } catch (err) {
    console.error('[admin-activity] insert threw', err)
  }
}

async function resolveNames(
  supabase: ReturnType<typeof createAdminClient>,
  rows: AdminActivityEntry[],
): Promise<AdminActivityRow[]> {
  if (!rows.length) return []
  const actorIds = Array.from(new Set(rows.map(r => r.actor_id).filter((id): id is string => !!id)))
  const accountIds = Array.from(new Set(rows.map(r => r.account_id).filter((id): id is string => !!id)))
  const [profilesRes, companiesRes] = await Promise.all([
    actorIds.length ? supabase.from('user_profiles').select('id, full_name, email').in('id', actorIds) : Promise.resolve({ data: [] as any[] }),
    accountIds.length ? supabase.from('companies').select('id, name').in('id', accountIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const actorNames: Record<string, string> = Object.fromEntries((profilesRes.data ?? []).map((p: any) => [p.id, p.full_name ?? p.email ?? 'Unknown']))
  const accountNames: Record<string, string> = Object.fromEntries((companiesRes.data ?? []).map((c: any) => [c.id, c.name]))
  return rows.map(r => ({
    ...r,
    actorName: r.actor_id ? (actorNames[r.actor_id] ?? 'Unknown') : 'System',
    accountName: r.account_id ? (accountNames[r.account_id] ?? 'Unknown Account') : null,
  }))
}

export async function getAccountActivityLog(accountId: string, limit = 50): Promise<AdminActivityRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('admin_activity_log')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) { console.error('[admin-activity] account fetch failed', error); return [] }
  return resolveNames(supabase, (data ?? []) as AdminActivityEntry[])
}

export async function getAllActivityLog(opts: {
  actionType?: string | null
  accountId?: string | null
  limit?: number
  offset?: number
} = {}): Promise<{ rows: AdminActivityRow[]; total: number }> {
  const supabase = createAdminClient()
  let q = supabase.from('admin_activity_log').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  if (opts.actionType) q = q.eq('action_type', opts.actionType)
  if (opts.accountId) q = q.eq('account_id', opts.accountId)
  const limit = opts.limit ?? 50
  const offset = opts.offset ?? 0
  q = q.range(offset, offset + limit - 1)
  const { data, error, count } = await q
  if (error) { console.error('[admin-activity] all fetch failed', error); return { rows: [], total: 0 } }
  const rows = await resolveNames(supabase, (data ?? []) as AdminActivityEntry[])
  return { rows, total: count ?? 0 }
}

// ── Account notes ────────────────────────────────────────────────────────────

export interface AccountNote {
  id: string
  account_id: string
  author_id: string | null
  note_text: string
  created_at: string
  authorName: string | null
}

export async function getAccountNotes(accountId: string): Promise<AccountNote[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('account_notes')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
  if (error) { console.error('[account-notes] fetch failed', error); return [] }
  if (!data?.length) return []
  const authorIds = Array.from(new Set(data.map(n => n.author_id).filter((id): id is string => !!id)))
  let names: Record<string, string> = {}
  if (authorIds.length) {
    const { data: profiles } = await supabase.from('user_profiles').select('id, full_name, email').in('id', authorIds)
    names = Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name ?? p.email ?? 'Unknown']))
  }
  return data.map(n => ({ ...n, authorName: n.author_id ? (names[n.author_id] ?? 'Unknown') : null }))
}

export async function addAccountNote(accountId: string, authorId: string | null, noteText: string): Promise<AccountNote | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('account_notes')
    .insert({ account_id: accountId, author_id: authorId, note_text: noteText })
    .select()
    .single()
  if (error) { console.error('[account-notes] insert failed', error); return null }

  let authorName: string | null = null
  if (authorId) {
    const { data: profile } = await supabase.from('user_profiles').select('full_name, email').eq('id', authorId).single()
    authorName = profile?.full_name ?? profile?.email ?? 'Unknown'
  }

  await logAdminActivity({
    accountId, actorId: authorId, actionType: 'note_added',
    description: noteText.length > 80 ? `${noteText.slice(0, 80)}…` : noteText,
  })

  return { ...data, authorName }
}

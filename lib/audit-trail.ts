import { createClient } from '@/lib/supabase/client'

export async function insertAuditEntry({
  userId,
  action,
  resourceType,
  resourceId,
  details,
}: {
  userId: string
  action: string
  resourceType: string
  resourceId?: string
  details?: Record<string, any>
}) {
  const supabase = createClient()
  await supabase.from('user_activity_log').insert({
    user_id: userId,
    action,
    resource_type: resourceType,
    resource_id: resourceId ?? null,
    details: details ?? null,
  })
}

export function computeFieldDiff(
  prev: Record<string, any>,
  next: Record<string, any>
): Record<string, { from: any; to: any }> {
  const diff: Record<string, { from: any; to: any }> = {}
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  keys.forEach(k => {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) {
      diff[k] = { from: prev[k], to: next[k] }
    }
  })
  return diff
}

export async function insertVersionSnapshot({
  inspectionId,
  stepName,
  data,
  userId,
}: {
  inspectionId: string
  stepName: string
  data: Record<string, any>
  userId: string
}) {
  await insertAuditEntry({
    userId,
    action: 'step_saved',
    resourceType: 'inspection',
    resourceId: inspectionId,
    details: { step: stepName, snapshot: data },
  })
}

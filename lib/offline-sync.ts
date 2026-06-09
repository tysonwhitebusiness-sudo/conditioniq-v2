import { getAllOfflineInspections, deleteOfflineInspection } from './offline-db'
import { createClient } from './supabase/client'

export interface SyncStatus {
  pending: number
  inProgress: boolean
  failed: number
  total: number
  lastSyncAt: string | null
}

let isSyncing = false

export async function syncOfflineInspections(
  onProgress?: (status: SyncStatus) => void
): Promise<SyncStatus> {
  if (isSyncing) return { pending: 0, inProgress: true, failed: 0, total: 0, lastSyncAt: null }
  isSyncing = true

  const pending = await getAllOfflineInspections()
  const total = pending.length
  let failed = 0

  const supabase = createClient()

  for (const inspection of pending) {
    try {
      const { _localOnly, _savedAt, ...data } = inspection
      await supabase.from('vehicle_inspections').upsert(data)
      await deleteOfflineInspection(inspection.id)
    } catch {
      failed++
    }
    onProgress?.({ pending: pending.length - total + 1, inProgress: true, failed, total, lastSyncAt: null })
  }

  isSyncing = false
  const lastSyncAt = new Date().toISOString()

  return { pending: 0, inProgress: false, failed, total, lastSyncAt }
}

export async function createInspectionOfflineAware(
  data: Record<string, any>,
  companyId: string,
  inspectorId: string
): Promise<string> {
  const id = data.id ?? crypto.randomUUID()
  if (!navigator.onLine) {
    const { saveInspectionOffline } = await import('./offline-db')
    await saveInspectionOffline({ ...data, id, company_id: companyId, inspector_id: inspectorId })
    return id
  }

  const supabase = createClient()
  const { data: result, error } = await supabase
    .from('vehicle_inspections')
    .insert({ ...data, id, company_id: companyId, inspector_id: inspectorId })
    .select('id')
    .single()

  if (error) {
    const { saveInspectionOffline } = await import('./offline-db')
    await saveInspectionOffline({ ...data, id, company_id: companyId, inspector_id: inspectorId })
    return id
  }

  return result.id
}

export async function updateInspectionOfflineAware(
  id: string,
  data: Record<string, any>
): Promise<void> {
  if (!navigator.onLine) {
    const { getOfflineInspection, saveInspectionOffline } = await import('./offline-db')
    const existing = await getOfflineInspection(id)
    await saveInspectionOffline({ ...(existing ?? {}), ...data, id })
    return
  }

  const supabase = createClient()
  const { error } = await supabase
    .from('vehicle_inspections')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    const { getOfflineInspection, saveInspectionOffline } = await import('./offline-db')
    const existing = await getOfflineInspection(id)
    await saveInspectionOffline({ ...(existing ?? {}), ...data, id })
  }
}

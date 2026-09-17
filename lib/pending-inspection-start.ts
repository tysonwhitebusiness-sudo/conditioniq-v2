import type { InspectionStartSelection } from '@/components/inspections/start-inspection-sheet'

// Hands a chosen vehicle from the /inspections page to the home shell, which
// runs the inspection. Session storage keeps VINs out of the URL and is gone
// once read, so a reload never starts a second inspection.
const KEY = 'ciq_pending_inspection_start'
const MAX_AGE_MS = 5 * 60 * 1000

export function setPendingInspectionStart(selection: InspectionStartSelection): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ selection, at: Date.now() }))
  } catch { /* storage unavailable: the shell falls back to opening the start sheet */ }
}

export function takePendingInspectionStart(): InspectionStartSelection | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    if (!raw) return null
    const { selection, at } = JSON.parse(raw)
    if (typeof at !== 'number' || Date.now() - at > MAX_AGE_MS) return null
    return selection?.vin ? selection : null
  } catch {
    return null
  }
}

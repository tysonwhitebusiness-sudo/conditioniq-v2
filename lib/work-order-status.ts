// Single source of truth for a work order's (storage_vehicles row's) status.
// Replaces the two disagreeing legacy columns (status, lifecycle_status) and
// the three independently-written "effective status" functions that used to
// paper over their disagreement (lib/dashboard-stats.ts, app/(app)/vehicles/page.tsx,
// lib/inspection-server-actions.ts's LIFECYCLE_STATUS_LABEL).
//
// See supabase/migrations/20260805000002_add_work_order_status.sql through
// 20260805000004_fix_terminal_status_unique_index.sql for the backing schema.

import { createClient } from '@/lib/supabase/client'
import { unassignVehicleFromSpot } from '@/lib/lot-actions'
import type { SpotSizeClass } from '@/lib/lot-actions'
import type { VehicleTemplate } from '@/lib/damage-actions'
import { logVehicleEvent } from '@/lib/vehicle-events-actions'
import { PRIMARY, PRIMARY_TINT, PRIMARY_PILL_TEXT, AMBER, AMBER_TINT, AMBER_PILL_TEXT, GRAY_500, GRAY_100, pillStyle } from '@/lib/design-tokens'
import { resolveVehicleModelAssets, normalizeBodyClass } from '@/lib/vehicle-model-assets'

export type WorkOrderStatus =
  | 'pending_arrival'
  | 'checked_in'
  | 'in_storage'
  | 'on_lot_pending_repairs'
  | 'on_lot_repairs_complete'
  | 'off_lot'
  | 'on_hold'
  | 'pending_release'
  | 'ready_for_release'
  | 'released'

// Display order matches the lifecycle progression.
export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  'pending_arrival',
  'checked_in',
  'in_storage',
  'on_lot_pending_repairs',
  'on_lot_repairs_complete',
  'off_lot',
  'on_hold',
  'pending_release',
  'ready_for_release',
  'released',
]

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  pending_arrival: 'Pending Arrival',
  checked_in: 'Checked In',
  in_storage: 'In Storage',
  on_lot_pending_repairs: 'On Lot - Pending Repairs',
  on_lot_repairs_complete: 'On Lot - Repairs Complete',
  off_lot: 'Off Lot',
  on_hold: 'On Hold',
  pending_release: 'Pending Release',
  ready_for_release: 'Ready for Release',
  released: 'Released',
}

export const WORK_ORDER_STATUS_SORT: Record<WorkOrderStatus, number> =
  Object.fromEntries(WORK_ORDER_STATUSES.map((s, i) => [s, i])) as Record<WorkOrderStatus, number>

// Statuses that require an active lot_vehicle_assignments row (a spot).
// Off Lot vehicles may be physically on premises (e.g. a repair bay) but are
// tracked as a status only, never a mapped spot — no "zone" concept.
const OCCUPYING_STATUSES = new Set<WorkOrderStatus>([
  'checked_in',
  'in_storage',
  'on_lot_pending_repairs',
  'on_lot_repairs_complete',
  'on_hold',
  'pending_release',
  'ready_for_release',
])

export function occupiesSpot(status: WorkOrderStatus): boolean {
  return OCCUPYING_STATUSES.has(status)
}

export function isTerminal(status: WorkOrderStatus): boolean {
  return status === 'released'
}

// Lot Map pin colors — a 3-bucket scheme (amber/cyan), independent of the old
// 5-color legacy system. Statuses that don't occupy a spot (pending_arrival,
// off_lot, released) return null; occupiesSpot() already guarantees a spot's
// active assignment can't be one of these in normal operation, so null here
// is a defensive fallback for a data inconsistency, not a designed state —
// callers should render the neutral "Empty" color in that case.
export const SPOT_PIN_ATTENTION_COLOR = AMBER
export const SPOT_PIN_OCCUPIED_COLOR = PRIMARY

const ATTENTION_STATUSES = new Set<WorkOrderStatus>(['on_lot_pending_repairs', 'on_hold', 'pending_release'])
const OCCUPIED_STATUSES_FOR_PIN = new Set<WorkOrderStatus>(['checked_in', 'in_storage', 'on_lot_repairs_complete', 'ready_for_release'])

export function getSpotPinColor(status: WorkOrderStatus): string | null {
  if (ATTENTION_STATUSES.has(status)) return SPOT_PIN_ATTENTION_COLOR
  if (OCCUPIED_STATUSES_FOR_PIN.has(status)) return SPOT_PIN_OCCUPIED_COLOR
  return null
}

// Tint-background status pill (mockup pill styling) — the shared target for
// the 5 duplicate STATUS_CFG/getStatusColors implementations identified in
// the design-consistency audit (vehicles/page.tsx, customers/[customerId]/page.tsx,
// admin-customer-detail.tsx, bulk-billing-modal.tsx, vehicle-inspection-app.tsx),
// consolidated in a later migration tier, not introduced here.
export function getStatusPillStyle(status: WorkOrderStatus): { background: string; color: string; fontWeight: number } {
  if (ATTENTION_STATUSES.has(status)) return pillStyle(AMBER_PILL_TEXT, AMBER_TINT)
  if (OCCUPIED_STATUSES_FOR_PIN.has(status)) return pillStyle(PRIMARY_PILL_TEXT, PRIMARY_TINT)
  return pillStyle(GRAY_500, GRAY_100)
}

// sedan/suv → standard, truck/van → oversized — a default only, never a locked
// value; the intake form always leaves size_class independently editable.
export function defaultSizeClassForTemplate(template: VehicleTemplate): SpotSizeClass {
  return template === 'truck' || template === 'van' ? 'oversized' : 'standard'
}

// Reverse mapping (work_order_status -> legacy status/lifecycle_status), approved
// for dual-write so the not-yet-migrated Lot Map operational components
// (lot-grid.tsx, vehicle-detail-slide-over.tsx, lot-setup-overlay.tsx — deferred to
// the Phase 6 Lot Map redesign) keep reading correct-ish data via the old columns.
// The 5 net-new statuses have no real old-system equivalent and collapse onto the
// closest bucket the old columns can express — see the approved mapping table.
const LEGACY_STATUS_MAP: Record<WorkOrderStatus, { status: string; lifecycle_status: string }> = {
  pending_arrival:          { status: 'active',             lifecycle_status: 'pending_arrival' },
  checked_in:                { status: 'pending_inspection', lifecycle_status: 'on_lot' },
  in_storage:                 { status: 'inspected',          lifecycle_status: 'on_lot' },
  on_lot_pending_repairs:      { status: 'inspected',          lifecycle_status: 'on_lot' },
  on_lot_repairs_complete:      { status: 'inspected',          lifecycle_status: 'on_lot' },
  off_lot:                       { status: 'active',             lifecycle_status: 'on_lot' },
  on_hold:                        { status: 'active',             lifecycle_status: 'on_lot' },
  pending_release:                 { status: 'inspected',          lifecycle_status: 'pending_pickup' },
  ready_for_release:                { status: 'inspected',          lifecycle_status: 'pending_pickup' },
  released:                          { status: 'released',           lifecycle_status: 'picked_up' },
}

export function toLegacyColumns(status: WorkOrderStatus): { status: string; lifecycle_status: string } {
  return LEGACY_STATUS_MAP[status]
}

// Finds the vehicle_master row for (companyId, vin), creating it if this is the
// first time this VIN has been seen for this company. Every storage_vehicles
// insert must call this — vehicle_master_id is NOT NULL with no default.
export async function resolveVehicleMasterId(
  supabase: any,
  companyId: string,
  vin: string,
  seed?: {
    year?: string | null; make?: string | null; model?: string | null
    sizeClass?: SpotSizeClass | null; vehicleTemplate?: VehicleTemplate | null
    bodyClass?: string | null
  },
): Promise<string> {
  const { data: existing } = await supabase
    .from('vehicle_master')
    .select('id')
    .eq('company_id', companyId)
    .eq('vin', vin)
    .maybeSingle()
  if (existing) return existing.id

  // vehicleTemplate (manually set, e.g. via the Add Vehicle form) wins over the
  // VIN-decoded body class when both are available — it's the same authoritative
  // signal DamageTagger and lot-sizing already treat as the source of truth.
  const category = seed?.vehicleTemplate ?? normalizeBodyClass(seed?.bodyClass) ?? null
  const { modelAsset2dId, modelAsset3dId } = await resolveVehicleModelAssets(
    supabase, category, seed?.make, seed?.model,
  )

  const { data: created, error } = await supabase
    .from('vehicle_master')
    .insert({
      company_id: companyId,
      vin,
      year: seed?.year ?? null,
      make: seed?.make ?? null,
      model: seed?.model ?? null,
      size_class: seed?.sizeClass ?? null,
      vehicle_template: seed?.vehicleTemplate ?? null,
      model_asset_2d_id: modelAsset2dId,
      model_asset_3d_id: modelAsset3dId,
    })
    .select('id')
    .single()
  if (error) throw error
  return created.id
}

// The single place a work order's status changes. Handles the spot
// auto-release rule (requirement 6) and logs the change via the existing
// vehicle_events audit log (requirement 5 — no new logging mechanism).
export async function updateWorkOrderStatus(
  vehicleId: string,
  newStatus: WorkOrderStatus,
  changedBy?: string | null,
): Promise<void> {
  const supabase = createClient()

  const { data: vehicle, error: findErr } = await supabase
    .from('storage_vehicles')
    .select('id, company_id, work_order_status')
    .eq('id', vehicleId)
    .single()
  if (findErr || !vehicle) throw findErr ?? new Error('Vehicle not found')

  const oldStatus = vehicle.work_order_status as WorkOrderStatus
  if (oldStatus === newStatus) return

  const legacy = toLegacyColumns(newStatus)
  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = {
    work_order_status: newStatus,
    status: legacy.status,
    lifecycle_status: legacy.lifecycle_status,
    updated_at: nowIso,
  }

  // A release must record when it happened. releaseVehicle() already did; this
  // path did not, so vehicles released through a status change kept
  // released_at null. That had two effects: lot billing (calculateVehicleBilling
  // treats a null released_at as "still here") kept accruing storage days after
  // the vehicle left, and vehicle metering counted it as on the lot forever.
  // 49 production vehicles are in that state as of Sep 2026.
  //
  // arrived_at is deliberately not touched here: lot billing starts its day
  // count from it, and changing it would change customer invoices.
  if (newStatus === 'released') {
    patch.released_at = nowIso
    patch.released_date = nowIso.split('T')[0]
  } else if (oldStatus === 'released') {
    // Reopened: the earlier release no longer ends the stay.
    patch.released_at = null
    patch.released_date = null
  }

  const { error: updateErr } = await supabase
    .from('storage_vehicles')
    .update(patch)
    .eq('id', vehicleId)
  if (updateErr) throw updateErr

  // Auto-release: leaving an occupying status drops any active spot assignment.
  if (occupiesSpot(oldStatus) && !occupiesSpot(newStatus)) {
    const { data: activeAssignment } = await supabase
      .from('lot_vehicle_assignments')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .is('unassigned_at', null)
      .maybeSingle()
    if (activeAssignment) {
      await unassignVehicleFromSpot(activeAssignment.id, changedBy ?? undefined)
    }
  }

  logVehicleEvent({
    companyId: vehicle.company_id,
    vehicleId,
    eventType: 'status_changed',
    description: `Status changed to ${WORK_ORDER_STATUS_LABEL[newStatus]}`,
    metadata: { old_status: oldStatus, new_status: newStatus },
    createdBy: changedBy ?? null,
  })
}

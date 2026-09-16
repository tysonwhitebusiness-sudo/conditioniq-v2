import { createClient } from '@/lib/supabase/client'
import { getDamageMarkersForVehicle } from '@/lib/damage-actions'
import type { DamageMarker } from '@/lib/damage-actions'

// ── Types ──────────────────────────────────────────────────────────────────────

export type CheckpointDirection = 'intake' | 'outtake'
// Phase 13: 'backfill' is a one-time onboarding entry (Add Existing Vehicle),
// not a real work-order direction — kept separate from CheckpointDirection so
// the checkpoint/[direction] route's strict intake/outtake validation and
// DIRECTION_LABEL map stay exactly as narrow as they should be. Only
// createCheckpoint/getCheckpoint (and uploadCheckpointPhoto) need the wider type.
export type VehicleCheckpointDirection = CheckpointDirection | 'backfill'
export type FuelLevel = 'E' | '1/4' | '1/2' | '3/4' | 'F'

export interface VehicleCheckpoint {
  id: string
  company_id: string
  vehicle_id: string
  direction: VehicleCheckpointDirection
  odometer: number | null
  fuel_level: FuelLevel | null
  key_count: number
  photos: string[]
  belongings_note: string | null
  notes: string | null
  inspector_id: string
  created_at: string
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function getCheckpoint(vehicleId: string, direction: VehicleCheckpointDirection): Promise<VehicleCheckpoint | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('vehicle_checkpoints')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .eq('direction', direction)
    .maybeSingle()
  return data
}

export async function getCheckpointsForVehicle(vehicleId: string): Promise<VehicleCheckpoint[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('vehicle_checkpoints')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('created_at')
  return data ?? []
}

export async function createCheckpoint(companyId: string, data: {
  vehicleId: string
  direction: VehicleCheckpointDirection
  odometer?: number | null
  fuelLevel?: FuelLevel | null
  keyCount?: number
  photos: string[]
  belongingsNote?: string
  notes?: string
  inspectorId: string
}): Promise<VehicleCheckpoint | null> {
  const supabase = createClient()
  const { data: created, error } = await supabase
    .from('vehicle_checkpoints')
    .insert({
      company_id: companyId,
      vehicle_id: data.vehicleId,
      direction: data.direction,
      odometer: data.odometer ?? null,
      fuel_level: data.fuelLevel ?? null,
      key_count: data.keyCount ?? 0,
      photos: data.photos,
      belongings_note: data.belongingsNote ?? null,
      notes: data.notes ?? null,
      inspector_id: data.inspectorId,
    })
    .select('*')
    .single()
  if (error) { console.error('[checkpoint] create', error); return null }
  return created
}

export async function deleteCheckpoint(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('vehicle_checkpoints').delete().eq('id', id)
  if (error) console.error('[checkpoint] delete', error)
}

// ── Before/after damage comparison ───────────────────────────────────────────
// Match heuristic: an outtake marker is "new since intake" when no intake marker
// shares the same (area_code_id, type_code_id) pair. Simple field-equality, not
// position-proximity fuzzy matching — flagged as a deliberate simplification in
// the Phase 4 design, not a hidden approximation.

export interface DamageComparisonResult {
  intakeMarkers: DamageMarker[]
  outtakeMarkers: DamageMarker[]
  newAtOuttake: DamageMarker[]
}

export async function getDamageComparisonForVehicle(vehicleId: string): Promise<DamageComparisonResult> {
  const all = await getDamageMarkersForVehicle(vehicleId)
  const intakeMarkers = all.filter(m => m.source === 'intake')
  const outtakeMarkers = all.filter(m => m.source === 'outtake')
  const intakeKeys = new Set(intakeMarkers.map(m => `${m.area_code_id}::${m.type_code_id}`))
  const newAtOuttake = outtakeMarkers.filter(m => !intakeKeys.has(`${m.area_code_id}::${m.type_code_id}`))
  return { intakeMarkers, outtakeMarkers, newAtOuttake }
}

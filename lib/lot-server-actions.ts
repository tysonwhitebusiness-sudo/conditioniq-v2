'use server'

import { createAdminClient } from './supabase/admin'
import { createClient } from './supabase/server'
import type { LotShape, LotSpot } from './lot-actions'
import { authorizeCompanyAccess } from './inspection-auth'

export async function createLotSpotAction(
  companyId: string,
  data: {
    label: string
    x_position: number
    y_position: number
    notes?: string | null
    location_id?: string | null
    width?: number
    height?: number
    rotation?: number
    custom_color?: string | null
  },
): Promise<LotSpot | null> {
  const supabase = createClient()
  const { data: spot, error } = await supabase
    .from('lot_spots')
    .insert({
      company_id: companyId,
      label: data.label,
      x_position: data.x_position,
      y_position: data.y_position,
      notes: data.notes ?? null,
      location_id: data.location_id ?? null,
      width: data.width ?? 4,
      height: data.height ?? 7,
      rotation: data.rotation ?? 0,
      custom_color: data.custom_color ?? null,
    })
    .select()
    .single()
  if (error) { console.error('[lot] createSpot', error); return null }
  return { ...spot, active_assignment: null }
}

export async function updateLotSpotAction(
  spotId: string,
  updates: Partial<{
    label: string; x_position: number; y_position: number; notes: string | null
    width: number; height: number; rotation: number; custom_color: string | null
  }>,
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('lot_spots').update(updates).eq('id', spotId)
  if (error) console.error('[lot] updateSpot', error)
}

export async function deleteLotSpotAction(spotId: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('lot_spots').delete().eq('id', spotId)
}

export async function createLotShapeAction(
  companyId: string,
  shape: Omit<LotShape, 'id' | 'company_id' | 'created_at'>,
): Promise<LotShape | null> {
  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) return null

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('lot_shapes')
    .insert({ company_id: companyId, ...shape })
    .select()
    .single()
  if (error) { console.error('[lot] createShape', error); return null }
  return data as LotShape
}

export async function updateLotShapeAction(
  id: string,
  updates: Partial<Omit<LotShape, 'id' | 'company_id' | 'created_at'>>,
): Promise<void> {
  const admin = createAdminClient()
  const { data: existing } = await admin.from('lot_shapes').select('company_id').eq('id', id).maybeSingle()
  if (!existing) return
  const ok = await authorizeCompanyAccess(existing.company_id)
  if (!ok) return

  const { error } = await admin.from('lot_shapes').update(updates).eq('id', id)
  if (error) console.error('[lot] updateShape', error)
}

export async function deleteLotShapeAction(id: string): Promise<void> {
  const admin = createAdminClient()
  const { data: existing } = await admin.from('lot_shapes').select('company_id').eq('id', id).maybeSingle()
  if (!existing) return
  const ok = await authorizeCompanyAccess(existing.company_id)
  if (!ok) return

  await admin.from('lot_shapes').delete().eq('id', id)
}

export async function removeLotBackgroundAction(companyId: string, locationId?: string | null): Promise<void> {
  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) return

  const supabase = createAdminClient()
  const path = locationId ? `${companyId}/${locationId}.jpg` : `${companyId}/main.jpg`
  await supabase.storage.from('lot-backgrounds').remove([path])
}

export async function saveLotBillingDefaultsAction(
  companyId: string,
  defaults: {
    default_daily_rate: number | null
    default_monthly_rate: number | null
    default_billing_type: 'daily' | 'monthly'
  },
): Promise<{ error: string | null }> {
  if (!companyId) return { error: 'Missing company ID' }
  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) return { error: 'Not authorized' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('companies')
    .update(defaults)
    .eq('id', companyId)
  if (error) {
    console.error('[lot-billing] save defaults', error)
    return { error: error.message }
  }
  return { error: null }
}

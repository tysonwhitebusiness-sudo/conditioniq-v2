'use server'

import { createClient } from './supabase/server'
import { createAdminClient } from './supabase/admin'
import { authorizeInspectionAccess, authorizeCompanyAccess } from './inspection-auth'
import { attachInspectionVehicle } from './inspection-vehicle'
import { resolveVehicleModelAssets } from './vehicle-model-assets'
import type { DamageMarker, DamageMarkerAssetType, DamageMarkerView, VehicleTemplate } from './damage-actions'

// Damage pins placed during a full inspection, and pin photos everywhere.
//
// These run on the server with the admin client, after authorizeInspectionAccess:
// staff of the company, or a link inspector whose unexpired link produced this
// inspection. Link inspectors are anonymous sessions with no company profile, so
// the damage_markers row policies (company members only) would refuse them if
// the browser wrote directly.

const MARKER_SELECT = `
  *,
  area:area_code_id(id, category, label, sort_order),
  type:type_code_id(id, label, sort_order),
  severity:severity_code_id(id, code, label, sort_order)
`
const PHOTO_BUCKET = 'inspection-photos'
const PHOTO_URL_TTL = 60 * 60 // signed on every read, so a short life is enough
const VEHICLE_TEMPLATES: VehicleTemplate[] = ['sedan', 'suv', 'truck', 'van']
const VIEWS: DamageMarkerView[] = ['top', 'front', 'side', 'rear']

export type DamageMarkerWithPhoto = DamageMarker & { photo_path?: string | null; photo_url?: string | null }

export interface InspectionDamageContext {
  vehicleId: string | null
  vehicleTemplate: VehicleTemplate | null
  modelAsset2dId: string | null
  modelAsset3dId: string | null
  // Pins can only change while the inspection is in progress.
  editable: boolean
}

async function authorize(inspectionId: string) {
  const { ok, companyId } = await authorizeInspectionAccess(inspectionId)
  if (!ok || !companyId) throw new Error('Not authorized for this inspection')
  return companyId
}

async function loadContext(admin: any, inspectionId: string): Promise<InspectionDamageContext> {
  const { data: inspection, error } = await admin
    .from('vehicle_inspections')
    .select('vehicle_id, status')
    .eq('id', inspectionId)
    .maybeSingle()
  if (error) throw error
  const editable = inspection?.status === 'in_progress'
  if (!inspection?.vehicle_id) return { vehicleId: null, vehicleTemplate: null, modelAsset2dId: null, modelAsset3dId: null, editable }

  const { data: vehicle } = await admin
    .from('storage_vehicles')
    .select('id, vehicle_master:vehicle_master_id(id, vehicle_template, make, model, model_asset_2d_id, model_asset_3d_id)')
    .eq('id', inspection.vehicle_id)
    .maybeSingle()
  const vm = vehicle?.vehicle_master as any
  let modelAsset2dId: string | null = vm?.model_asset_2d_id ?? null
  let modelAsset3dId: string | null = vm?.model_asset_3d_id ?? null

  // Same lazy fill the check-in page does: a body type without resolved
  // diagrams gets them the first time a damage step opens.
  if (vm?.vehicle_template && (!modelAsset2dId || !modelAsset3dId)) {
    const resolved = await resolveVehicleModelAssets(admin, vm.vehicle_template, vm.make, vm.model)
    modelAsset2dId = resolved.modelAsset2dId
    modelAsset3dId = resolved.modelAsset3dId
    await admin.from('vehicle_master').update({ model_asset_2d_id: modelAsset2dId, model_asset_3d_id: modelAsset3dId }).eq('id', vm.id)
  }

  return {
    vehicleId: inspection.vehicle_id,
    vehicleTemplate: vm?.vehicle_template ?? null,
    modelAsset2dId,
    modelAsset3dId,
    editable,
  }
}

export async function getInspectionDamageContext(inspectionId: string): Promise<InspectionDamageContext> {
  await authorize(inspectionId)
  return loadContext(createAdminClient(), inspectionId)
}

// For inspections that started without a VIN (a link sent without one, or an
// inspection begun before vehicles came first): attach the vehicle once the
// inspector has entered the VIN, so the damage step can open.
export async function ensureInspectionVehicle(
  inspectionId: string,
  vehicle: { vin: string; year?: string | number | null; make?: string | null; model?: string | null; bodyClass?: string | null },
): Promise<InspectionDamageContext> {
  const companyId = await authorize(inspectionId)
  const admin = createAdminClient()
  const current = await loadContext(admin, inspectionId)
  if (current.vehicleId || !current.editable) return current
  if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vehicle.vin ?? '')) throw new Error('A 17-character VIN is needed first')
  await attachInspectionVehicle(admin, { companyId, inspectionId, ...vehicle })
  return loadContext(admin, inspectionId)
}

export async function setInspectionVehicleTemplate(inspectionId: string, template: VehicleTemplate): Promise<InspectionDamageContext> {
  await authorize(inspectionId)
  if (!VEHICLE_TEMPLATES.includes(template)) throw new Error('Unknown body type')
  const admin = createAdminClient()
  const context = await loadContext(admin, inspectionId)
  if (!context.vehicleId) throw new Error('This inspection has no vehicle yet')
  const { data: vehicle } = await admin
    .from('storage_vehicles')
    .select('vehicle_master:vehicle_master_id(id, make, model)')
    .eq('id', context.vehicleId)
    .maybeSingle()
  const vm = vehicle?.vehicle_master as any
  if (!vm) throw new Error('Vehicle record not found')
  const assets = await resolveVehicleModelAssets(admin, template, vm.make, vm.model)
  const { error } = await admin.from('vehicle_master').update({
    vehicle_template: template, model_asset_2d_id: assets.modelAsset2dId, model_asset_3d_id: assets.modelAsset3dId,
  }).eq('id', vm.id)
  if (error) throw error
  return loadContext(admin, inspectionId)
}

async function withPhotoUrls(admin: any, markers: DamageMarkerWithPhoto[]): Promise<DamageMarkerWithPhoto[]> {
  const paths = markers.map(m => m.photo_path).filter((p): p is string => !!p)
  if (paths.length === 0) return markers
  const { data } = await admin.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_TTL)
  const urlByPath = new Map<string, string>()
  for (const row of data ?? []) if (row.path && row.signedUrl) urlByPath.set(row.path, row.signedUrl)
  return markers.map(m => ({ ...m, photo_url: m.photo_path ? urlByPath.get(m.photo_path) ?? null : null }))
}

export async function listInspectionMarkers(
  inspectionId: string,
  filter?: { modelAssetId?: string; view?: DamageMarkerView },
): Promise<DamageMarkerWithPhoto[]> {
  await authorize(inspectionId)
  const admin = createAdminClient()
  let query = admin.from('damage_markers').select(MARKER_SELECT).eq('inspection_id', inspectionId)
  if (filter?.modelAssetId) query = query.eq('model_asset_id', filter.modelAssetId)
  if (filter?.view) query = query.eq('view', filter.view)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return withPhotoUrls(admin, (data ?? []) as DamageMarkerWithPhoto[])
}

export interface NewMarkerInput {
  areaCodeId: string
  typeCodeId: string
  severityCodeId: string
  xPosition: number
  yPosition: number
  zPosition?: number | null
  modelAssetId?: string | null
  assetType?: DamageMarkerAssetType | null
  view?: DamageMarkerView | null
}

function assertPosition(n: unknown, label: string) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Invalid ${label}`)
}

export async function createInspectionMarker(inspectionId: string, input: NewMarkerInput): Promise<DamageMarkerWithPhoto> {
  const companyId = await authorize(inspectionId)
  const admin = createAdminClient()
  const context = await loadContext(admin, inspectionId)
  if (!context.editable) throw new Error('This inspection is no longer in progress')
  if (!context.vehicleId || !context.vehicleTemplate) throw new Error('This inspection has no vehicle body type yet')

  assertPosition(input.xPosition, 'position')
  assertPosition(input.yPosition, 'position')
  if (input.assetType === '3d') assertPosition(input.zPosition, 'position')
  if (input.view && !VIEWS.includes(input.view)) throw new Error('Invalid view')
  // A pin must sit on this vehicle's own diagram.
  if (input.modelAssetId && input.modelAssetId !== context.modelAsset2dId && input.modelAssetId !== context.modelAsset3dId) {
    throw new Error('That diagram does not belong to this vehicle')
  }

  // Link inspectors have no profile row; created_by references user_profiles.
  const { data: { user } } = await createClient().auth.getUser()
  let createdBy: string | null = null
  if (user) {
    const { data: profile } = await admin.from('user_profiles').select('id').eq('id', user.id).maybeSingle()
    createdBy = profile?.id ?? null
  }

  const { data, error } = await admin
    .from('damage_markers')
    .insert({
      company_id: companyId,
      vehicle_id: context.vehicleId,
      inspection_id: inspectionId,
      source: 'cr',
      vehicle_template: context.vehicleTemplate,
      area_code_id: input.areaCodeId,
      type_code_id: input.typeCodeId,
      severity_code_id: input.severityCodeId,
      x_position: input.xPosition,
      y_position: input.yPosition,
      z_position: input.assetType === '3d' ? input.zPosition : null,
      model_asset_id: input.modelAssetId ?? null,
      asset_type: input.assetType ?? null,
      view: input.assetType === '2d' ? input.view ?? null : null,
      created_by: createdBy,
    })
    .select(MARKER_SELECT)
    .single()
  if (error) throw error
  return data as DamageMarkerWithPhoto
}

export async function deleteInspectionMarker(inspectionId: string, markerId: string): Promise<void> {
  await authorize(inspectionId)
  const admin = createAdminClient()
  const context = await loadContext(admin, inspectionId)
  if (!context.editable) throw new Error('This inspection is no longer in progress')
  const { data: marker } = await admin
    .from('damage_markers')
    .select('photo_path')
    .eq('id', markerId)
    .eq('inspection_id', inspectionId)
    .maybeSingle()
  if (!marker) return
  const { error } = await admin.from('damage_markers').delete().eq('id', markerId).eq('inspection_id', inspectionId)
  if (error) throw error
  if (marker.photo_path) await admin.storage.from(PHOTO_BUCKET).remove([marker.photo_path])
}

// ── Pin photos (intake, outtake and full inspection) ──────────────────────────

async function authorizeMarker(admin: any, markerId: string) {
  const { data: marker, error } = await admin
    .from('damage_markers')
    .select('id, company_id, inspection_id, photo_path')
    .eq('id', markerId)
    .maybeSingle()
  if (error) throw error
  if (!marker) throw new Error('Damage pin not found')
  if (marker.inspection_id) {
    await authorize(marker.inspection_id)
    const context = await loadContext(admin, marker.inspection_id)
    if (!context.editable) throw new Error('This inspection is no longer in progress')
  } else if (!(await authorizeCompanyAccess(marker.company_id))) {
    throw new Error('Not authorized for this damage pin')
  }
  return marker as { id: string; company_id: string; inspection_id: string | null; photo_path: string | null }
}

export async function uploadDamageMarkerPhoto(markerId: string, dataUrl: string): Promise<string> {
  const admin = createAdminClient()
  const marker = await authorizeMarker(admin, markerId)

  const match = dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/)
  if (!match) throw new Error('Invalid image data')
  const [, mimeType, subtype, base64Data] = match
  const buffer = Buffer.from(base64Data, 'base64')
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Photo is too large')

  const ext = subtype === 'jpeg' ? 'jpg' : subtype
  const path = `${marker.company_id}/damage-markers/${marker.id}.${ext}`
  const { error: uploadError } = await admin.storage.from(PHOTO_BUCKET).upload(path, buffer, { contentType: mimeType, upsert: true })
  if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`)
  if (marker.photo_path && marker.photo_path !== path) await admin.storage.from(PHOTO_BUCKET).remove([marker.photo_path])

  const { error } = await admin.from('damage_markers').update({ photo_path: path }).eq('id', marker.id)
  if (error) throw error
  const { data: signed, error: signError } = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(path, PHOTO_URL_TTL)
  if (signError || !signed) throw new Error('Failed to generate photo URL')
  return signed.signedUrl
}

export async function removeDamageMarkerPhoto(markerId: string): Promise<void> {
  const admin = createAdminClient()
  const marker = await authorizeMarker(admin, markerId)
  if (!marker.photo_path) return
  const { error } = await admin.from('damage_markers').update({ photo_path: null }).eq('id', marker.id)
  if (error) throw error
  await admin.storage.from(PHOTO_BUCKET).remove([marker.photo_path])
}

// Signed URLs for vehicle-level pins (intake and outtake), which the browser
// reads directly under row policies but cannot sign from the private bucket.
export async function getDamageMarkerPhotoUrls(markerIds: string[]): Promise<Record<string, string>> {
  if (markerIds.length === 0) return {}
  const admin = createAdminClient()
  const { data: markers, error } = await admin
    .from('damage_markers')
    .select('id, company_id, photo_path')
    .in('id', markerIds.slice(0, 500))
    .not('photo_path', 'is', null)
  if (error) throw error
  const companies = Array.from(new Set((markers ?? []).map((m: { company_id: string }) => m.company_id)))
  for (const companyId of companies) {
    if (!(await authorizeCompanyAccess(companyId))) throw new Error('Not authorized for these damage pins')
  }
  const signed = await withPhotoUrls(admin, (markers ?? []) as DamageMarkerWithPhoto[])
  const out: Record<string, string> = {}
  for (const m of signed) if (m.photo_url) out[m.id] = m.photo_url
  return out
}

// ── Report data ──────────────────────────────────────────────────────────────

export interface ReportDamagePin {
  number: number
  area: string | null
  type: string | null
  severity: string | null
  // damage_severity_codes.code: 1 (up to 1 inch) through 6 (missing/major damage)
  severityCode: number | null
  assetType: '2d' | '3d' | null
  view: DamageMarkerView | null
  x: number
  y: number
  photoUrl: string | null
  modelAssetId: string | null
}

export interface ReportDamageView {
  modelAssetId: string
  view: DamageMarkerView
  imageUrl: string
}

// Pins for a report, numbered in the order they were placed, plus the 2D
// diagram views that have pins on them. Readable for any status, so a completed
// inspection's PDF can be regenerated later.
export async function getInspectionReportDamage(inspectionId: string): Promise<{ pins: ReportDamagePin[]; views: ReportDamageView[] }> {
  await authorize(inspectionId)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('damage_markers')
    .select(MARKER_SELECT)
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const markers = await withPhotoUrls(admin, (data ?? []) as DamageMarkerWithPhoto[])

  const pins: ReportDamagePin[] = markers.map((m, i) => ({
    number: i + 1,
    area: m.area?.label ?? null,
    type: m.type?.label ?? null,
    severity: m.severity?.label ?? null,
    severityCode: m.severity?.code ?? null,
    assetType: m.asset_type,
    view: m.view,
    x: Number(m.x_position),
    y: Number(m.y_position),
    photoUrl: m.photo_url ?? null,
    modelAssetId: m.model_asset_id,
  }))

  const views: ReportDamageView[] = []
  const seen = new Set<string>()
  const { getVehicle2dAssetViews } = await import('./vehicle-model-assets')
  const urlsByAsset = new Map<string, Awaited<ReturnType<typeof getVehicle2dAssetViews>>>()
  for (const pin of pins) {
    if (pin.assetType !== '2d' || !pin.view || !pin.modelAssetId) continue
    const key = `${pin.modelAssetId}:${pin.view}`
    if (seen.has(key)) continue
    seen.add(key)
    if (!urlsByAsset.has(pin.modelAssetId)) urlsByAsset.set(pin.modelAssetId, await getVehicle2dAssetViews(admin, pin.modelAssetId))
    const urls = urlsByAsset.get(pin.modelAssetId)
    if (urls) views.push({ modelAssetId: pin.modelAssetId, view: pin.view, imageUrl: urls[pin.view] })
  }
  const viewOrder: DamageMarkerView[] = ['top', 'side', 'front', 'rear']
  views.sort((a, b) => viewOrder.indexOf(a.view) - viewOrder.indexOf(b.view))
  return { pins, views }
}

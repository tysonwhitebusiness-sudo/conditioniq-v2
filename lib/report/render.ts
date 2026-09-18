import React from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateVehicleScore } from '@/lib/vehicle-score'
import { renderReportToBuffer } from './render-document'
import { buildReportModel } from './model'
import { loadReportImage, loadDiagramImage, type ReportImage } from './photos'
import ReportDocument, { type ReportDiagram } from './report-document'
import type { ReportDamagePin } from '@/lib/damage-server-actions'

// R1 · Report foundation.
//
// Reports are built here, on the server, from the inspection id alone. They used
// to be built in whichever browser asked for one, which is why the same
// inspection could come out differently on a phone and a laptop, and why the
// browser had to download every photo first.

const REPORT_BUCKET = 'inspection-reports'
const PHOTO_BUCKET = 'inspection-photos'
const MODEL_ASSET_BUCKET = 'vehicle-model-assets'
const BRANDING_BUCKET = 'branding'
const SIGNED_URL_TTL = 60 * 60

export interface RenderedReport {
  buffer: Buffer
  path: string
  bytes: number
}

async function loadDamage(inspectionId: string): Promise<{ pins: ReportDamagePin[]; diagrams: ReportDiagram[] }> {
  const admin = createAdminClient()
  const { data: markers } = await admin
    .from('damage_markers')
    .select('id, area:area_code_id(label), type:type_code_id(label), severity:severity_code_id(code, label), asset_type, view, x_position, y_position, model_asset_id, photo_path')
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: true })

  const pins: ReportDamagePin[] = await Promise.all((markers ?? []).map(async (m: any, i: number) => {
    let photoUrl: string | null = null
    if (m.photo_path) {
      const { data } = await admin.storage.from(PHOTO_BUCKET).createSignedUrl(m.photo_path, SIGNED_URL_TTL)
      photoUrl = data?.signedUrl ?? null
    }
    return {
      number: i + 1,
      area: m.area?.label ?? null,
      type: m.type?.label ?? null,
      severity: m.severity?.label ?? null,
      severityCode: m.severity?.code ?? null,
      assetType: m.asset_type,
      view: m.view,
      x: Number(m.x_position),
      y: Number(m.y_position),
      photoUrl,
      modelAssetId: m.model_asset_id,
    }
  }))

  // One diagram per 2D view that actually has a pin on it.
  const diagrams: ReportDiagram[] = []
  const seen = new Set<string>()
  for (const pin of pins) {
    if (pin.assetType !== '2d' || !pin.view || !pin.modelAssetId) continue
    const key = `${pin.modelAssetId}:${pin.view}`
    if (seen.has(key)) continue
    seen.add(key)
    const { data: asset } = await admin
      .from('vehicle_model_assets')
      .select('top_path, front_path, side_path, rear_path')
      .eq('id', pin.modelAssetId)
      .maybeSingle()
    const path = asset?.[`${pin.view}_path` as 'top_path']
    if (!path) continue
    const url = admin.storage.from(MODEL_ASSET_BUCKET).getPublicUrl(path).data.publicUrl
    const image = await loadDiagramImage(url)
    if (image) diagrams.push({ view: pin.view, image, aspect: image.aspect, modelAssetId: pin.modelAssetId })
  }
  const order = ['rear', 'side', 'top', 'front']
  diagrams.sort((a, b) => order.indexOf(a.view) - order.indexOf(b.view))

  return { pins, diagrams }
}

async function loadBranding(companyId: string | null | undefined) {
  if (!companyId) return { companyName: null, logo: null as ReportImage | null, headerColor: null, accentColor: null }
  const admin = createAdminClient()
  const { data: company } = await admin
    .from('companies')
    .select('name, logo_url, brand_header_color, brand_accent_color')
    .eq('id', companyId)
    .maybeSingle()
  if (!company) return { companyName: null, logo: null as ReportImage | null, headerColor: null, accentColor: null }

  let logo: ReportImage | null = null
  if (company.logo_url) {
    const { data } = await admin.storage.from(BRANDING_BUCKET).createSignedUrl(company.logo_url, SIGNED_URL_TTL)
    if (data?.signedUrl) logo = await loadReportImage(data.signedUrl)
  }
  return { companyName: company.name ?? null, logo, headerColor: company.brand_header_color ?? null, accentColor: company.brand_accent_color ?? null }
}

/** Renders one inspection's report. Does not upload it. */
export async function renderInspectionReport(inspectionId: string): Promise<RenderedReport> {
  const admin = createAdminClient()

  const { data: inspection, error } = await admin.from('vehicle_inspections').select('*').eq('id', inspectionId).single()
  if (error || !inspection) throw new Error(`Inspection ${inspectionId} not found`)

  const [{ pins, diagrams }, branding, inspector] = await Promise.all([
    loadDamage(inspectionId),
    loadBranding(inspection.company_id),
    inspection.inspector_id
      ? admin.from('user_profiles').select('full_name').eq('id', inspection.inspector_id).maybeSingle().then(r => r.data?.full_name ?? null)
      : Promise.resolve(null),
  ])

  const score = calculateVehicleScore(inspection)
  const model = buildReportModel(inspection, score, pins, {
    companyName: branding.companyName,
    inspectorName: inspector ?? inspection.inspector_name ?? null,
  })

  // Every photo the document can draw, fetched and resized once.
  const sources = new Set<string>()
  for (const photo of model.photos) sources.add(photo.src)
  if (model.leadPhotoSrc) sources.add(model.leadPhotoSrc)
  if (model.signatureSrc) sources.add(model.signatureSrc)
  for (const pin of pins) if (pin.photoUrl) sources.add(pin.photoUrl)

  const list = Array.from(sources)
  const loaded = await Promise.all(list.map(src => loadReportImage(src)))
  const images = Object.fromEntries(list.map((src, i) => [src, loaded[i]]))

  const buffer = await renderReportToBuffer(
    React.createElement(ReportDocument, {
      model,
      images,
      diagrams,
      branding: { logo: branding.logo, headerColor: branding.headerColor, accentColor: branding.accentColor },
    }) as any,
  )

  return { buffer, path: `${inspectionId}.pdf`, bytes: buffer.length }
}

/** Renders, stores and returns a link to the report. */
export async function generateAndStoreReport(inspectionId: string): Promise<{ path: string; url: string | null; bytes: number }> {
  const { buffer, path, bytes } = await renderInspectionReport(inspectionId)
  const admin = createAdminClient()

  const { error } = await admin.storage.from(REPORT_BUCKET).upload(path, buffer, { contentType: 'application/pdf', upsert: true })
  if (error) throw new Error(`Report upload failed: ${error.message}`)

  await admin
    .from('vehicle_inspections')
    .update({ report_generated: true, report_url: path, report_generated_at: new Date().toISOString() })
    .eq('id', inspectionId)

  const { data: signed } = await admin.storage.from(REPORT_BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  return { path, url: signed?.signedUrl ?? null, bytes }
}

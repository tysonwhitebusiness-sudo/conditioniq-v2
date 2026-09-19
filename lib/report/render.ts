import React from 'react'
import QRCode from 'qrcode'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateVehicleScore } from '@/lib/vehicle-score'
import { renderReportToBuffer } from './render-document'
import { buildReportModel } from './model'
import { photoCheckLine, type StoredPhotoCheck } from './photo-check-line'
import { buildReportAssist, assistInputHash, REPORT_ASSIST_VERSION, type StoredAssist } from '@/lib/ai/report-assist'
import { reportVerifyUrl, reportStoragePath } from './layout'
import { loadReportImage, loadDiagramImage, type ReportImage } from './photos'
import ReportDocument, { type ReportDiagram } from './report-document'
import type { ReportDamagePin } from '@/lib/damage-server-actions'
import { findCheckin } from '@/lib/ai/checkin-compare-server'
import { COMPARE_THRESHOLD } from '@/lib/ai/checkin-compare'
import { checkinSide, type ReportCheckin } from './checkin-line'

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

// A0 · The five-digit AIAG damage code: area (2), type (2), severity (1).
// Printed only when all three parts are known.
function aiagCode(area: number | null | undefined, type: number | null | undefined, severity: number | null | undefined): string | null {
  if (area == null || type == null || severity == null) return null
  return `${String(area).padStart(2, '0')}${String(type).padStart(2, '0')}${severity}`
}

async function loadCheckin(inspectionId: string, pins: ReportDamagePin[]): Promise<ReportCheckin> {
  const admin = createAdminClient()
  const checkin = await findCheckin(admin, inspectionId)
  if (!checkin) return { status: 'none' }
  const ref = { date: checkin.createdAt, reportNo: checkin.id.slice(0, 8).toUpperCase() }
  const [{ data: compares }, { data: open }] = await Promise.all([
    admin.from('checkin_compares').select('slot, outcome').eq('inspection_id', inspectionId),
    admin.from('damage_suggestions').select('confidence').eq('inspection_id', inspectionId).eq('kind', 'new_since_checkin').eq('status', 'pending'),
  ])
  if (!compares?.some(c => c.outcome === 'compared')) return { status: 'not_compared', ...ref }
  return {
    status: 'compared',
    ...ref,
    newPins: pins.filter(p => p.newSinceCheckin).map(p => p.number),
    unreviewed: (open ?? []).filter(o => Number(o.confidence) >= COMPARE_THRESHOLD).length,
    notCompared: compares.filter(c => c.outcome !== 'compared').map(c => checkinSide(c.slot)),
  }
}

async function loadDamage(inspectionId: string): Promise<{ pins: ReportDamagePin[]; diagrams: ReportDiagram[] }> {
  const admin = createAdminClient()
  const { data: markers } = await admin
    .from('damage_markers')
    .select('id, area:area_code_id(label, aiag_code), type:type_code_id(label, aiag_code), severity:severity_code_id(code, label), asset_type, view, x_position, y_position, model_asset_id, photo_path, suggestion_id, suggestion:suggestion_id(kind)')
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
      aiagCode: aiagCode(m.area?.aiag_code, m.type?.aiag_code, m.severity?.code),
      assetType: m.asset_type,
      view: m.view,
      x: Number(m.x_position),
      y: Number(m.y_position),
      photoUrl,
      modelAssetId: m.model_asset_id,
      suggested: !!m.suggestion_id,
      newSinceCheckin: m.suggestion?.kind === 'new_since_checkin',
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

/**
 * Renders one inspection's report. Does not upload it.
 * saveAssist: false builds the summary and recommendations without storing
 * them on the inspection (for tests against real inspections).
 */
export async function renderInspectionReport(inspectionId: string, options: { saveAssist?: boolean } = {}): Promise<RenderedReport> {
  const admin = createAdminClient()

  const { data: inspection, error } = await admin.from('vehicle_inspections').select('*').eq('id', inspectionId).single()
  if (error || !inspection) throw new Error(`Inspection ${inspectionId} not found`)

  const [{ pins, diagrams }, branding, inspector, inspectionType] = await Promise.all([
    loadDamage(inspectionId),
    loadBranding(inspection.company_id),
    inspection.inspector_id
      ? admin.from('user_profiles').select('full_name').eq('id', inspection.inspector_id).maybeSingle().then(r => r.data?.full_name ?? null)
      : Promise.resolve(null),
    // Whether this was a check-in or check-out is kept on the vehicle, not the
    // inspection.
    admin.from('storage_vehicles')
      .select('checkin_inspection_id, checkout_inspection_id')
      .or(`checkin_inspection_id.eq.${inspectionId},checkout_inspection_id.eq.${inspectionId}`)
      .limit(1)
      .maybeSingle()
      .then(r => (r.data?.checkin_inspection_id === inspectionId ? 'check_in' as const : r.data?.checkout_inspection_id === inspectionId ? 'check_out' as const : null)),
  ])

  const score = calculateVehicleScore(inspection)
  const model = buildReportModel(inspection, score, pins, {
    companyName: branding.companyName,
    inspectorName: inspector ?? inspection.inspector_name ?? null,
    inspectionType,
  })

  // G · A check-out says what its check-in comparison found, or that there was none.
  if (inspectionType === 'check_out') model.checkin = await loadCheckin(inspectionId, pins)

  // D · The photo check line: always read fresh, since photos can be retaken
  // without the recorded answers changing.
  const { data: checks } = await admin.from('photo_checks').select('slot, problems, right_subject, framed, note, odometer_read, odometer_unit, odometer_status, fuel_level').eq('inspection_id', inspectionId)
  const photoLine = photoCheckLine((checks ?? []) as StoredPhotoCheck[])

  // E · The odometer and fuel gauge, from the odometer close-up if there is one,
  // otherwise the dashboard photo.
  const gaugeRow = ['odometerPhoto', 'dashboardPhoto'].map(slot => (checks ?? []).find(c => c.slot === slot && c.odometer_status)).find(Boolean)
  if (gaugeRow) {
    model.gauges = { odometerStatus: gaugeRow.odometer_status, odometerRead: gaugeRow.odometer_read, unit: gaugeRow.odometer_unit, fuel: gaugeRow.fuel_level == null ? null : Number(gaugeRow.fuel_level) }
  }

  // C · The summary and recommendations. Reused when they were written by AI
  // from the same recorded answers; otherwise built (again), so a report made
  // while AI was off picks up the written summary once it is back on.
  const inputHash = assistInputHash(model)
  const stored = inspection.report_assist as StoredAssist | null
  if (stored?.inputHash === inputHash && stored.assist?.aiWritten) {
    model.assist = stored.assist
  } else {
    model.assist = await buildReportAssist(model, { companyId: inspection.company_id ?? null, inspectionId })
    if (options.saveAssist !== false) {
      const record: StoredAssist = { version: REPORT_ASSIST_VERSION, inputHash, builtAt: new Date().toISOString(), assist: model.assist }
      const { error: saveError } = await admin.from('vehicle_inspections').update({ report_assist: record }).eq('id', inspectionId)
      if (saveError) console.error('[report] could not keep the summary', saveError.message)
    }
  }
  if (photoLine.text) {
    model.assist = { ...model.assist, photoCheck: photoLine.text, aiWritten: model.assist.aiWritten || photoLine.usedAi }
  }

  // Every photo the document can draw, fetched and resized once.
  const sources = new Set<string>()
  for (const photo of model.photos) sources.add(photo.src)
  if (model.leadPhotoSrc) sources.add(model.leadPhotoSrc)
  if (model.signatureSrc) sources.add(model.signatureSrc)
  for (const pin of pins) if (pin.photoUrl) sources.add(pin.photoUrl)

  const list = Array.from(sources)
  const loaded = await Promise.all(list.map(src => loadReportImage(src)))
  const images = Object.fromEntries(list.map((src, i) => [src, loaded[i]]))

  // The certification card carries the verify link as a QR code. A report
  // without one is still a report, so a failure here is not an error.
  const qr = await QRCode.toBuffer(reportVerifyUrl(model.reportNo), { margin: 0, width: 240, errorCorrectionLevel: 'M' })
    .then(data => ({ data, format: 'png' as const }))
    .catch(() => null)

  const buffer = await renderReportToBuffer(
    React.createElement(ReportDocument, {
      model,
      images,
      diagrams,
      branding: { logo: branding.logo, headerColor: branding.headerColor, accentColor: branding.accentColor },
      qr,
    }) as any,
  )

  return { buffer, path: reportStoragePath(inspectionId), bytes: buffer.length }
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

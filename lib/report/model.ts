import type { ScoreResult } from '@/lib/vehicle-score'
import type { ReportDamagePin } from '@/lib/damage-server-actions'

// R1 · Report foundation.
//
// One place that decides what a report says about a vehicle, so every screen
// that generates one gets the same answer. The old report read fields that the
// wizard never writes, which is why reports opened from the inspections list
// said "Unknown Vehicle" and why trim, engine and fuel never printed.
//
// An inspection reaches here in one of two shapes: the row as stored (columns
// vin, make, model, year…) or the wizard's own object, which nests the same
// facts under vehicleInfo with the VIN lookup under vehicleInfo.advancedInfo.
// Both are read here, column first.

export interface ReportPhoto {
  /** What the caption says. */
  label: string
  /** Where the photo came from — a storage URL, a path, or image data. */
  src: string
  /** Its number in the report's photo list. */
  number: number
  group: 'exterior' | 'interior' | 'engine' | 'documents'
}

// R3 · Slots the approved layout reserves for the AI plan (phase C and D).
// Each one prints only when it is filled, so a report without AI looks
// finished rather than gappy.
export type RecommendationUrgency = 'Before road use' | 'Soon' | 'Reconditioning'

export interface ReportRecommendation {
  urgency: RecommendationUrgency
  action: string
  why?: string
  source: string
}

export interface ReportRecall {
  id: string
  component: string
  summary: string
  reportedOn?: string
}

export interface ReportAssist {
  /** One or two short sentences, each printed on its own line. */
  verdict?: string[]
  summary?: string
  recommendations?: ReportRecommendation[]
  recalls?: ReportRecall[]
  complaints?: { count: number; topAreas: string[] }
  photoCheck?: string
}

export interface ReportModel {
  inspectionId: string
  reportNo: string
  companyName: string | null
  inspectorName: string | null
  date: Date
  vin: string
  title: string
  /** Year, make and model without the trim — "2024 Nissan Altima". */
  name: string
  year: string | null
  make: string | null
  model: string | null
  trim: string | null
  bodyClass: string | null
  driveType: string | null
  engine: string | null
  fuel: string | null
  odometer: string | null
  location: string | null
  assetId: string | null
  inspectionType: string
  sections: {
    bol: Record<string, any>
    keys: Record<string, any>
    documentation: Record<string, any>
    exterior: Record<string, any>
    interior: Record<string, any>
    engine: Record<string, any>
    function: Record<string, any>
  }
  tests: Record<string, string>
  score: ScoreResult
  pins: ReportDamagePin[]
  photos: ReportPhoto[]
  leadPhotoSrc: string | null
  signatureSrc: string | null
  /** When the inspector signed, if recorded; the report date otherwise. */
  signedAt: Date | null
  /** When the inspection was started, if recorded. */
  startedAt: Date | null
  /** Where the inspector was when signing, if the device shared it. */
  signedFrom: { lat: number; lng: number } | null
  /** A stored engine-start video, if one was uploaded. */
  engineStartVideoUrl: string | null
  /** Filled by the AI plan when it runs; empty until then. */
  assist: ReportAssist
  /** True when the vehicle details came from a NHTSA VIN decode. */
  decodedByNhtsa: boolean
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

// Photo slots in the order the report shows them, with the caption each one
// carries. Extra photos (extra_int_photo_…, damage close-ups) are picked up
// separately, after these.
const PHOTO_SLOTS: Array<[ReportPhoto['group'], keyof ReportModel['sections'], string, string]> = [
  ['exterior', 'exterior', 'exteriorFrontPhoto', 'Front'],
  ['exterior', 'exterior', 'exteriorRearPhoto', 'Rear'],
  ['exterior', 'exterior', 'exteriorDriverPhoto', 'Driver side'],
  ['exterior', 'exterior', 'exteriorPassengerPhoto', 'Passenger side'],
  ['interior', 'interior', 'interiorDriverDoorPhoto', 'Driver door'],
  ['interior', 'interior', 'interiorRearDriverDoorPhoto', 'Rear driver door'],
  ['interior', 'interior', 'interiorTrunkPhoto', 'Trunk'],
  ['interior', 'interior', 'interiorRearPassengerDoorPhoto', 'Rear passenger door'],
  ['interior', 'interior', 'interiorPassengerDoorPhoto', 'Passenger door'],
  ['interior', 'interior', 'dashboardPhoto', 'Dashboard'],
  // Recorded by an earlier version of the interior step.
  ['interior', 'interior', 'interiorFrontPhoto', 'Interior front'],
  ['interior', 'interior', 'interiorRearPhoto', 'Interior rear'],
  // The wizard saves the engine bay as engineBayPhoto; the old report looked for
  // enginePhoto, so this photo never printed. Both names are read here.
  ['engine', 'engine', 'engineBayPhoto', 'Engine bay'],
  ['engine', 'engine', 'enginePhoto', 'Engine bay'],
  ['engine', 'engine', 'leakPhoto', 'Leak'],
  ['documents', 'interior', 'odometerPhoto', 'Odometer'],
  ['documents', 'documentation', 'licensePlatePhoto', 'License plate'],
  ['documents', 'documentation', 'registrationPhoto', 'Registration'],
  ['documents', 'documentation', 'insurancePhoto', 'Insurance'],
  ['documents', 'bol', 'bolPhoto', 'Bill of lading'],
  ['documents', 'keys', 'keysPhoto', 'Keys'],
]

const EXTRA_PHOTO_PREFIXES: Array<[RegExp, ReportPhoto['group'], string]> = [
  [/^extra_ext_photo_/, 'exterior', 'Additional exterior'],
  [/^extra_int_photo_/, 'interior', 'Additional interior'],
  [/^damage_photo_/, 'exterior', 'Damage close-up'],
]

const isPhoto = (v: unknown): v is string =>
  typeof v === 'string' && (v.startsWith('data:image') || /^https?:/.test(v) || v.includes('/storage/'))

// R4 · Damage recorded on the list form (before the damage diagram, or on a
// vehicle without one) prints alongside diagram pins. Its close-up is saved on
// the section as damage_photo_<id>, so it prints with its damage rather than as
// a loose photo.
function listDamage(sections: ReportModel['sections'], firstNumber: number): { pins: ReportDamagePin[]; photos: Set<string> } {
  const pins: ReportDamagePin[] = []
  const photos = new Set<string>()
  const words = (v: unknown) => (str(v) ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  for (const [side, section] of [['exterior', sections.exterior], ['interior', sections.interior]] as const) {
    const items: any[] = Array.isArray(section?.damages) ? section.damages : []
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const photo = item.id != null ? section[`damage_photo_${item.id}`] : null
      if (isPhoto(photo)) photos.add(photo)
      const type = words(item.type) || null
      const description = str(item.description)
      pins.push({
        number: firstNumber + pins.length,
        area: [side === 'interior' ? 'Interior' : null, words(item.location) || null].filter(Boolean).join(' · ') || null,
        type: description && type && description.toLowerCase() !== type.toLowerCase() ? `${type} — ${description}` : type ?? description,
        severity: words(item.severity) || null,
        severityCode: null,
        assetType: null,
        view: null,
        x: 0,
        y: 0,
        photoUrl: isPhoto(photo) ? photo : isPhoto(item.photo) ? item.photo : null,
        modelAssetId: null,
      })
    }
  }
  return { pins, photos }
}

const gpsPoint = (v: any): { lat: number; lng: number } | null => {
  const lat = Number(v?.lat ?? v?.latitude), lng = Number(v?.lng ?? v?.lon ?? v?.longitude)
  return isFinite(lat) && isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null
}

function engineFrom(decoded: Record<string, any>): string | null {
  const litres = str(decoded.displacementL ?? decoded.displacement_l ?? decoded.DisplacementL)
  const cylinders = str(decoded.engineCylinders ?? decoded.engine_cylinders ?? decoded.EngineCylinders)
  const litresText = litres && !isNaN(parseFloat(litres)) ? `${parseFloat(litres).toFixed(1)}L` : litres
  if (litresText && cylinders) return `${litresText} V${cylinders}`
  return litresText ?? (cylinders ? `V${cylinders}` : str(decoded.engineType ?? decoded.engine_type ?? decoded.engine))
}

export function buildReportModel(
  inspection: Record<string, any>,
  score: ScoreResult,
  pins: ReportDamagePin[],
  extras: { companyName?: string | null; inspectorName?: string | null; inspectionType?: 'standard' | 'check_in' | 'check_out' | null } = {},
): ReportModel {
  const vehicleInfo: Record<string, any> = inspection.vehicleInfo ?? {}
  // What the VIN lookup returned, wherever it was stored.
  const decoded: Record<string, any> = vehicleInfo.advancedInfo ?? inspection.advancedInfo ?? vehicleInfo

  const sections = {
    bol: inspection.bol_data ?? {},
    keys: inspection.keys_data ?? {},
    documentation: inspection.documentation_data ?? {},
    exterior: inspection.exterior_data ?? {},
    interior: inspection.interior_data ?? {},
    engine: inspection.engine_data ?? {},
    function: inspection.vehicle_function_data ?? {},
  }

  // Older inspections stored the function tests flat instead of under tests.
  const rawTests = sections.function.tests ?? sections.function
  const tests: Record<string, string> = Object.fromEntries(
    Object.entries(rawTests ?? {}).filter(([, v]) => typeof v === 'string' && ['pass', 'fail', 'nt', 'not_tested'].includes(v as string)),
  ) as Record<string, string>

  const vin = str(inspection.vin) ?? str(vehicleInfo.vin) ?? '—'
  const year = str(inspection.year) ?? str(vehicleInfo.year)
  const make = str(inspection.make) ?? str(vehicleInfo.make)
  const model = str(inspection.model) ?? str(vehicleInfo.model)
  // Makes arrive in capitals from the VIN decode (NISSAN); the title reads as a
  // name, with the trim when it is known — 2024 Nissan Altima S.
  const trimText = str(decoded.trim ?? decoded.vehicleTrim ?? decoded.Trim)
  const makeText = make && make === make.toUpperCase() && make.length > 3 ? make.charAt(0) + make.slice(1).toLowerCase() : make
  const title = [year, makeText, model, trimText].filter(Boolean).join(' ') || 'Unknown Vehicle'

  const listed = listDamage(sections, pins.length + 1)
  const allPins = [...pins, ...listed.pins]

  const photos: ReportPhoto[] = []
  // A list-form damage close-up prints with its damage, not in the gallery.
  const seen = new Set<string>(listed.photos)
  let number = 0
  for (const [group, section, key, label] of PHOTO_SLOTS) {
    const value = (sections as any)[section]?.[key]
    if (!isPhoto(value) || seen.has(value)) continue
    seen.add(value)
    photos.push({ group, label, src: value, number: ++number })
  }
  for (const [sectionKey, section] of Object.entries(sections)) {
    for (const [key, value] of Object.entries(section ?? {})) {
      if (!isPhoto(value) || seen.has(value)) continue
      const extra = EXTRA_PHOTO_PREFIXES.find(([re]) => re.test(key))
      if (!extra) continue
      seen.add(value)
      photos.push({ group: extra[1], label: extra[2], src: value, number: ++number })
      void sectionKey
    }
  }

  const leadPhotoSrc =
    [vehicleInfo.baselinePhoto, vehicleInfo.vehiclePhoto, inspection.baseline_photo, inspection.vehicle_photo]
      .find(isPhoto) ??
    photos.find(p => p.label === 'Passenger side')?.src ??
    photos.find(p => p.group === 'exterior')?.src ??
    null

  const created = inspection.created_at ?? inspection.timestamp ?? inspection.inspection_date
  const typeCode = extras.inspectionType ?? str(vehicleInfo.inspectionType)
  const video = str(sections.function.engineStartVideo)
  const id = str(inspection.inspectionId ?? inspection.id) ?? ''

  return {
    inspectionId: id,
    reportNo: id ? id.slice(0, 8).toUpperCase() : '—',
    companyName: extras.companyName ?? null,
    inspectorName: extras.inspectorName ?? str(inspection.inspector_name) ?? str(vehicleInfo.inspectorName),
    date: created ? new Date(created) : new Date(),
    vin,
    title,
    name: [year, makeText, model].filter(Boolean).join(' ') || title,
    year,
    make,
    model,
    trim: str(decoded.trim ?? decoded.vehicleTrim ?? decoded.Trim),
    bodyClass: str(decoded.bodyClass ?? decoded.body_class ?? decoded.BodyClass ?? vehicleInfo.bodyClass),
    driveType: str(decoded.driveType ?? decoded.drive_type ?? decoded.DriveType),
    engine: engineFrom(decoded),
    fuel: str(decoded.fuelType ?? decoded.fuel_type ?? decoded.fuelTypePrimary ?? decoded.FuelTypePrimary),
    odometer: str(inspection.odometer) ?? str(vehicleInfo.odometer),
    location: str(inspection.location) ?? str(vehicleInfo.location) ?? str(inspection.inspection_location),
    assetId: str(inspection.asset_id) ?? str(vehicleInfo.assetId),
    inspectionType: typeCode === 'check_in' ? 'Check-in' : typeCode === 'check_out' ? 'Check-out' : 'Standard',
    sections,
    tests,
    score,
    pins: allPins,
    photos,
    leadPhotoSrc,
    signatureSrc: isPhoto(inspection.signature_url) ? inspection.signature_url : null,
    signedAt: inspection.signed_at ? new Date(inspection.signed_at) : null,
    startedAt: inspection.initiated_at ? new Date(inspection.initiated_at) : null,
    signedFrom: gpsPoint(inspection.gps_end) ?? gpsPoint(inspection.gps_start),
    // Videos saved as blob: links only ever existed on the recording device.
    engineStartVideoUrl: video && /^https?:/.test(video) ? video : null,
    assist: {},
    decodedByNhtsa: !!(vehicleInfo.advancedInfo ?? inspection.advancedInfo),
  }
}

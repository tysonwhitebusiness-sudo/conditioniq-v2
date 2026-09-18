// R1 and R2 · the page and the photo boxes.
//
// Every number the report is drawn with lives here, so the layout can be
// checked against the approved mockup instead of being spread through the
// component.

/** US Letter in points. Customers print on Letter, not A4. */
export const PAGE = { size: 'LETTER' as const, width: 612, height: 792, margin: 36 }
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2 // 540

// R2 · Photo system.
//
// A photo's box no longer depends on the photo. Each kind of photo has a fixed
// shape and the photo is scaled to fill it, so a tall phone photo and a wide
// laptop photo lay out identically. Documents are the exception: they are shown
// whole on a light panel, because a cropped registration is useless.
export const PHOTO_BOXES = {
  lead: { ratio: 16 / 6.6, fit: 'cover' as const, radius: 6 },
  gallery: { ratio: 4 / 3, fit: 'cover' as const, radius: 4, columns: 4, gap: 6 },
  heroPair: { ratio: 16 / 8.5, fit: 'cover' as const, radius: 6, columns: 2, gap: 6 },
  damage: { ratio: 1, fit: 'cover' as const, radius: 5, width: 110 },
  damageThumb: { ratio: 1, fit: 'cover' as const, radius: 3, width: 40 },
  document: { ratio: 3 / 4, fit: 'contain' as const, radius: 4, width: 62 },
  signature: { ratio: 3, fit: 'contain' as const, radius: 0, width: 180 },
} as const

export type PhotoBox = keyof typeof PHOTO_BOXES

/** Width of one cell in a grid of `columns` across the content width. */
export function columnWidth(columns: number, gap: number, within = CONTENT_WIDTH): number {
  return (within - gap * (columns - 1)) / columns
}

/** The box a photo is drawn in, given the space it sits in. */
export function photoBox(kind: PhotoBox, width?: number) {
  const box = PHOTO_BOXES[kind] as { ratio: number; fit: 'cover' | 'contain'; radius: number; width?: number; columns?: number; gap?: number }
  const w = width ?? box.width ?? (box.columns ? columnWidth(box.columns, box.gap ?? 0) : CONTENT_WIDTH)
  return { width: w, height: w / box.ratio, fit: box.fit, radius: box.radius }
}

// P1 · Camera confirm.
//
// The camera's confirm screen shows each photo inside the box it will print in,
// so the shapes are defined once, here, and read by both the camera and the
// report. Change a box and both follow.
export type ReportBoxKind = 'gallery' | 'lead' | 'damage' | 'document'

export const REPORT_BOX_PREVIEW: Record<ReportBoxKind, { ratio: number; fit: 'cover' | 'contain' }> = {
  gallery: { ratio: PHOTO_BOXES.gallery.ratio, fit: PHOTO_BOXES.gallery.fit },
  lead: { ratio: PHOTO_BOXES.lead.ratio, fit: PHOTO_BOXES.lead.fit },
  damage: { ratio: PHOTO_BOXES.damage.ratio, fit: PHOTO_BOXES.damage.fit },
  document: { ratio: PHOTO_BOXES.document.ratio, fit: PHOTO_BOXES.document.fit },
}

const DOCUMENT_FIELDS = new Set(['licensePlatePhoto', 'registrationPhoto', 'insurancePhoto', 'bolPhoto', 'keysPhoto'])

/** Which report box a photo field prints in. Mirrors the grouping in model.ts. */
export function reportBoxForField(fieldKey: string): ReportBoxKind {
  if (DOCUMENT_FIELDS.has(fieldKey)) return 'document'
  if (fieldKey === 'baselinePhoto' || fieldKey === 'vehiclePhoto') return 'lead'
  if (/^damage/i.test(fieldKey)) return 'damage'
  return 'gallery'
}

// R3 · Where a printed report can be checked, and the clock it is dated by.
//
// Reports render on the server, which runs on UTC; printing that time would put
// an afternoon inspection on the next morning. Dates and times print in US
// Central with the zone named, until companies carry their own time zone.
export const REPORT_TIME_ZONE = 'America/Chicago'
export const REPORT_VERIFY_HOST = 'conditioniq.app'

export function reportVerifyUrl(reportNo: string): string {
  return `https://${REPORT_VERIFY_HOST}/r/${reportNo}`
}

export function reportVerifyText(reportNo: string): string {
  return `Verify at ${REPORT_VERIFY_HOST}/r/${reportNo}`
}

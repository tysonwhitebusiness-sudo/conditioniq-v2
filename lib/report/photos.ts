import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'

// R2 · Photo system.
//
// Every photo in a report is fetched here, on the server, and resized before it
// goes into the PDF. Reports used to embed photos at capture resolution, which
// made them 2 to 5 MB; 1,000 pixels on the long edge is more than any box on
// the page can show at print resolution.
//
// Photos arrive as one of three things, depending on when the inspection was
// recorded: a storage URL, a storage path, or — for inspections from before
// July 2026 — base64 image data inside the row.

const MAX_EDGE = 1000
const QUALITY = 74

export interface ReportImage {
  data: Buffer
  format: 'jpg'
  /** Natural size after rotation, for callers that need the shape. */
  width: number
  height: number
}

function storagePathFrom(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/object\/(?:sign|public|authenticated)\/([^/]+)\/([^?]+)/)
  return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null
}

async function fetchBytes(src: string): Promise<Buffer | null> {
  if (src.startsWith('data:')) {
    const base64 = src.split(',')[1]
    return base64 ? Buffer.from(base64, 'base64') : null
  }

  // A signed URL can expire; go through storage directly so a year-old report
  // still renders.
  const stored = storagePathFrom(src)
  if (stored) {
    const { data } = await createAdminClient().storage.from(stored.bucket).download(stored.path)
    if (data) return Buffer.from(await data.arrayBuffer())
  }

  if (/^https?:/.test(src)) {
    const res = await fetch(src)
    if (res.ok) return Buffer.from(await res.arrayBuffer())
  }

  return null
}

const cache = new Map<string, ReportImage | null>()

/**
 * A photo ready to embed: rotated upright, resized, re-encoded.
 * Returns null when it cannot be read, so one missing photo never fails a
 * report — the box is simply left empty.
 */
export async function loadReportImage(src: string | null | undefined): Promise<ReportImage | null> {
  if (!src) return null
  if (cache.has(src)) return cache.get(src) ?? null

  let result: ReportImage | null = null
  try {
    const bytes = await fetchBytes(src)
    if (bytes) {
      const pipeline = sharp(bytes).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      const { data, info } = await pipeline.jpeg({ quality: QUALITY }).toBuffer({ resolveWithObject: true })
      result = { data, format: 'jpg', width: info.width, height: info.height }
    }
  } catch (e) {
    console.error('[report] photo unavailable', e instanceof Error ? e.message : e)
  }

  cache.set(src, result)
  return result
}

/** Loads a set of photos at once, keyed the same way they were passed in. */
export async function loadReportImages(sources: Record<string, string | null | undefined>): Promise<Record<string, ReportImage | null>> {
  const keys = Object.keys(sources)
  const loaded = await Promise.all(keys.map(k => loadReportImage(sources[k])))
  return Object.fromEntries(keys.map((k, i) => [k, loaded[i]]))
}

/** Diagram images (the 2D vehicle views) keep their own proportions. */
export async function loadDiagramImage(src: string): Promise<(ReportImage & { aspect: number }) | null> {
  const img = await loadReportImage(src)
  if (!img) return null
  return { ...img, aspect: img.height / img.width }
}

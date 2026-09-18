import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { TextLine } from './plate'

// S · The text reader: PaddleOCR (PP-OCRv4) running on our server.
//
// Free to run and measured far ahead of Tesseract on real plate photos (16 of
// 16 against 1 of 16). It runs here rather than on the phone so an inspector
// never downloads its 26 MB of models over a lot's cellular signal; the photo
// is on its way to the server anyway.

if (typeof window !== 'undefined') throw new Error('lib/scan/reader is server-only')

type OcrInstance = { detect(path: string): Promise<Array<{ text: string; mean: number; box?: number[][] }>> }
let ocrPromise: Promise<OcrInstance> | null = null

function getOcr(): Promise<OcrInstance> {
  // Loaded once per server instance; the first read pays for loading models.
  ocrPromise ??= import('@gutenye/ocr-node').then(m => (m.default as any).create() as Promise<OcrInstance>)
  ocrPromise.catch(() => { ocrPromise = null })
  return ocrPromise
}

/** A photo, upright and no wider than the reader needs, as JPEG. */
export async function prepareImage(input: Buffer, maxEdge = 1600): Promise<Buffer> {
  return sharp(input).rotate().resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
}

/** Every line of text the reader finds, with its confidence and height. */
export async function readText(image: Buffer): Promise<TextLine[]> {
  const ocr = await getOcr()
  const path = join(tmpdir(), `scan-${randomUUID()}.jpg`)
  await writeFile(path, image)
  try {
    const lines = await ocr.detect(path)
    return lines.map(l => {
      const ys = (l.box ?? []).map(p => p[1])
      return { text: l.text, confidence: l.mean, height: ys.length ? Math.max(...ys) - Math.min(...ys) : 0 }
    })
  } finally {
    unlink(path).catch(() => {})
  }
}

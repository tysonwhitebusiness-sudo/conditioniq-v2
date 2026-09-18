// S · The browser side of a VIN or plate read. Nothing is read here but the
// barcode; a photo goes to /api/scan, which returns a value for the inspector
// to confirm, never one that is saved on its own.

export interface ScanResult {
  id: string | null
  value: string | null
  source: 'barcode' | 'reader' | 'ai' | null
}

/** A phone photo shrunk to what the reader needs, so the upload stays small. */
async function shrink(dataUrl: string, maxEdge = 1600): Promise<string> {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight))
  if (scale === 1 && dataUrl.length < 1_500_000) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * scale)
  canvas.height = Math.round(img.naturalHeight * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.88)
}

export async function scanPhoto(
  kind: 'vin' | 'plate',
  image: string,
  options: { state?: string | null; inspectionId?: string | null } = {},
): Promise<ScanResult> {
  const payload = image.startsWith('data:') ? await shrink(image) : image
  const response = await fetch('/api/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, image: payload, state: options.state ?? null, inspectionId: options.inspectionId ?? null }),
  })
  if (!response.ok) return { id: null, value: null, source: null }
  return response.json()
}

/** Records what the inspector kept, so reads can be measured against it. Never blocks. */
export function recordSavedScan(id: string | null, savedValue: string): void {
  if (!id) return
  fetch('/api/scan', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, savedValue }),
  }).catch(() => {})
}

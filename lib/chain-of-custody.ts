export interface GPSLocation {
  lat: number
  lng: number
  accuracy: number
  timestamp: string
}

export async function captureGPS(): Promise<GPSLocation | null> {
  if (!navigator.geolocation) return null
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: new Date().toISOString(),
      }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 30000 }
    )
  })
}

export function getDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() ?? '',
  ]
  return btoa(parts.join('|')).slice(0, 64)
}

export async function collectPhotoHashes(
  formData: Record<string, any>
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {}
  for (const [key, value] of Object.entries(formData)) {
    if (typeof value === 'string' && (value.startsWith('data:image') || value.startsWith('https'))) {
      const encoder = new TextEncoder()
      const data = encoder.encode(value.slice(0, 512))
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      hashes[key] = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
    }
  }
  return hashes
}

export async function buildCustodyRecord({
  inspectionId,
  gpsStart,
  gpsEnd,
  signatureUrl,
  formData,
}: {
  inspectionId: string
  gpsStart: GPSLocation | null
  gpsEnd: GPSLocation | null
  signatureUrl: string
  formData: Record<string, any>
}) {
  const photoHashes = await collectPhotoHashes(formData)
  const fingerprint = getDeviceFingerprint()

  const { upsertCustodyRecordSecure } = await import('./inspection-auth')
  await upsertCustodyRecordSecure(inspectionId, {
    gps_start: gpsStart,
    gps_end: gpsEnd,
    device_fingerprint: fingerprint,
    signature_url: signatureUrl,
    photo_hashes: photoHashes,
    signed_at: new Date().toISOString(),
  })
}

import { savePhotoOffline, getOfflinePhoto } from './offline-db'

async function compressImage(dataUrl: string, maxWidth = 1200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, maxWidth / img.width)
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Compression failed')), 'image/jpeg', quality)
    }
    img.onerror = reject
    img.src = dataUrl
  })
}

export async function storePhotoLocally(
  inspectionId: string,
  fieldName: string,
  dataUrl: string
): Promise<string> {
  const key = `${inspectionId}__${fieldName}`
  const blob = await compressImage(dataUrl)
  await savePhotoOffline(key, blob, fieldName)
  return key
}

export async function getLocalPhotoUrl(key: string): Promise<string | null> {
  const blob = await getOfflinePhoto(key)
  if (!blob) return null
  return URL.createObjectURL(blob)
}

export async function uploadPendingPhotos(
  inspectionId: string,
  supabase: any
): Promise<Record<string, string>> {
  const uploaded: Record<string, string> = {}
  // In practice, iterate stored photos for this inspectionId and upload
  // Returns map of fieldName -> public URL
  return uploaded
}

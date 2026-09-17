'use server'

import { createAdminClient } from './supabase/admin'
import { authorizeCompanyAccess } from './inspection-auth'
import type { VehicleCheckpointDirection } from './checkpoint-actions'
import { computeUsageState } from './usage-state'

// Adapted from uploadInspectionPhoto (lib/inspection-server-actions.ts) — same
// bucket + signed-URL pattern, but that function is coupled to inspection_id for
// both authorization and storage path, which intake/outtake checkpoints don't
// have. This uses the work-order's company/vehicle instead, in the same private
// inspection-photos bucket under a checkpoints/ prefix so it can never collide
// with real inspection paths (${companyId}/${inspectionId}/...).

const PHOTO_SIGNED_URL_TTL = 60 * 60 * 24 * 365 // 1 year, same as uploadInspectionPhoto

export async function uploadCheckpointPhoto(
  vehicleId: string,
  companyId: string,
  direction: VehicleCheckpointDirection,
  dataUrl: string,
  fieldKey: string,
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(fieldKey)) throw new Error('Invalid field key')

  const ok = await authorizeCompanyAccess(companyId)
  if (!ok) throw new Error('Not authorized to upload photos for this vehicle')

  // Every checkpoint (intake, outtake, backfill) uploads its photos through this
  // action before the record is created, and createCheckpoint itself runs in the
  // browser, so this is the server-side point where an ended demo is stopped.
  const blockReason = (await computeUsageState(createAdminClient(), companyId)).blockReason
  if (blockReason) throw new Error(blockReason)

  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) throw new Error('Invalid image data')
  const [, mimeType, base64Data] = match
  const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1]
  const buffer = Buffer.from(base64Data, 'base64')

  const path = `${companyId}/checkpoints/${vehicleId}/${direction}/${fieldKey}.${ext}`
  const supabase = createAdminClient()

  const { error: uploadError } = await supabase.storage
    .from('inspection-photos')
    .upload(path, buffer, { contentType: mimeType, upsert: true })
  if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`)

  const { data: signedData, error: signError } = await supabase.storage
    .from('inspection-photos')
    .createSignedUrl(path, PHOTO_SIGNED_URL_TTL)
  if (signError || !signedData) throw new Error(`Failed to generate photo URL: ${signError?.message ?? 'unknown error'}`)

  return signedData.signedUrl
}

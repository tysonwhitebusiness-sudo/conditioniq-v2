'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFeatureFlags } from '@/lib/feature-flags'

const BRANDING_BUCKET = 'branding'

export async function getCompanyLogo(companyId: string): Promise<{ logoUrl: string | null; whiteLabelEnabled: boolean; companyName: string }> {
  const supabase = createClient()

  const [{ data: company }, flags] = await Promise.all([
    supabase.from('companies').select('name, logo_url').eq('id', companyId).single(),
    getFeatureFlags(companyId),
  ])

  const whiteLabelEnabled = flags.white_label?.enabled ?? false

  if (!whiteLabelEnabled || !company?.logo_url) {
    return { logoUrl: null, whiteLabelEnabled, companyName: company?.name ?? '' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(BRANDING_BUCKET)
    .createSignedUrl(company.logo_url, 3600)

  if (error) {
    console.error('[branding] signedUrl', error)
    return { logoUrl: null, whiteLabelEnabled, companyName: company?.name ?? '' }
  }

  return { logoUrl: data.signedUrl, whiteLabelEnabled, companyName: company?.name ?? '' }
}

export async function createLogoUploadUrl(companyId: string, ext: string): Promise<{ path: string; token: string } | null> {
  const admin = createAdminClient()
  const path = `${companyId}/logo.${ext}`
  const { data, error } = await admin.storage
    .from(BRANDING_BUCKET)
    .createSignedUploadUrl(path)
  if (error) { console.error('[branding] uploadUrl', error); return null }
  return { path, token: data.token }
}

export async function saveLogoPath(companyId: string, path: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('companies').update({ logo_url: path }).eq('id', companyId)
}

export async function removeLogo(companyId: string): Promise<void> {
  const supabase = createClient()
  const { data: company } = await supabase
    .from('companies')
    .select('logo_url')
    .eq('id', companyId)
    .single()

  if (company?.logo_url) {
    const admin = createAdminClient()
    await admin.storage.from(BRANDING_BUCKET).remove([company.logo_url])
  }

  await supabase.from('companies').update({ logo_url: null }).eq('id', companyId)
}

export async function getLogoSignedUrl(path: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(BRANDING_BUCKET).createSignedUrl(path, 3600)
  if (error) return null
  return data.signedUrl
}

export async function saveBusinessName(companyId: string, name: string): Promise<void> {
  const supabase = createClient()
  await supabase.from('companies').update({ name }).eq('id', companyId)
}

'use server'

import { createClient } from '@/lib/supabase/server'

export type FeatureKey =
  | 'send_to_inspector'
  | 'locations'
  | 'team_members'
  | 'lot_map'
  | 'white_label'
  | 'dispatch'
  | 'lot_billing'
  | 'reporting_export'
  | 'multi_location'
  | 'fmc_account'
  | 'api_access'

export interface FeatureFlag {
  feature_key: FeatureKey
  enabled: boolean
  config: Record<string, unknown>
}

export type FeatureFlags = Record<FeatureKey, FeatureFlag>

// Tier sets for deriving plan-default flag values
const GROWTH_PLUS    = new Set(['growth', 'pro', 'enterprise'])
const PRO_PLUS       = new Set(['pro', 'enterprise'])
const ENTERPRISE_ONLY = new Set(['enterprise'])

function flag(key: FeatureKey, enabled: boolean): FeatureFlag {
  return { feature_key: key, enabled, config: {} }
}

export async function getFeatureFlags(companyId: string): Promise<FeatureFlags> {
  // Build tier-based defaults when no DB row exists for a flag
  const buildDefaults = (tier: string): FeatureFlags => ({
    send_to_inspector: flag('send_to_inspector', true),
    locations:         flag('locations',         true),
    team_members:      flag('team_members',      true),
    dispatch:          flag('dispatch',          GROWTH_PLUS.has(tier)),
    lot_billing:       flag('lot_billing',       GROWTH_PLUS.has(tier)),
    lot_map:           flag('lot_map',           PRO_PLUS.has(tier)),
    white_label:       flag('white_label',       PRO_PLUS.has(tier)),
    reporting_export:  flag('reporting_export',  PRO_PLUS.has(tier)),
    multi_location:    flag('multi_location',    ENTERPRISE_ONLY.has(tier)),
    fmc_account:       flag('fmc_account',       ENTERPRISE_ONLY.has(tier)),
    api_access:        flag('api_access',        ENTERPRISE_ONLY.has(tier)),
  })

  if (!companyId) return buildDefaults('')

  const supabase = createClient()
  const [{ data: flagData }, { data: company }] = await Promise.all([
    supabase.from('company_feature_flags').select('feature_key, enabled, config').eq('company_id', companyId),
    supabase.from('companies').select('subscription_tier').eq('id', companyId).single(),
  ])

  const tier = (company?.subscription_tier ?? '') as string
  const flags = buildDefaults(tier)

  // Per-company DB rows override tier defaults
  for (const row of (flagData ?? [])) {
    const key = row.feature_key as FeatureKey
    if (key in flags) {
      flags[key] = { feature_key: key, enabled: row.enabled, config: (row.config as Record<string, unknown>) ?? {} }
    }
  }

  return flags
}

export async function upsertFeatureFlag(
  companyId: string,
  featureKey: FeatureKey,
  enabled: boolean,
  config: Record<string, unknown> = {}
): Promise<void> {
  const supabase = createClient()
  const { data: isOwner } = await supabase.rpc('is_platform_owner')
  if (!isOwner) throw new Error('Not authorized to modify feature flags')

  const { error } = await supabase
    .from('company_feature_flags')
    .upsert(
      { company_id: companyId, feature_key: featureKey, enabled, config, updated_at: new Date().toISOString() },
      { onConflict: 'company_id,feature_key' }
    )
  if (error) throw error
}

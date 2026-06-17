'use server'

import { createClient } from '@/lib/supabase/server'

export type FeatureKey = 'send_to_inspector' | 'locations' | 'team_members' | 'lot_map' | 'white_label' | 'dispatch' | 'lot_billing'

export interface FeatureFlag {
  feature_key: FeatureKey
  enabled: boolean
  config: Record<string, unknown>
}

export type FeatureFlags = Record<FeatureKey, FeatureFlag>

const DEFAULTS: FeatureFlags = {
  send_to_inspector: { feature_key: 'send_to_inspector', enabled: true,  config: {} },
  locations:         { feature_key: 'locations',         enabled: true,  config: {} },
  team_members:      { feature_key: 'team_members',      enabled: true,  config: {} },
  lot_map:           { feature_key: 'lot_map',           enabled: false, config: {} },
  white_label:       { feature_key: 'white_label',       enabled: true,  config: {} },
  dispatch:          { feature_key: 'dispatch',          enabled: true,  config: {} },
  lot_billing:       { feature_key: 'lot_billing',       enabled: false, config: {} },
}

// Starter-tier plans get dispatch disabled by default; Growth+ get it enabled.
const STARTER_PLANS = new Set(['starter', 'legacy_starter'])

export async function getFeatureFlags(companyId: string): Promise<FeatureFlags> {
  if (!companyId) return { ...DEFAULTS }
  const supabase = createClient()
  const [{ data: flagData }, { data: company }] = await Promise.all([
    supabase.from('company_feature_flags').select('feature_key, enabled, config').eq('company_id', companyId),
    supabase.from('companies').select('subscription_tier').eq('id', companyId).single(),
  ])
  const tier = (company?.subscription_tier ?? '') as string
  const flags: FeatureFlags = {
    send_to_inspector: { ...DEFAULTS.send_to_inspector },
    locations:         { ...DEFAULTS.locations },
    team_members:      { ...DEFAULTS.team_members },
    lot_map:           { ...DEFAULTS.lot_map },
    white_label:       { ...DEFAULTS.white_label },
    dispatch:          { feature_key: 'dispatch', enabled: !STARTER_PLANS.has(tier), config: {} },
    lot_billing:       { ...DEFAULTS.lot_billing },
  }
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
  const { error } = await supabase
    .from('company_feature_flags')
    .upsert(
      { company_id: companyId, feature_key: featureKey, enabled, config, updated_at: new Date().toISOString() },
      { onConflict: 'company_id,feature_key' }
    )
  if (error) throw error
}

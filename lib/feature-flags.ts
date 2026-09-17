'use server'

import { createClient } from '@/lib/supabase/server'
import { normalizePlanKey, PLANS, type PlanKey } from '@/lib/pricing'

export type FeatureKey =
  | 'locations'
  | 'team_members'
  | 'lot_map'
  | 'white_label'
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

function flag(key: FeatureKey, enabled: boolean): FeatureFlag {
  return { feature_key: key, enabled, config: {} }
}

// Plan defaults. Gating is by scale, not capability: every plan gets the full
// lot platform, including a demo. White label follows the plan (off for demo),
// and multi-location, FMC and API access remain Enterprise-only.
//
// The tier is normalized first, so retired names (starter, legacy_starter,
// growth) resolve to Operations instead of falling through every set and
// silently losing all features, as they did before.
function buildDefaults(plan: PlanKey | null): FeatureFlags {
  const hasPlatform = plan !== null
  const enterprise = plan === 'enterprise'
  return {
    locations:        flag('locations',        true),
    team_members:     flag('team_members',     true),
    lot_billing:      flag('lot_billing',      hasPlatform),
    lot_map:          flag('lot_map',          hasPlatform),
    reporting_export: flag('reporting_export', hasPlatform),
    white_label:      flag('white_label',      plan !== null && PLANS[plan].whiteLabel),
    multi_location:   flag('multi_location',   enterprise),
    fmc_account:      flag('fmc_account',      enterprise),
    api_access:       flag('api_access',       enterprise),
  }
}

export async function getFeatureFlags(companyId: string): Promise<FeatureFlags> {
  // No company (signed out, or a profile not attached to one): nothing to gate on.
  if (!companyId) return buildDefaults(null)

  const supabase = createClient()
  const [{ data: flagData }, { data: company }] = await Promise.all([
    supabase.from('company_feature_flags').select('feature_key, enabled, config').eq('company_id', companyId),
    supabase.from('companies').select('subscription_tier').eq('id', companyId).single(),
  ])

  // A company row that cannot be read gets no platform defaults, matching the
  // no-company case, rather than being assumed to be on a paid plan.
  const flags = buildDefaults(company ? normalizePlanKey(company.subscription_tier) : null)

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

export type PlanKey = 'legacy_starter' | 'starter' | 'growth' | 'pro' | 'enterprise' | 'demo'

export interface Plan {
  key: PlanKey
  name: string
  monthlyCost: number
  annualCost: number       // total billed annually
  reportsIncluded: number
  additionalReportCost: number
  maxUsers: number | null  // null = unlimited
}

// ── Plans ─────────────────────────────────────────────────────────────────────
// legacy_starter: unchanged — applies only when company.legacy_pricing = true
// All other keys: new pricing — applies when company.legacy_pricing = false

export const PLANS: Record<PlanKey, Plan> = {
  legacy_starter: { key: 'legacy_starter', name: 'Starter (Grandfathered)', monthlyCost: 59,  annualCost: 708,  reportsIncluded: 15,   additionalReportCost: 4.00, maxUsers: 3    },
  starter:        { key: 'starter',        name: 'Starter',                  monthlyCost: 99,  annualCost: 990,  reportsIncluded: 30,   additionalReportCost: 3.50, maxUsers: 3    },
  growth:         { key: 'growth',         name: 'Growth',                   monthlyCost: 199, annualCost: 1990, reportsIncluded: 75,   additionalReportCost: 3.00, maxUsers: 5    },
  pro:            { key: 'pro',            name: 'Pro',                      monthlyCost: 399, annualCost: 3990, reportsIncluded: 200,  additionalReportCost: 2.50, maxUsers: null },
  enterprise:     { key: 'enterprise',     name: 'Enterprise',               monthlyCost: 0,   annualCost: 0,    reportsIncluded: 9999, additionalReportCost: 2.50, maxUsers: null },
  demo:           { key: 'demo',           name: 'Demo',                     monthlyCost: 0,   annualCost: 0,    reportsIncluded: 3,    additionalReportCost: 0,    maxUsers: 3    },
}

// ── Add-ons (starter and growth on new pricing only) ──────────────────────────

export interface AddOn {
  key: 'lot_map' | 'white_label'
  name: string
  monthlyCost: number
  annualCost: number
  description: string
}

export const ADD_ONS: AddOn[] = [
  { key: 'lot_map',     name: 'Lot Map',     monthlyCost: 59, annualCost: 590, description: 'Lot map for single location'      },
  { key: 'white_label', name: 'White Label', monthlyCost: 29, annualCost: 290, description: 'White label PDF + custom branding' },
]

// Plans whose companies can purchase add-ons (non-legacy starter/growth only)
export const ADD_ON_ELIGIBLE_PLANS = new Set<PlanKey>(['starter', 'growth'])

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getPlan(tier: string | null | undefined): Plan {
  return PLANS[(tier as PlanKey) ?? 'starter'] ?? PLANS.starter
}

export function getDefaultMemberCap(tier: string | null | undefined): number | null {
  return PLANS[(tier as PlanKey) ?? 'starter']?.maxUsers ?? null
}

export function calcOverageCost(plan: Plan, reportsUsed: number): number {
  const overage = Math.max(0, reportsUsed - plan.reportsIncluded)
  return overage * plan.additionalReportCost
}

export function calcEstimatedMonthly(plan: Plan, reportsUsed: number): number {
  return plan.monthlyCost + calcOverageCost(plan, reportsUsed)
}

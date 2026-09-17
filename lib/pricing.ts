// The single source of truth for plan pricing and limits. Every surface that
// shows a price, an allowance or a plan name — the landing page, billing
// settings, the billing dashboard, the admin screens — reads from here.
//
// Gating is by scale, not capability: every paid plan gets the whole platform.
// Plans differ by vehicles, reports and seats.
//
// Conventions:
//   null limit   = unlimited
//   null price   = custom (Enterprise)

export type PlanKey = 'demo' | 'operations' | 'pro' | 'enterprise'

export interface Plan {
  key: PlanKey
  name: string
  monthlyCost: number | null
  annualCost: number | null
  reportsIncluded: number | null
  additionalReportCost: number
  vehiclesIncluded: number | null
  additionalVehicleCost: number
  maxUsers: number | null
  whiteLabel: boolean
  // Demo only: how long the account runs before new inspections are blocked.
  trialDays?: number
}

export const PLANS: Record<PlanKey, Plan> = {
  demo: {
    key: 'demo', name: 'Demo',
    monthlyCost: 0, annualCost: 0,
    reportsIncluded: 5, additionalReportCost: 0,
    vehiclesIncluded: null, additionalVehicleCost: 0,
    maxUsers: 1, whiteLabel: false, trialDays: 14,
  },
  operations: {
    key: 'operations', name: 'Operations',
    monthlyCost: 199, annualCost: 1990,
    reportsIncluded: 150, additionalReportCost: 2.5,
    vehiclesIncluded: 50, additionalVehicleCost: 4,
    maxUsers: 5, whiteLabel: true,
  },
  pro: {
    key: 'pro', name: 'Pro',
    monthlyCost: 399, annualCost: 3990,
    reportsIncluded: 500, additionalReportCost: 1.5,
    vehiclesIncluded: 200, additionalVehicleCost: 2,
    maxUsers: null, whiteLabel: true,
  },
  enterprise: {
    key: 'enterprise', name: 'Enterprise',
    monthlyCost: null, annualCost: null,
    reportsIncluded: null, additionalReportCost: 0,
    vehiclesIncluded: null, additionalVehicleCost: 0,
    maxUsers: null, whiteLabel: true,
  },
}

// Display order for pricing tables.
export const PUBLIC_PLAN_ORDER: PlanKey[] = ['demo', 'operations', 'pro', 'enterprise']

// Plan names retired by the restructure. Starter was eliminated and Growth was
// renamed Operations. The two Starter accounts moved to the Operations feature
// set with their price held in price_override_monthly / price_override_annual
// ($99 / $990 and $59 / $708). Mapping the old names here keeps the app correct
// whether or not the data migration has been applied yet.
const LEGACY_PLAN_ALIASES: Record<string, PlanKey> = {
  starter: 'operations',
  legacy_starter: 'operations',
  growth: 'operations',
  basic: 'operations',
}

// Resolves any stored subscription_tier to a current plan. An unrecognized value
// is logged and treated as Operations. Before the restructure an unknown tier
// fell through every feature set and silently lost the whole platform.
export function normalizePlanKey(tier: string | null | undefined): PlanKey {
  if (tier && tier in PLANS) return tier as PlanKey
  if (tier && tier in LEGACY_PLAN_ALIASES) return LEGACY_PLAN_ALIASES[tier]
  if (tier) console.error(`[pricing] unrecognized subscription_tier "${tier}", treating as operations`)
  return 'operations'
}

export function getPlan(tier: string | null | undefined): Plan {
  return PLANS[normalizePlanKey(tier)]
}

export function getDefaultMemberCap(tier: string | null | undefined): number | null {
  return getPlan(tier).maxUsers
}

export function isCustomPriced(plan: Plan): boolean {
  return plan.monthlyCost === null
}

// ── Account-level resolution ──────────────────────────────────────────────────

export interface CompanyPlanFields {
  subscription_tier?: string | null
  reports_included?: number | null
  price_override_monthly?: number | null
  price_override_annual?: number | null
  billing_interval?: string | null
}

// A per-company report allowance overrides the plan default. Before the
// restructure, the override was honored on screen but ignored where overage was
// recorded; every allowance check now goes through this one function.
export function effectiveReportsIncluded(company: CompanyPlanFields): number | null {
  if (company.reports_included != null) return company.reports_included
  return getPlan(company.subscription_tier).reportsIncluded
}

// Grandfathered accounts keep their old price on the new feature set.
export function effectiveMonthlyPrice(company: CompanyPlanFields): number | null {
  if (company.price_override_monthly != null) return company.price_override_monthly
  return getPlan(company.subscription_tier).monthlyCost
}

export function effectiveAnnualPrice(company: CompanyPlanFields): number | null {
  if (company.price_override_annual != null) return company.price_override_annual
  return getPlan(company.subscription_tier).annualCost
}

export function hasPriceOverride(company: CompanyPlanFields): boolean {
  return company.price_override_monthly != null || company.price_override_annual != null
}

// ── Overage ───────────────────────────────────────────────────────────────────
// Overage is uncapped by decision: an account can bill above the next plan's
// price. Grandfathered accounts pay overage at their plan's rates.

export interface OverageLine {
  included: number | null
  used: number
  over: number
  rate: number
  cost: number
}

export interface OverageBreakdown {
  reports: OverageLine
  vehicles: OverageLine
  total: number
}

function overageLine(included: number | null, used: number, rate: number): OverageLine {
  const over = included === null ? 0 : Math.max(0, used - included)
  return { included, used, over, rate, cost: over * rate }
}

export function calcOverage(
  company: CompanyPlanFields,
  usage: { reportsUsed: number; peakVehicles: number },
): OverageBreakdown {
  const plan = getPlan(company.subscription_tier)
  const reports = overageLine(effectiveReportsIncluded(company), usage.reportsUsed, plan.additionalReportCost)
  const vehicles = overageLine(plan.vehiclesIncluded, usage.peakVehicles, plan.additionalVehicleCost)
  return { reports, vehicles, total: reports.cost + vehicles.cost }
}

// Estimated charge for the current cycle at the monthly rate. Null when the
// account is custom-priced.
export function calcEstimatedMonthly(
  company: CompanyPlanFields,
  usage: { reportsUsed: number; peakVehicles: number },
): number | null {
  const base = effectiveMonthlyPrice(company)
  if (base === null) return null
  return base + calcOverage(company, usage).total
}

// ── Customer-facing copy ──────────────────────────────────────────────────────
// Brief section 10: concrete figures, no filler, and never "not available" on a
// subscription plan. Every pricing surface renders these lines rather than its
// own, so a price change updates everywhere at once.

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`)

export const PLATFORM_FEATURES = 'Lot map, lot billing, dispatch and customer CRM'

export function planHighlights(plan: Plan): string[] {
  switch (plan.key) {
    case 'demo':
      return [
        `${plan.trialDays}-day trial, no card required`,
        `${plan.reportsIncluded} reports`,
        '1 seat',
        PLATFORM_FEATURES,
        'Condition IQ branded PDFs',
      ]
    case 'enterprise':
      return [
        'Custom vehicle and report volume',
        'Unlimited seats',
        'Multi-location and API access',
        PLATFORM_FEATURES,
        'White label PDFs',
      ]
    default:
      return [
        `${plan.vehiclesIncluded} vehicles on lot, then ${money(plan.additionalVehicleCost)}/vehicle`,
        `${plan.reportsIncluded} reports/mo, then ${money(plan.additionalReportCost)}/report`,
        plan.maxUsers === null ? 'Unlimited seats' : `${plan.maxUsers} seats`,
        PLATFORM_FEATURES,
        'White label PDFs',
      ]
  }
}

export function formatPlanPrice(plan: Plan, interval: 'monthly' | 'annual' = 'monthly'): string {
  if (plan.key === 'demo') return 'Free'
  const price = interval === 'annual' ? plan.annualCost : plan.monthlyCost
  if (price === null) return 'Custom'
  return `${money(price)}/${interval === 'annual' ? 'yr' : 'mo'}`
}

// Brief section 4.3: publish the point where the larger plan becomes cheaper.
// Derived from the plan figures so the published numbers cannot drift from the
// prices. Each ignores the other meter (vehicles-only / reports-only usage).
export function planCrossovers(): { vehicles: number; reports: number } {
  const ops = PLANS.operations
  const pro = PLANS.pro
  const gap = (pro.monthlyCost ?? 0) - (ops.monthlyCost ?? 0)
  return {
    vehicles: (ops.vehiclesIncluded ?? 0) + gap / ops.additionalVehicleCost,
    reports: (ops.reportsIncluded ?? 0) + gap / ops.additionalReportCost,
  }
}

// 80% of an allowance triggers the in-app warning.
export const NEAR_LIMIT_RATIO = 0.8

export function usageRatio(used: number, included: number | null): number | null {
  if (included === null || included <= 0) return null
  return used / included
}

export type PlanKey = 'legacy_starter' | 'starter' | 'growth' | 'pro' | 'enterprise' | 'demo'

export interface Plan {
  key: PlanKey
  name: string
  monthlyCost: number
  reportsIncluded: number
  additionalReportCost: number
}

export const PLANS: Record<PlanKey, Plan> = {
  legacy_starter: { key: 'legacy_starter', name: 'Starter (Grandfathered)', monthlyCost: 59, reportsIncluded: 15, additionalReportCost: 4.0 },
  starter:        { key: 'starter',        name: 'Starter',    monthlyCost: 99,  reportsIncluded: 30,   additionalReportCost: 4.0 },
  growth:         { key: 'growth',         name: 'Growth',     monthlyCost: 199, reportsIncluded: 75,   additionalReportCost: 3.25 },
  pro:            { key: 'pro',            name: 'Pro',        monthlyCost: 399, reportsIncluded: 200,  additionalReportCost: 2.75 },
  enterprise:     { key: 'enterprise',     name: 'Enterprise', monthlyCost: 0,   reportsIncluded: 9999, additionalReportCost: 2.25 },
  demo:           { key: 'demo',           name: 'Demo',       monthlyCost: 0,   reportsIncluded: 3,    additionalReportCost: 0 },
}

export function getPlan(tier: string | null | undefined): Plan {
  return PLANS[(tier as PlanKey) ?? 'starter'] ?? PLANS.starter
}

export function calcOverageCost(plan: Plan, reportsUsed: number): number {
  const overage = Math.max(0, reportsUsed - plan.reportsIncluded)
  return overage * plan.additionalReportCost
}

export function calcEstimatedMonthly(plan: Plan, reportsUsed: number): number {
  return plan.monthlyCost + calcOverageCost(plan, reportsUsed)
}

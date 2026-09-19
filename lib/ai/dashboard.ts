// H · The numbers on the admin AI dashboard, worked out from the records each
// feature already keeps. Pure functions, so they can be tested without a
// database: spend from ai_calls, accuracy from what inspectors did with each
// suggestion, read, and check.

export interface CallRow {
  created_at: string
  inspection_id: string | null
  feature: string
  status: string
  cost_usd: number | string | null
  duration_ms: number | null
}

export interface FeatureSpend {
  feature: string
  calls: number
  ok: number
  skipped: number
  errors: number
  costUsd: number
  avgMs: number | null
}

export interface SpendSummary {
  totalUsd: number
  calls: number
  byFeature: FeatureSpend[]
  skipped: { killSwitch: number; accountOff: number; ceiling: number; notConfigured: number }
  /** Calls still reserved: a crash between reserving and settling. Should be zero. */
  unsettled: number
  perInspection: { inspections: number; avgUsd: number; p90Usd: number; maxUsd: number; nearCeiling: number; overCeiling: number }
  daily: Array<{ day: string; usd: number }>
}

const num = (v: unknown) => (v == null ? 0 : Number(v) || 0)

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
}

export function spendSummary(calls: CallRow[], ceilingUsd: number, days: number, now = new Date()): SpendSummary {
  const features = new Map<string, FeatureSpend & { ms: number; timed: number }>()
  const perInspection = new Map<string, number>()
  const daily = new Map<string, number>()
  const skipped = { killSwitch: 0, accountOff: 0, ceiling: 0, notConfigured: 0 }
  let totalUsd = 0, unsettled = 0

  for (const c of calls) {
    const cost = num(c.cost_usd)
    totalUsd += cost
    const f = features.get(c.feature) ?? { feature: c.feature, calls: 0, ok: 0, skipped: 0, errors: 0, costUsd: 0, avgMs: null, ms: 0, timed: 0 }
    f.calls++
    f.costUsd += cost
    if (c.status === 'ok') { f.ok++; if (c.duration_ms != null) { f.ms += c.duration_ms; f.timed++ } }
    else if (c.status === 'error') f.errors++
    else if (c.status === 'pending') unsettled++
    else if (c.status.startsWith('skipped_')) {
      f.skipped++
      if (c.status === 'skipped_kill_switch') skipped.killSwitch++
      else if (c.status === 'skipped_account_off') skipped.accountOff++
      else if (c.status === 'skipped_ceiling') skipped.ceiling++
      else if (c.status === 'skipped_not_configured') skipped.notConfigured++
    }
    features.set(c.feature, f)
    if (c.inspection_id) perInspection.set(c.inspection_id, (perInspection.get(c.inspection_id) ?? 0) + cost)
    const day = c.created_at.slice(0, 10)
    daily.set(day, (daily.get(day) ?? 0) + cost)
  }

  const spent = Array.from(perInspection.values()).filter(v => v > 0).sort((a, b) => a - b)
  const days_: Array<{ day: string; usd: number }> = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 864e5).toISOString().slice(0, 10)
    days_.push({ day: d, usd: daily.get(d) ?? 0 })
  }

  return {
    totalUsd,
    calls: calls.length,
    byFeature: Array.from(features.values())
      .map(({ ms, timed, ...f }) => ({ ...f, avgMs: timed ? Math.round(ms / timed) : null }))
      .sort((a, b) => b.costUsd - a.costUsd),
    skipped,
    unsettled,
    perInspection: {
      inspections: spent.length,
      avgUsd: spent.length ? spent.reduce((s, v) => s + v, 0) / spent.length : 0,
      p90Usd: percentile(spent, 0.9),
      maxUsd: spent.length ? spent[spent.length - 1] : 0,
      nearCeiling: spent.filter(v => v >= ceilingUsd * 0.8 && v <= ceilingUsd + 1e-9).length,
      overCeiling: spent.filter(v => v > ceilingUsd + 1e-9).length,
    },
    daily: days_,
  }
}

// ── Accuracy: what inspectors did with each suggestion ─────────────────────

export interface SuggestionRow { kind: string | null; damage_group: string; status: string }

export interface Acceptance {
  key: string
  /** Added as suggested. */
  accepted: number
  /** Added with a different area or type. */
  edited: number
  /** "Not damage" (or "Not new" on a check-out). */
  rejected: number
  /** Not decided yet. Retaken photos (superseded) are left out. */
  pending: number
  /** (accepted + edited) / decided; null until something is decided. */
  rate: number | null
}

function tally(key: string, rows: SuggestionRow[]): Acceptance {
  const count = (s: string) => rows.filter(r => r.status === s).length
  const accepted = count('accepted'), edited = count('edited'), rejected = count('rejected'), pending = count('pending')
  const decided = accepted + edited + rejected
  return { key, accepted, edited, rejected, pending, rate: decided ? (accepted + edited) / decided : null }
}

export function acceptance(rows: SuggestionRow[]): { byKind: Acceptance[]; byGroup: Acceptance[] } {
  const kinds = ['photo', 'new_since_checkin']
  const groups = Array.from(new Set(rows.map(r => r.damage_group))).sort()
  return {
    byKind: kinds.map(k => tally(k, rows.filter(r => (r.kind ?? 'photo') === k))),
    byGroup: groups.map(g => tally(g, rows.filter(r => r.damage_group === g))),
  }
}

// ── Other features ─────────────────────────────────────────────────────────

export interface PhotoCheckRow { problems: string[] | null; right_subject: boolean | null; framed: boolean | null; odometer_status: string | null }

export function photoCheckSummary(rows: PhotoCheckRow[]) {
  return {
    photos: rows.length,
    phoneFlagged: rows.filter(r => (r.problems ?? []).length > 0).length,
    aiChecked: rows.filter(r => r.right_subject !== null).length,
    wrongSubject: rows.filter(r => r.right_subject === false).length,
    notFramed: rows.filter(r => r.framed === false).length,
    odometer: {
      verified: rows.filter(r => r.odometer_status === 'verified').length,
      mismatch: rows.filter(r => r.odometer_status === 'mismatch').length,
      unreadable: rows.filter(r => r.odometer_status === 'unreadable').length,
    },
  }
}

export interface ScanRow { kind: string; source: string | null; read_value: string | null; saved_value: string | null }

/** Of the reads an inspector saved, how many were kept exactly as read. */
export function scanSummary(rows: ScanRow[]) {
  return ['vin', 'plate'].map(kind => {
    const mine = rows.filter(r => r.kind === kind)
    const saved = mine.filter(r => r.read_value && r.saved_value)
    return {
      kind,
      reads: mine.length,
      bySource: { barcode: mine.filter(r => r.source === 'barcode').length, reader: mine.filter(r => r.source === 'reader').length, ai: mine.filter(r => r.source === 'ai').length, none: mine.filter(r => !r.source).length },
      saved: saved.length,
      keptAsRead: saved.filter(r => r.read_value!.toUpperCase() === r.saved_value!.toUpperCase()).length,
    }
  })
}

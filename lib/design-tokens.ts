// Canonical design tokens — the single source of truth for the app's white/
// hairline-card visual system. Values are pulled directly from the approved
// mockups (supabase/migrations/ciq-dashboard-redesign-v2.html Option A,
// ciq-vehicle-detail-redesign.html). Every color/spacing value used outside
// components/admin/** (a deliberately separate dark theme) and
// components/landing/** (its own earlier, separately-approved design pass)
// should come from here rather than being hardcoded per-component — see the
// design-consistency audit that produced this file for why that mandate
// exists (three earlier ad-hoc token systems went unused/half-adopted).

export const PRIMARY = '#00B4D8'
export const PRIMARY_TINT = 'rgba(0,180,216,0.07)'
// Solid light-cyan wash for hover/drag-active feedback (more visible than
// PRIMARY_TINT's subtle rgba) — matches tailwind.config.ts's cyan.light.
export const PRIMARY_LIGHT = '#E0F7FC'
// Darker cyan for text on a PRIMARY_TINT background — plain PRIMARY is too
// low-contrast as small pill text. Exact value from the mockup's .pill-primary.
export const PRIMARY_PILL_TEXT = '#0891B2'
export const AMBER = '#F4A62A'
export const AMBER_TINT = 'rgba(244,166,42,0.10)'
// Darker amber for text on an AMBER_TINT background (mockup's .pill-amber) —
// distinct from AMBER_DARK below, which is for text on a WHITE background.
export const AMBER_PILL_TEXT = '#92620F'
// Darker amber for text-on-white (plain AMBER is too low-contrast as text) —
// matches tailwind.config.ts's existing (unused) amber.dark value.
export const AMBER_DARK = '#D4881A'

export const GRAY_900 = '#0F172A'
export const GRAY_700 = '#475569'
export const GRAY_500 = '#64748B'
export const GRAY_300 = '#E2E8F0'
export const GRAY_100 = '#F8FAFC'

export const WHITE = '#FFFFFF'
// Matches tailwind.config.ts's existing (unused) danger.DEFAULT value.
export const DANGER = '#EF4444'
// Error-banner trio (text/background/border) — a distinct, more saturated red
// family than DANGER, used for inline validation/error messages.
export const DANGER_TEXT = '#DC2626'
export const DANGER_LIGHT = '#FEE2E2'
export const DANGER_BORDER = '#FECACA'
// Matches tailwind.config.ts's existing (unused) success.DEFAULT value.
export const SUCCESS = '#10B981'
// Matches tailwind.config.ts's existing (unused) success.light value.
export const SUCCESS_LIGHT = '#D1FAE5'
// Darker green for text on a SUCCESS_LIGHT background.
export const SUCCESS_DARK = '#065F46'
// Matches tailwind.config.ts's existing (unused) warn.DEFAULT value.
export const WARN = '#F59E0B'
// Matches tailwind.config.ts's existing (unused) warn.light value.
export const WARN_LIGHT = '#FEF3C7'
// Darker amber for text on a WARN_LIGHT background.
export const WARN_DARK = '#92400E'
// Informational blue — a distinct, permanent semantic (not a status-taxonomy
// color pending consolidation), used e.g. for the checkpoint-type badge.
export const INFO = '#0EA5E9'
export const INFO_LIGHT = '#DBEAFE'
export const INFO_DARK = '#1E40AF'
// Indigo — a fixed small-set content category color (e.g. feedback-widget
// "Feature Request"), distinct from PURPLE.
export const INDIGO = '#6366F1'
export const INDIGO_LIGHT = '#EEF2FF'
export const INDIGO_DARK = '#3730A3'
// Purple — report-type tag ("check-out"), a fixed small palette, not part of
// the work-order-status taxonomy.
export const PURPLE_LIGHT = '#EDE9FE'
export const PURPLE_DARK = '#7C3AED'

// Vehicle condition-score band (0-100, 5 tiers) — a distinct scale from
// work-order status. The 90+/70-79/<60 tiers reuse SUCCESS_DARK/WARN_DARK/
// DANGER_LIGHT and INFO_LIGHT exactly; only the 80-89 and 60-69 tiers need
// their own text/bg pair.
export const SCORE_GOOD_TEXT = '#0369A1'
export const SCORE_POOR_TEXT = '#9A3412'
export const SCORE_POOR_BG = '#FED7AA'
export const SCORE_CRITICAL_TEXT = '#991B1B'

// Billed/Unbilled badge — its own muted green/amber pair, distinct from
// SUCCESS/AMBER.
export const BILLED_TEXT = '#2E9E6D'
export const BILLED_TINT = 'rgba(46,158,109,0.15)'
export const UNBILLED_TEXT = '#B67516'
export const UNBILLED_TINT = 'rgba(244,166,42,0.15)'

// Mockups' Option A hairline card: white surface, 1px border, no shadow.
export const hairlineCard = {
  background: WHITE,
  border: `1px solid ${GRAY_300}`,
  borderRadius: 12,
} as const

// Tint-background status pill (e.g. amber/cyan work-order status badges).
// `textColor` is the darker on-tint shade (PRIMARY_PILL_TEXT/AMBER_PILL_TEXT),
// not the raw brand color — see lib/work-order-status.ts's getStatusPillStyle()
// for the canonical vehicle-status usage of this helper.
export function pillStyle(textColor: string, tint: string) {
  return { background: tint, color: textColor, fontWeight: 700 } as const
}

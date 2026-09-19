'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Check, X, RotateCcw } from 'lucide-react'
import AiKillSwitch from './ai-kill-switch'
import {
  getAiDashboard, listReviewQueue, reviewSuggestion, setAiCeiling,
  type ReviewFilter, type ReviewItem,
} from '@/lib/ai/dashboard-actions'
import { suggestionTitle, SLOT_LABEL, type ExteriorSlot } from '@/lib/ai/damage-suggest-labels'
import {
  PRIMARY, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100,
  DANGER_TEXT, DANGER_LIGHT, SUCCESS_DARK, SUCCESS_LIGHT, WARN_LIGHT, WARN_DARK,
} from '@/lib/design-tokens'

// H · Admin AI dashboard: what AI costs against the per-inspection ceiling,
// how often inspectors agree with it, and the review queue that decides which
// collected records join the test sets.

type Dashboard = Awaited<ReturnType<typeof getAiDashboard>>

const money = (n: number, digits = 2) => `$${n.toFixed(digits)}`
const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`)
const FEATURE: Record<string, string> = {
  damage: 'Damage suggestions', compare: 'Check-in comparison', photo_check: 'Photo checks', gauges: 'Gauges',
  scan: 'VIN and plate scans', summary: 'Report summary',
}
const KIND: Record<string, string> = { photo: 'Damage in a photo', new_since_checkin: 'New since check-in' }

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 16, boxShadow: '0 1px 3px rgba(15,23,42,0.06)', padding: 20, minWidth: 0, ...style }}>{children}</div>
}
function SH({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>{children}</p>
      {right}
    </div>
  )
}
function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'warn' | 'bad' | 'good' }) {
  const color = tone === 'bad' ? DANGER_TEXT : tone === 'warn' ? WARN_DARK : tone === 'good' ? SUCCESS_DARK : GRAY_900
  return (
    <Card style={{ padding: 16 }}>
      <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 800, color, margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub ? <p style={{ fontSize: 12, color: GRAY_500, margin: '2px 0 0' }}>{sub}</p> : null}
    </Card>
  )
}

const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 10px 8px 0', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: 13, color: GRAY_700, padding: '9px 10px 9px 0', borderTop: `1px solid ${GRAY_100}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="adm-scroll-x">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ ...th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ ...td, textAlign: j ? 'right' : 'left', color: j ? GRAY_700 : GRAY_900, fontWeight: j ? 400 : 600 }}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

function DailyBars({ daily }: { daily: Array<{ day: string; usd: number }> }) {
  const max = Math.max(0.0001, ...daily.map(d => d.usd))
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 110 }}>
        {daily.map(d => (
          <div key={d.day} title={`${d.day}: ${money(d.usd, 3)}`} style={{ flex: 1, minWidth: 3, height: `${Math.max(d.usd > 0 ? 4 : 1, (d.usd / max) * 100)}%`, background: d.usd > 0 ? PRIMARY : GRAY_300, borderRadius: 3, transition: 'height 300ms ease' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: GRAY_500, marginTop: 6 }}>
        <span>{daily[0]?.day.slice(5)}</span><span>{daily[daily.length - 1]?.day.slice(5)}</span>
      </div>
    </div>
  )
}

function CeilingEditor({ ceiling, reserve, onSaved }: { ceiling: number; reserve: number; onSaved: () => void }) {
  const [c, setC] = useState(ceiling.toFixed(2))
  const [r, setR] = useState(reserve.toFixed(2))
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | string>('idle')
  const changed = Number(c) !== ceiling || Number(r) !== reserve
  const save = async () => {
    setState('saving')
    const result = await setAiCeiling(Number(c), Number(r))
    if (result.ok) { setState('saved'); onSaved() } else setState(result.error ?? 'Could not save')
  }
  const input: React.CSSProperties = { width: 90, height: 36, border: `1px solid ${GRAY_300}`, borderRadius: 8, padding: '0 10px', fontSize: 14, fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }
  return (
    <Card>
      <SH>Spend ceiling per inspection</SH>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: GRAY_500 }}>Ceiling ($)<br /><input style={input} inputMode="decimal" value={c} onChange={e => { setC(e.target.value); setState('idle') }} /></label>
        <label style={{ fontSize: 12, color: GRAY_500 }}>Kept for the summary ($)<br /><input style={input} inputMode="decimal" value={r} onChange={e => { setR(e.target.value); setState('idle') }} /></label>
        <button type="button" onClick={save} disabled={!changed || state === 'saving'}
          style={{ height: 36, padding: '0 16px', borderRadius: 10, border: 'none', background: changed ? PRIMARY : GRAY_300, color: WHITE, fontSize: 13, fontWeight: 700, cursor: changed ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p style={{ fontSize: 12, color: state === 'saved' ? SUCCESS_DARK : state !== 'idle' && state !== 'saving' ? DANGER_TEXT : GRAY_500, margin: '10px 0 0' }}>
        {state === 'saved' ? 'Saved. New calls use it straight away.'
          : state !== 'idle' && state !== 'saving' ? state
          : 'When an inspection reaches the ceiling, further AI checks are skipped; the inspection carries on as normal.'}
      </p>
    </Card>
  )
}

type Review = typeof reviewSuggestion
type Queue = typeof listReviewQueue

function ReviewCard({ item, filter, onDone, review }: { item: ReviewItem; filter: ReviewFilter; onDone: (id: string) => void; review: Review }) {
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const decide = async (d: 'approved' | 'excluded' | null) => {
    setError(null)
    const r = await review(item.id, d)
    if (!r.ok) { setError(r.error ?? 'Could not save'); return }
    setLeaving(true)
    setTimeout(() => onDone(item.id), 260)
  }
  const decision = item.status === 'accepted' ? { text: 'Added as suggested', color: SUCCESS_DARK, bg: SUCCESS_LIGHT }
    : item.status === 'edited' ? { text: 'Added with changes', color: WARN_DARK, bg: WARN_LIGHT }
    : { text: item.kind === 'new_since_checkin' ? 'Inspector: not new' : 'Inspector: not damage', color: DANGER_TEXT, bg: DANGER_LIGHT }
  const btn = (bg: string, fg: string, border?: string): React.CSSProperties => ({ flex: 1, height: 34, borderRadius: 9, border: border ? `1px solid ${border}` : 'none', background: bg, color: fg, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: 'inherit' })
  return (
    <div className="ciq-collapse" data-open={!leaving}>
      <div>
        <div className="ciq-rise" style={{ border: `1px solid ${GRAY_300}`, borderRadius: 14, overflow: 'hidden', background: WHITE }}>
          <div style={{ display: 'grid', gridTemplateColumns: item.kind === 'new_since_checkin' ? '1fr 1fr' : '1fr', gap: 2, background: GRAY_100 }}>
            {item.kind === 'new_since_checkin' && <Photo src={item.checkinPhotoUrl} caption="Check-in" />}
            <Photo src={item.photoUrl} caption={item.kind === 'new_since_checkin' ? 'Check-out' : SLOT_LABEL[item.slot as ExteriorSlot] ?? item.slot} />
          </div>
          <div style={{ padding: 12 }}>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: GRAY_900 }}>
              {suggestionTitle(item.damageGroup)}{item.kind === 'new_since_checkin' ? ', new since check-in' : ''}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: GRAY_700 }}>
              {[item.suggested.area ?? item.whereText, item.suggested.type].filter(Boolean).join(' · ')} · {Math.round(item.confidence * 100)}% sure
            </p>
            <span style={{ display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 700, color: decision.color, background: decision.bg, borderRadius: 20, padding: '3px 9px' }}>{decision.text}</span>
            {item.status === 'edited' && item.recorded ? (
              <p style={{ margin: '6px 0 0', fontSize: 12, color: GRAY_700 }}>Recorded as {[item.recorded.area, item.recorded.type, item.recorded.severity].filter(Boolean).join(' · ')}</p>
            ) : null}
            <p style={{ margin: '6px 0 0', fontSize: 11, color: GRAY_500 }}>{item.companyName ?? 'Unknown account'} · {new Date(item.createdAt).toLocaleDateString()}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {filter === 'to_review' ? (
                <>
                  <button type="button" onClick={() => decide('excluded')} style={btn(WHITE, GRAY_700, GRAY_300)}><X size={14} /> Exclude</button>
                  <button type="button" onClick={() => decide('approved')} style={btn(PRIMARY, WHITE)}><Check size={14} /> Approve</button>
                </>
              ) : (
                <button type="button" onClick={() => decide(null)} style={btn(WHITE, GRAY_700, GRAY_300)}><RotateCcw size={13} /> Back to review</button>
              )}
            </div>
            {error ? <p style={{ margin: '6px 0 0', fontSize: 12, color: DANGER_TEXT }}>{error}</p> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function Photo({ src, caption }: { src: string | null; caption: string }) {
  return (
    <div style={{ position: 'relative', aspectRatio: '4 / 3', background: GRAY_300 }}>
      {src ? <img src={src} alt={caption} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
      <span style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 10, fontWeight: 700, color: WHITE, background: 'rgba(15,23,42,0.6)', borderRadius: 6, padding: '2px 6px' }}>{caption}</span>
    </div>
  )
}

function ReviewQueue({ counts, onChange, queue, review }: { counts: Dashboard['review']; onChange: () => void; queue: Queue; review: Review }) {
  const [filter, setFilter] = useState<ReviewFilter>('to_review')
  const [items, setItems] = useState<ReviewItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setItems(null); setError(null)
    queue(filter).then(r => { if (!cancelled) setItems(r) }).catch(e => { if (!cancelled) setError(e?.message ?? 'Could not load') })
    return () => { cancelled = true }
  }, [filter, queue])
  const tabs: Array<[ReviewFilter, string, number]> = [['to_review', 'To review', counts.toReview], ['approved', 'Approved', counts.approved], ['excluded', 'Excluded', counts.excluded]]
  return (
    <Card>
      <SH>Example library review</SH>
      <p style={{ fontSize: 13, color: GRAY_700, margin: '-6px 0 14px', lineHeight: 1.5 }}>
        Every damage suggestion an inspector decided on is a labelled example from a real inspection. Approve the ones that are right to join the test sets and example library; exclude a wrong tap or an unclear photo. Approved examples are exported with <code>scripts/ai-lab/export-reviewed.ts</code>.
      </p>
      <div style={{ display: 'flex', gap: 4, background: GRAY_100, borderRadius: 10, padding: 3, marginBottom: 14, width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {tabs.map(([id, label, n]) => (
          <button key={id} type="button" onClick={() => setFilter(id)}
            style={{ height: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: filter === id ? WHITE : 'transparent', boxShadow: filter === id ? '0 1px 2px rgba(15,23,42,0.12)' : 'none', color: filter === id ? GRAY_900 : GRAY_500, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
            {label} <span style={{ color: GRAY_500, fontWeight: 500 }}>{n}</span>
          </button>
        ))}
      </div>
      {error ? <p style={{ fontSize: 13, color: DANGER_TEXT }}>{error}</p>
        : items === null ? <div style={{ padding: 30, textAlign: 'center' }}><Loader2 size={20} color={GRAY_500} className="animate-spin" /></div>
        : items.length === 0 ? <p style={{ fontSize: 13, color: GRAY_500, margin: 0, padding: '20px 0', textAlign: 'center' }}>{filter === 'to_review' ? 'Nothing waiting. Examples appear here as inspectors decide on suggestions.' : 'None yet.'}</p>
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
            {items.map(item => <ReviewCard key={item.id} item={item} filter={filter} review={review} onDone={id => { setItems(list => (list ?? []).filter(x => x.id !== id)); onChange() }} />)}
          </div>
        )}
    </Card>
  )
}

export default function AiDashboard() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    getAiDashboard(days).then(d => { setData(d); setError(null) }).catch(e => setError(e?.message ?? 'Could not load'))
  }, [days])
  useEffect(() => { load() }, [load])

  if (error) return <div className="adm-page"><p style={{ color: DANGER_TEXT, fontSize: 14 }}>{error}</p></div>
  if (!data) return <div className="adm-page" style={{ textAlign: 'center', paddingTop: 80 }}><Loader2 size={22} color={GRAY_500} className="animate-spin" /></div>
  return <DashboardView data={data} days={days} onDays={setDays} onReload={load} queue={listReviewQueue} review={reviewSuggestion} killSwitch={<AiKillSwitch />} />
}

/** The dashboard for data already loaded; the page above fetches it. */
export function DashboardView({ data, days, onDays, onReload, queue, review, killSwitch }: {
  data: Dashboard; days: number; onDays: (d: number) => void; onReload: () => void; queue: Queue; review: Review; killSwitch?: React.ReactNode
}) {
  const { spend, settings } = data
  const setDays = onDays
  const load = onReload
  const per = spend.perInspection
  const skippedTotal = spend.skipped.killSwitch + spend.skipped.accountOff + spend.skipped.ceiling + spend.skipped.notConfigured

  return (
    <div className="adm-page" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: GRAY_900, margin: 0 }}>AI</h1>
          <p style={{ fontSize: 13, color: GRAY_500, margin: '2px 0 0' }}>Spend, accuracy and the example library</p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: GRAY_100, borderRadius: 10, padding: 3 }}>
          {[7, 30, 90].map(d => (
            <button key={d} type="button" onClick={() => setDays(d)}
              style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: days === d ? WHITE : 'transparent', boxShadow: days === d ? '0 1px 2px rgba(15,23,42,0.12)' : 'none', color: days === d ? GRAY_900 : GRAY_500, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      {killSwitch}

      <div className="adm-g5" style={{ gap: 12 }}>
        <Stat label={`Spent, last ${data.days} days`} value={money(spend.totalUsd)} sub={`${spend.calls} calls`} />
        <Stat label="Average per inspection" value={money(per.avgUsd, 3)} sub={`${per.inspections} inspections · ceiling ${money(settings.ceilingUsd)}`} tone={per.avgUsd > settings.ceilingUsd * 0.8 ? 'warn' : undefined} />
        <Stat label="90% of inspections under" value={money(per.p90Usd, 3)} sub={`highest ${money(per.maxUsd, 3)}`} />
        <Stat label="Reached the ceiling" value={String(per.overCeiling + per.nearCeiling)} sub={`${spend.skipped.ceiling} checks skipped for it`} tone={spend.skipped.ceiling ? 'warn' : 'good'} />
        <Stat label="Skipped or failed" value={String(skippedTotal + spend.byFeature.reduce((s, f) => s + f.errors, 0))} sub={spend.unsettled ? `${spend.unsettled} unsettled` : `${spend.skipped.accountOff} with AI switched off`} tone={spend.unsettled ? 'bad' : undefined} />
      </div>

      <div className="adm-g32" style={{ gap: 16 }}>
        <Card>
          <SH>Spend per day</SH>
          <DailyBars daily={spend.daily} />
        </Card>
        <CeilingEditor key={`${settings.ceilingUsd}:${settings.summaryReserveUsd}`} ceiling={settings.ceilingUsd} reserve={settings.summaryReserveUsd} onSaved={load} />
      </div>

      <Card>
        <SH>Spend by feature</SH>
        <Table head={['Feature', 'Calls', 'Answered', 'Skipped', 'Errors', 'Cost', 'Avg time']}
          rows={spend.byFeature.map(f => [FEATURE[f.feature] ?? f.feature, f.calls, f.ok, f.skipped, f.errors, money(f.costUsd, 3), f.avgMs == null ? '—' : `${(f.avgMs / 1000).toFixed(1)} s`])} />
        {!spend.byFeature.length ? <p style={{ fontSize: 13, color: GRAY_500, margin: '8px 0 0' }}>No AI calls in this period.</p> : null}
      </Card>

      <div className="adm-g2" style={{ gap: 16 }}>
        <Card>
          <SH>Damage suggestions: did inspectors agree?</SH>
          <Table head={['', 'Added', 'Changed', 'Rejected', 'Open', 'Agreed']}
            rows={data.acceptance.byKind.map(a => [KIND[a.key] ?? a.key, a.accepted, a.edited, a.rejected, a.pending, pct(a.rate)])} />
          <div style={{ height: 14 }} />
          <Table head={['By damage type', 'Added', 'Changed', 'Rejected', 'Open', 'Agreed']}
            rows={data.acceptance.byGroup.map(a => [suggestionTitle(a.key).replace(/^Possible /, ''), a.accepted, a.edited, a.rejected, a.pending, pct(a.rate)])} />
          {!data.acceptance.byGroup.length ? <p style={{ fontSize: 13, color: GRAY_500, margin: '8px 0 0' }}>No suggestions decided yet.</p> : null}
        </Card>
        <Card>
          <SH>Other checks</SH>
          <Table head={['', 'Count', '']} rows={[
            ['Photos checked', data.photoChecks.photos, `${data.photoChecks.phoneFlagged} blurry or dark`],
            ['Checked by AI', data.photoChecks.aiChecked, `${data.photoChecks.wrongSubject} wrong view · ${data.photoChecks.notFramed} framing`],
            ['Odometer read', data.photoChecks.odometer.verified + data.photoChecks.odometer.mismatch, `${data.photoChecks.odometer.verified} matched · ${data.photoChecks.odometer.mismatch} differed`],
            ['Check-in comparisons', data.compares.compared, `${data.compares.notComparable} not comparable · ${data.compares.noCheckinPhoto} no photo`],
            ...data.scans.map(s => [s.kind === 'vin' ? 'VIN scans' : 'Plate scans', s.reads, s.saved ? `${pct(s.keptAsRead / s.saved)} kept as read · ${s.bySource.ai} by AI` : `${s.bySource.ai} by AI`]),
          ]} />
        </Card>
      </div>

      <ReviewQueue counts={data.review} onChange={load} queue={queue} review={review} />
    </div>
  )
}

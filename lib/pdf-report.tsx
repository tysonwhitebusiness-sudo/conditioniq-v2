'use client'

import {
  Document, Page, View, Text, Image, StyleSheet,
  Svg, Circle, Rect,
} from '@react-pdf/renderer'
import type { ScoreResult } from './vehicle-score'

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  midnight: '#0D1B2A', deep: '#1B2D40', cyan: '#00B4D8', amber: '#F4A62A',
  green: '#10B981', red: '#EF4444', yellow: '#F59E0B',
  gray100: '#F0F4F8', gray200: '#E1E8F0', gray400: '#94A3B8', gray600: '#4A5568',
  white: '#FFFFFF',
}

// ── Formatters ─────────────────────────────────────────────────────────────
function fmt(value: string | undefined | null): string {
  if (!value) return '—'
  return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) }
  catch { return iso }
}

function scoreColor(score: number): string {
  if (score >= 90) return C.green
  if (score >= 70) return C.cyan
  if (score >= 50) return C.yellow
  return C.red
}

function conditionColor(val: string): string {
  if (val === '—') return C.gray400
  const v = val.toLowerCase()
  if (['good', 'current', 'present', 'pass', 'yes', 'full'].some(x => v.includes(x))) return C.green
  if (['fair', 'faded', 'worn', 'stained', 'scratched', 'chipped', 'cracked'].some(x => v.includes(x))) return C.yellow
  return C.red
}

function fluidColor(level: string | undefined): string {
  if (!level) return C.gray400
  const l = level.toLowerCase()
  if (l === 'good' || l === 'full') return C.green
  if (l === 'low') return C.red
  return C.yellow
}

function fluidWidth(level: string | undefined): string {
  if (!level) return '0%'
  const l = level.toLowerCase()
  if (l === 'good' || l === 'full') return '100%'
  if (l === 'overfull') return '90%'
  if (l === 'fair') return '60%'
  if (l === 'low') return '25%'
  return '0%'
}

// ── Styles ─────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page:          { backgroundColor: C.white, fontFamily: 'Helvetica', fontSize: 9, color: C.midnight },
  pageHeader:    { backgroundColor: C.midnight, height: 36, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBrand:   { color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 10 },
  headerDiv:     { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.2)' },
  headerSub:     { color: 'rgba(255,255,255,0.5)', fontSize: 8 },
  headerVin:     { color: C.white, fontFamily: 'Courier', fontSize: 8 },
  accentLine:    { height: 3, backgroundColor: C.amber },
  content:       { padding: '16px 20px', flex: 1 },
  pageFooter:    { backgroundColor: C.midnight, height: 28, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerLeft:    { color: 'rgba(255,255,255,0.4)', fontSize: 7 },
  footerCenter:  { color: C.white, fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  footerRight:   { color: 'rgba(255,255,255,0.3)', fontSize: 7 },
  sectionHdr:    { backgroundColor: C.midnight, padding: '7px 12px', borderRadius: 4, marginBottom: 14 },
  sectionHdrTxt: { color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  divider:       { height: 1, backgroundColor: C.gray200, marginVertical: 8 },
})

// ── Reusable components ────────────────────────────────────────────────────

function ReportPage({ vin, date, pageNum, totalPages, logoUrl, companyName, brandHeaderColor, brandAccentColor, children }: {
  vin: string; date: string; pageNum: number; totalPages: number
  logoUrl?: string | null; companyName?: string | null
  brandHeaderColor?: string | null; brandAccentColor?: string | null
  children: React.ReactNode
}) {
  return (
    <Page size="A4" style={s.page}>
      <View style={[s.pageHeader, brandHeaderColor ? { backgroundColor: brandHeaderColor } : {}]}>
        <View style={s.headerLeft}>
          {logoUrl ? (
            <>
              <Image src={logoUrl} style={{ height: 20, maxWidth: 80, objectFit: 'contain' }} />
              {companyName && <><View style={s.headerDiv} /><Text style={s.headerBrand}>{companyName}</Text></>}
            </>
          ) : (
            <Text style={s.headerBrand}>{companyName ?? 'CONDITION IQ'}</Text>
          )}
          <View style={s.headerDiv} />
          <Text style={s.headerSub}>VEHICLE CONDITION REPORT</Text>
        </View>
        <Text style={s.headerVin}>VIN: {vin}</Text>
      </View>
      <View style={[s.accentLine, brandAccentColor ? { backgroundColor: brandAccentColor } : {}]} />
      <View style={s.content}>{children}</View>
      <View style={[s.pageFooter, brandHeaderColor ? { backgroundColor: brandHeaderColor } : {}]}>
        <Text style={s.footerLeft}>VIN: {vin} | {fmtDate(date)}</Text>
        <Text style={s.footerCenter}>Page {pageNum} of {totalPages}</Text>
        <Text style={s.footerRight}>Not a guarantee of mechanical fitness.</Text>
      </View>
    </Page>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={s.sectionHdr}>
      <Text style={s.sectionHdrTxt}>{label}</Text>
    </View>
  )
}

function DataChip({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: '6px 10px', flex: 1 }}>
      <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 7, textTransform: 'uppercase', marginBottom: 3 }}>{label}</Text>
      <Text style={{ color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 10 }}>{value}</Text>
    </View>
  )
}

function ConditionChip({ label, value }: { label: string; value: string }) {
  const color = conditionColor(value)
  return (
    <View style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderStyle: 'solid', borderRadius: 6, paddingTop: 10, paddingBottom: 10, paddingLeft: 10, paddingRight: 10, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, flexShrink: 0, alignSelf: 'center' }} />
      <View style={{ flexDirection: 'column', justifyContent: 'center' }}>
        <Text style={{ color: C.gray400, fontSize: 7, fontFamily: 'Helvetica', marginBottom: 3 }}>{label}</Text>
        <Text style={{ color, fontFamily: 'Helvetica-Bold', fontSize: 10 }}>{value}</Text>
      </View>
    </View>
  )
}

function AlertCard({ type, text }: { type: 'warning' | 'danger' | 'success'; text: string }) {
  const map = {
    warning: { bg: '#FEF3C7', border: C.yellow,  color: '#92400E' },
    danger:  { bg: '#FEE2E2', border: C.red,     color: '#991B1B' },
    success: { bg: '#D1FAE5', border: C.green,   color: '#065F46' },
  }
  const { bg, border, color } = map[type]
  return (
    <View style={{ backgroundColor: bg, borderLeftWidth: 3, borderLeftColor: border, borderLeftStyle: 'solid', borderRadius: 4, padding: '8px 12px', marginBottom: 6 }}>
      <Text style={{ color, fontSize: 9, fontFamily: 'Helvetica-Bold' }}>{text}</Text>
    </View>
  )
}

function CategoryBar({ label, score, max }: { label: string; score: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (score / max) * 100) : 0
  const color = scoreColor(pct)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
      <Text style={{ color: C.gray600, fontSize: 9, width: 90 }}>{label}</Text>
      <View style={{ flex: 1, height: 6, backgroundColor: C.gray200, borderRadius: 3, marginHorizontal: 8 }}>
        <View style={{ height: 6, width: `${pct}%`, backgroundColor: color, borderRadius: 3 }} />
      </View>
      <Text style={{ color: C.midnight, fontFamily: 'Helvetica-Bold', fontSize: 9, width: 40, textAlign: 'right' }}>
        {score}/{max}
      </Text>
    </View>
  )
}

function ResultIndicator({ result }: { result: string }) {
  const map: Record<string, { color: string; label: string }> = {
    pass:       { color: C.green,   label: 'PASS' },
    fail:       { color: C.red,     label: 'FAIL' },
    nt:         { color: C.gray600, label: 'N/T'  },
    not_tested: { color: C.gray600, label: 'N/T'  },
  }
  const { color, label } = map[result] ?? map.nt
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 }}>
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
      <Text style={{ color, fontSize: 7, fontFamily: 'Helvetica-Bold' }}>{label}</Text>
    </View>
  )
}

function FluidLevelBar({ label, level }: { label: string; level: string | undefined }) {
  const color = fluidColor(level)
  const width = fluidWidth(level)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: C.gray100, borderBottomStyle: 'solid' }}>
      <Text style={{ color: C.gray600, fontSize: 9, width: 80 }}>{label}</Text>
      <View style={{ flex: 1, height: 8, backgroundColor: C.gray200, borderRadius: 4, marginHorizontal: 8 }}>
        <View style={{ height: 8, width, backgroundColor: color, borderRadius: 4 }} />
      </View>
      <Text style={{ color, fontFamily: 'Helvetica-Bold', fontSize: 9, width: 70, textAlign: 'right' }}>{fmt(level)}</Text>
    </View>
  )
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const r = 46
  const circ = 2 * Math.PI * r
  const fill = (score / 100) * circ
  const color = scoreColor(score)
  return (
    <View style={{ width: 110, height: 110, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="110" height="110" viewBox="0 0 110 110">
        <Circle cx="55" cy="55" r={r.toString()} stroke={C.deep} strokeWidth="8" fill="none" />
        <Circle
          cx="55" cy="55" r={r.toString()}
          stroke={color} strokeWidth="8" fill="none"
          strokeLinecap="round"
          strokeDasharray={`${fill} ${circ}`}
          transform="rotate(-90 55 55)"
        />
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Text style={{ color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 28, lineHeight: 1 }}>{score}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{grade}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 7, textTransform: 'uppercase' }}>SCORE</Text>
      </View>
    </View>
  )
}

function TireDiagram({ ext }: { ext: Record<string, any> }) {
  const td = (key: string) => parseInt(ext[key]?.treadDepth ?? '-1')
  const tc = (d: number) => d < 0 ? C.gray400 : d >= 6 ? C.green : d >= 3 ? C.yellow : C.red
  const tl = (d: number) => d < 0 ? '—' : `${d}/32"`
  const fl = td('tireFrontLeft'), fr = td('tireFrontRight')
  const rl = td('tireRearLeft'),  rr = td('tireRearRight')
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ color: C.gray400, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>FRONT</Text>
      <Svg width="130" height="190" viewBox="0 0 130 190">
        {/* Body */}
        <Rect x="25" y="25" width="80" height="140" rx="10" fill={C.gray100} stroke={C.gray200} strokeWidth="1" />
        {/* Tires */}
        <Rect x="5"   y="28"  width="15" height="26" rx="3" fill={tc(fl)} />
        <Rect x="110" y="28"  width="15" height="26" rx="3" fill={tc(fr)} />
        <Rect x="5"   y="136" width="15" height="26" rx="3" fill={tc(rl)} />
        <Rect x="110" y="136" width="15" height="26" rx="3" fill={tc(rr)} />
      </Svg>
      <Text style={{ color: C.gray400, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>REAR</Text>
      <View style={{ flexDirection: 'row', width: 130, marginTop: 8 }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: tc(fl), fontSize: 7, fontFamily: 'Helvetica-Bold' }}>FL</Text>
          <Text style={{ color: tc(fl), fontSize: 7 }}>{tl(fl)}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: tc(fr), fontSize: 7, fontFamily: 'Helvetica-Bold' }}>FR</Text>
          <Text style={{ color: tc(fr), fontSize: 7 }}>{tl(fr)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', width: 130, marginTop: 6 }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: tc(rl), fontSize: 7, fontFamily: 'Helvetica-Bold' }}>RL</Text>
          <Text style={{ color: tc(rl), fontSize: 7 }}>{tl(rl)}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ color: tc(rr), fontSize: 7, fontFamily: 'Helvetica-Bold' }}>RR</Text>
          <Text style={{ color: tc(rr), fontSize: 7 }}>{tl(rr)}</Text>
        </View>
      </View>
    </View>
  )
}

function DamageTable({ items }: { items: any[] }) {
  const sevColor = (s: string) => {
    const l = s.toLowerCase()
    if (l === 'minor') return C.yellow
    if (l === 'moderate') return '#F97316'
    return C.red
  }
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', backgroundColor: C.midnight, padding: '5px 8px', borderRadius: 4 }}>
        {['#', 'TYPE', 'LOCATION', 'SEVERITY', 'DESCRIPTION'].map((h, i) => (
          <Text key={i} style={{ color: C.white, fontFamily: 'Helvetica-Bold', fontSize: 7, flex: i === 4 ? 2 : 1, textTransform: 'uppercase' }}>{h}</Text>
        ))}
      </View>
      {items.map((d: any, i: number) => (
        <View key={i} style={{ flexDirection: 'row', padding: '5px 8px', backgroundColor: i % 2 === 0 ? C.gray100 : C.white }}>
          <Text style={{ color: C.gray400, fontSize: 8, flex: 1 }}>{i + 1}</Text>
          <Text style={{ color: C.midnight, fontSize: 8, flex: 1 }}>{fmt(d.type)}</Text>
          <Text style={{ color: C.midnight, fontSize: 8, flex: 1 }}>{fmt(d.location)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sevColor(d.severity ?? '') }} />
            <Text style={{ color: sevColor(d.severity ?? ''), fontSize: 8 }}>{fmt(d.severity)}</Text>
          </View>
          <Text style={{ color: C.gray600, fontSize: 8, fontStyle: 'italic', flex: 2 }}>{d.description ?? '—'}</Text>
        </View>
      ))}
    </View>
  )
}

function PhotoGrid({ photos, photoHeight = 100 }: { photos: Array<{ url: string; caption: string }>; photoHeight?: number }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {photos.filter(p => p.url).map((p, i) => (
        <View key={i} style={{ width: '48%' }}>
          <Image src={p.url} style={{ width: '100%', height: photoHeight, borderWidth: 1, borderColor: C.gray200, borderStyle: 'solid', borderRadius: 6, objectFit: 'cover' }} />
          <Text style={{ color: C.gray400, fontSize: 7, textAlign: 'center', marginTop: 4 }}>{p.caption}</Text>
        </View>
      ))}
    </View>
  )
}

function CertificationSeal() {
  return (
    <View style={{ width: 80, height: 80, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width="80" height="80" viewBox="0 0 80 80">
        <Circle cx="40" cy="40" r="36" stroke={C.midnight} strokeWidth="1.5" fill="none" />
        <Circle cx="40" cy="40" r="30" stroke={C.midnight} strokeWidth="0.5" fill="none" />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 5.5, fontFamily: 'Helvetica-Bold', color: C.midnight, textTransform: 'uppercase' }}>CONDITION IQ</Text>
        <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.midnight, marginTop: 2 }}>VERIFIED</Text>
        <Text style={{ fontSize: 4.5, color: C.gray400, marginTop: 2 }}>VEHICLE INTELLIGENCE</Text>
      </View>
    </View>
  )
}

// ── Function test groups ───────────────────────────────────────────────────
// Keys must match what step-function.tsx stores in vehicle_function_data.tests
const TEST_GROUPS = [
  { title: 'Starting & Drivetrain', items: [
    { key: 'engineStarts', label: 'Engine Start' },
    { key: 'shiftsToD',    label: 'Shift to Drive' },
    { key: 'shiftsToR',    label: 'Shift to Reverse' },
    { key: 'parkingBrake', label: 'Parking Brake' },
  ]},
  { title: 'Lights', items: [
    { key: 'headlights',  label: 'Headlights' },
    { key: 'taillights',  label: 'Taillights' },
    { key: 'turnSignals', label: 'Turn Signals' },
    { key: 'brakeLights', label: 'Brake Lights' },
    { key: 'hazardLights',label: 'Hazard Lights' },
  ]},
  { title: 'Controls', items: [
    { key: 'horn',        label: 'Horn' },
    { key: 'wipers',      label: 'Wipers' },
    { key: 'washerFluid', label: 'Washer Fluid' },
    { key: 'ac',          label: 'A/C' },
    { key: 'heater',      label: 'Heater' },
    { key: 'radio',       label: 'Radio' },
  ]},
  { title: 'Windows & Locks', items: [
    { key: 'powerWindows', label: 'Power Windows' },
    { key: 'powerLocks',   label: 'Power Locks' },
    { key: 'mirrors',      label: 'Mirrors' },
  ]},
]

const TOTAL_FUNCTION_TESTS = TEST_GROUPS.reduce((sum, g) => sum + g.items.length, 0)

// ── Main component ─────────────────────────────────────────────────────────
interface ReportProps {
  inspectionData: Record<string, any>
  scoreResult: ScoreResult
  signatureUrl: string
  photos?: Record<string, string>
  logoUrl?: string | null
  companyName?: string | null
  brandHeaderColor?: string | null
  brandAccentColor?: string | null
}

export default function InspectionReport({ inspectionData, scoreResult, signatureUrl, photos = {}, logoUrl, companyName, brandHeaderColor, brandAccentColor }: ReportProps) {
  const vi   = inspectionData.vehicleInfo ?? {}
  const bol  = inspectionData.bol_data ?? {}
  const keys = inspectionData.keys_data ?? {}
  const fn   = inspectionData.vehicle_function_data ?? {}
  const doc  = inspectionData.documentation_data ?? {}
  const ext  = inspectionData.exterior_data ?? {}
  const int_ = inspectionData.interior_data ?? {}
  const eng  = inspectionData.engine_data ?? {}

  const date  = inspectionData.timestamp ?? new Date().toISOString()
  const vin   = vi.vin ?? inspectionData.vin ?? '—'
  const title = `${vi.year ?? ''} ${vi.make ?? ''} ${vi.model ?? ''}`.trim() || 'Unknown Vehicle'
  const gc    = scoreColor(scoreResult.score)

  // Resolve photo to base64 if prefetched, else use URL directly
  const img = (url: string | undefined): string => (url ? (photos[url] ?? url) : '')

  const extDamages = ext.damages ?? []
  const intDamages = int_.damages ?? []
  const tests      = fn.tests ?? {}

  // Count by iterating displayed items so tally always matches what's rendered
  let passCount = 0, failCount = 0, ntCount = 0
  TEST_GROUPS.forEach(group => {
    group.items.forEach(item => {
      const r = tests[item.key]
      if (r === 'pass') passCount++
      else if (r === 'fail') failCount++
      else ntCount++
    })
  })

  const catBars = [
    { label: 'Exterior',      score: scoreResult.breakdown?.exterior      ?? 0, max: 25 },
    { label: 'Interior',      score: scoreResult.breakdown?.interior      ?? 0, max: 20 },
    { label: 'Mechanical',    score: scoreResult.breakdown?.mechanical    ?? 0, max: 30 },
    { label: 'Documentation', score: scoreResult.breakdown?.documentation ?? 0, max: 15 },
    { label: 'Mileage',       score: scoreResult.breakdown?.mileage       ?? 0, max: 10 },
  ]

  const extPhotos = [
    { url: img(ext.exteriorFrontPhoto),     caption: 'Front View'      },
    { url: img(ext.exteriorRearPhoto),      caption: 'Rear View'       },
    { url: img(ext.exteriorDriverPhoto),    caption: 'Driver Side'     },
    { url: img(ext.exteriorPassengerPhoto), caption: 'Passenger Side'  },
  ].filter(p => p.url)

  const intPhotos = [
    { url: img(int_.interiorDriverDoorPhoto),       caption: 'Driver Door'         },
    { url: img(int_.interiorRearDriverDoorPhoto),   caption: 'Rear Driver Door'    },
    { url: img(int_.interiorTrunkPhoto),            caption: 'Trunk / Cargo'       },
    { url: img(int_.interiorRearPassengerDoorPhoto),caption: 'Rear Passenger Door' },
    { url: img(int_.interiorPassengerDoorPhoto),    caption: 'Passenger Door'      },
    { url: img(int_.dashboardPhoto),                caption: 'Dashboard'           },
  ].filter(p => p.url)

  const hasExtOverflow  = extPhotos.length >= 4
  const totalPages      = hasExtOverflow ? 8 : 7
  const pgInterior      = hasExtOverflow ? 6 : 5
  const pgEngine        = hasExtOverflow ? 7 : 6
  const pgCert          = totalPages

  const base = { vin, date, totalPages, logoUrl, companyName, brandHeaderColor, brandAccentColor }

  // NHTSA-sourced fields
  const nhtsaBodyClass = vi.bodyClass  ?? vi.body_class  ?? ''
  const nhtsaEngine    = vi.engineType ?? vi.engine_type ?? vi.engine ?? ''
  const nhtsaDriveType = vi.driveType  ?? vi.drive_type  ?? ''
  const hasNhtsa       = !!(nhtsaBodyClass || nhtsaEngine || nhtsaDriveType)

  return (
    <Document title={`Inspection Report — ${vin}`} author="Condition IQ">

      {/* ══ PAGE 1: COVER ══════════════════════════════════════════════════ */}
      <ReportPage {...base} pageNum={1}>
        {/* Dark hero */}
        <View style={{ backgroundColor: C.midnight, borderRadius: 8, padding: 24, marginBottom: 14 }}>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 3 }}>
              <Text style={{ color: C.cyan, fontSize: 9, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
                VEHICLE CONDITION REPORT
              </Text>
              <Text style={{ color: C.white, fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 4 }}>{title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'Courier', marginBottom: 16 }}>{vin}</Text>
              <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 16 }} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <DataChip label="Odometer"  value={vi.odometer ? `${vi.odometer} mi` : '—'} />
                <DataChip label="Inspector" value={vi.inspectorName ?? '—'} />
                <DataChip label="Location"  value={vi.location ?? '—'} />
              </View>
              {hasNhtsa && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  {nhtsaBodyClass && <DataChip label="Body Class" value={fmt(nhtsaBodyClass)} />}
                  {nhtsaEngine    && <DataChip label="Engine"     value={fmt(nhtsaEngine)} />}
                  {nhtsaDriveType && <DataChip label="Drive Type" value={fmt(nhtsaDriveType)} />}
                </View>
              )}
              <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8, marginTop: 12 }}>{fmtDate(date)}</Text>
            </View>
            <View style={{ flex: 2, alignItems: 'center', justifyContent: 'center' }}>
              <ScoreRing score={scoreResult.score} grade={scoreResult.grade} />
            </View>
          </View>
        </View>

        {/* Category bars */}
        <View style={{ marginBottom: 14 }}>
          {catBars.map(b => <CategoryBar key={b.label} label={b.label} score={b.score} max={b.max} />)}
        </View>

        {/* Stat chips */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <View style={{ flex: 1, backgroundColor: C.gray100, borderRadius: 8, padding: '10px 16px', alignItems: 'center' }}>
            <Text style={{ color: C.cyan, fontFamily: 'Helvetica-Bold', fontSize: 20 }}>{TOTAL_FUNCTION_TESTS}</Text>
            <Text style={{ color: C.gray400, fontSize: 8, marginTop: 2 }}>function tests</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: C.gray100, borderRadius: 8, padding: '10px 16px', alignItems: 'center' }}>
            <Text style={{ color: C.amber, fontFamily: 'Helvetica-Bold', fontSize: 20 }}>{extDamages.length + intDamages.length}</Text>
            <Text style={{ color: C.gray400, fontSize: 8, marginTop: 2 }}>damage items</Text>
          </View>
        </View>

        {/* Action plan */}
        {scoreResult.recommendations?.length > 0 && (
          <View>
            <View style={{ borderLeftWidth: 3, borderLeftColor: C.cyan, borderLeftStyle: 'solid', paddingLeft: 8, marginBottom: 8 }}>
              <Text style={{ color: C.midnight, fontFamily: 'Helvetica-Bold', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 }}>ACTION PLAN</Text>
            </View>
            {scoreResult.recommendations.map((rec: string, i: number) => (
              <View key={i} style={{ backgroundColor: C.gray100, borderRadius: 4, padding: '6px 10px', marginBottom: 4, flexDirection: 'row', gap: 6 }}>
                <Text style={{ color: C.gray400, fontSize: 9 }}>•</Text>
                <Text style={{ color: C.midnight, fontSize: 9, flex: 1 }}>{rec}</Text>
              </View>
            ))}
          </View>
        )}
      </ReportPage>

      {/* ══ PAGE 2: SPECS + DOCS ═══════════════════════════════════════════ */}
      <ReportPage {...base} pageNum={2}>
        <SectionHeader label="VEHICLE SPECIFICATIONS" />
        {[
          { label: 'Year',      value: vi.year,     mono: false },
          { label: 'Make',      value: vi.make,     mono: false },
          { label: 'Model',     value: vi.model,    mono: false },
          { label: 'VIN',       value: vin,         mono: true  },
          { label: 'Odometer',   value: vi.odometer ? `${vi.odometer} mi` : undefined, mono: false },
          { label: 'Body Class', value: nhtsaBodyClass || undefined, mono: false },
          { label: 'Engine',     value: nhtsaEngine    || undefined, mono: false },
          { label: 'Drive Type', value: nhtsaDriveType || undefined, mono: false },
          { label: 'Location',   value: vi.location, mono: false },
          { label: 'Asset ID',   value: vi.assetId,  mono: false },
        ].filter(r => r.value).map((r, i) => (
          <View key={i} style={{ flexDirection: 'row', padding: '7px 12px', backgroundColor: i % 2 === 0 ? C.gray100 : C.white }}>
            <Text style={{ color: C.gray400, fontSize: 8, flex: 1 }}>{r.label}</Text>
            <Text style={{ color: C.midnight, fontFamily: r.mono ? 'Courier' : 'Helvetica-Bold', fontSize: 9, flex: 2 }}>{r.value}</Text>
          </View>
        ))}

        <View style={{ height: 14 }} />
        <SectionHeader label="DOCUMENTATION & KEYS" />

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          {[
            { label: 'BOL Present',   value: bol.bolPresent            ? 'Yes'     : 'No',          ok: !!bol.bolPresent },
            { label: 'Registration',  value: doc.registrationCurrent   ? 'Current' : 'Not Current', ok: !!doc.registrationCurrent },
            { label: 'Insurance',     value: doc.insurancePresent      ? 'Present' : 'Not Present', ok: !!doc.insurancePresent },
          ].map((chip, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderStyle: 'solid', borderRadius: 6, padding: '8px 12px' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: chip.ok ? C.green : C.red, marginRight: 6 }} />
                <Text style={{ color: C.gray400, fontSize: 8 }}>{chip.label}</Text>
              </View>
              <Text style={{ color: C.midnight, fontFamily: 'Helvetica-Bold', fontSize: 10 }}>{chip.value}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 8 }}>
          {doc.licensePlate && (
            <Text style={{ fontSize: 8, color: C.gray600 }}>
              License Plate: <Text style={{ fontFamily: 'Helvetica-Bold', color: C.midnight }}>{doc.licensePlate}</Text>
            </Text>
          )}
          {doc.licensePlateState && (
            <Text style={{ fontSize: 8, color: C.gray600 }}>
              State: <Text style={{ fontFamily: 'Helvetica-Bold', color: C.midnight }}>{doc.licensePlateState}</Text>
            </Text>
          )}
          <Text style={{ fontSize: 8, color: C.gray600 }}>
            Keys: <Text style={{ fontFamily: 'Helvetica-Bold', color: C.midnight }}>{keys.mechanicalKeys ?? 0}</Text>
          </Text>
          <Text style={{ fontSize: 8, color: C.gray600 }}>
            FOBs: <Text style={{ fontFamily: 'Helvetica-Bold', color: C.midnight }}>{keys.keyFobs ?? 0}</Text>
          </Text>
        </View>

        {bol.bolNotes && (
          <Text style={{ color: C.gray600, fontStyle: 'italic', fontSize: 8, marginBottom: 8 }}>{bol.bolNotes}</Text>
        )}

        {[
          { url: img(keys.keysPhoto),         caption: 'Keys & FOBs'   },
          { url: img(doc.licensePlatePhoto),  caption: 'License Plate' },
          { url: img(doc.registrationPhoto),  caption: 'Registration'  },
        ].filter(p => p.url).length > 0 && (
          <PhotoGrid photos={[
            { url: img(keys.keysPhoto),        caption: 'Keys & FOBs'   },
            { url: img(doc.licensePlatePhoto), caption: 'License Plate' },
            { url: img(doc.registrationPhoto), caption: 'Registration'  },
          ].filter(p => p.url)} />
        )}
      </ReportPage>

      {/* ══ PAGE 3: FUNCTION TESTS ═════════════════════════════════════════ */}
      <ReportPage {...base} pageNum={3}>
        <SectionHeader label="FUNCTION TESTS" />

        {TEST_GROUPS.map((group, gi) => {
          const items = group.items.map(it => ({ ...it, result: (tests[it.key] ?? 'nt') as string }))
          const gPass = items.filter(x => x.result === 'pass').length
          const gFail = items.filter(x => x.result === 'fail').length
          return (
            <View key={gi} style={{ backgroundColor: C.white, borderWidth: 1, borderColor: C.gray200, borderStyle: 'solid', borderRadius: 8, padding: '12px 14px', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ color: C.midnight, fontFamily: 'Helvetica-Bold', fontSize: 10 }}>{group.title}</Text>
                <Text style={{ color: C.gray400, fontSize: 8 }}>{gPass} / {items.length} pass</Text>
              </View>
              {/* Pass rate bar */}
              <View style={{ height: 3, backgroundColor: C.gray200, borderRadius: 1.5, marginBottom: 8 }}>
                <View style={{ height: 3, width: `${items.length > 0 ? (gPass / items.length) * 100 : 0}%`, backgroundColor: gFail > 0 ? C.red : gPass === items.length ? C.green : C.yellow, borderRadius: 1.5 }} />
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {items.map((item, ii) => (
                  <View key={ii} style={{ width: '50%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: C.gray100, borderBottomStyle: 'solid' }}>
                    <Text style={{ color: C.gray600, fontSize: 8, flex: 1 }}>{item.label}</Text>
                    <ResultIndicator result={item.result} />
                  </View>
                ))}
              </View>
            </View>
          )
        })}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 }}>
          <Text style={{ color: C.green,   fontFamily: 'Helvetica-Bold', fontSize: 9 }}>Pass: {passCount}</Text>
          <View style={{ width: 1, height: 12, backgroundColor: C.gray200 }} />
          <Text style={{ color: C.red,     fontFamily: 'Helvetica-Bold', fontSize: 9 }}>Fail: {failCount}</Text>
          <View style={{ width: 1, height: 12, backgroundColor: C.gray200 }} />
          <Text style={{ color: C.gray400, fontSize: 9 }}>N/T: {ntCount}</Text>
        </View>

        {fn.functionNotes && (
          <View style={{ backgroundColor: '#FEF3C7', borderLeftWidth: 3, borderLeftColor: C.yellow, borderLeftStyle: 'solid', borderRadius: 4, padding: '8px 12px', marginTop: 10 }}>
            <Text style={{ color: '#92400E', fontStyle: 'italic', fontSize: 8 }}>{fn.functionNotes}</Text>
          </View>
        )}
      </ReportPage>

      {/* ══ PAGE 4: EXTERIOR ═══════════════════════════════════════════════ */}
      <ReportPage {...base} pageNum={4}>
        <SectionHeader label="EXTERIOR CONDITION" />

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          <ConditionChip label="Overall" value={fmt(ext.overallCondition)} />
          <ConditionChip label="Paint"   value={fmt(ext.paintCondition)}   />
          <ConditionChip label="Glass"   value={fmt(ext.glassCondition)}   />
        </View>

        <View style={{ flexDirection: 'row', gap: 16 }}>
          <TireDiagram ext={ext} />
          <View style={{ flex: 1 }}>
            {extDamages.length > 0
              ? <><Text style={{ color: C.midnight, fontFamily: 'Helvetica-Bold', fontSize: 9, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Damage</Text><DamageTable items={extDamages} /></>
              : <AlertCard type="success" text="No exterior damage reported" />
            }
            {ext.exteriorNotes && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: C.gray400, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>NOTES</Text>
                <Text style={{ color: C.gray600, fontSize: 8, fontStyle: 'italic' }}>{ext.exteriorNotes}</Text>
              </View>
            )}
          </View>
        </View>

        {extPhotos.slice(0, 2).length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: C.gray400, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>EXTERIOR PHOTOS</Text>
            <PhotoGrid photos={extPhotos.slice(0, 2)} />
          </View>
        )}
      </ReportPage>

      {/* ══ PAGE 5: EXTERIOR PHOTOS (overflow) ════════════════════════════ */}
      {hasExtOverflow && (
        <ReportPage {...base} pageNum={5}>
          <SectionHeader label="EXTERIOR PHOTOS (CONTINUED)" />
          <PhotoGrid photos={extPhotos.slice(2)} />
        </ReportPage>
      )}

      {/* ══ PAGE 6 (or 5): INTERIOR ════════════════════════════════════════ */}
      <ReportPage {...base} pageNum={pgInterior}>
        <SectionHeader label="INTERIOR CONDITION" />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 6, marginBottom: 12 }}>
          {[
            { label: 'Overall',        value: fmt(int_.overallCondition) },
            { label: 'Front Seats',    value: fmt(int_.frontSeats)       },
            { label: 'Rear Seats',     value: fmt(int_.rearSeats)        },
            { label: 'Dashboard',      value: fmt(int_.dashboard)        },
            { label: 'Headliner',      value: fmt(int_.headliner)        },
            { label: 'Carpet',         value: fmt(int_.carpetFloor)      },
            { label: 'Steering Wheel', value: fmt(int_.steeringWheel)    },
          ].map((chip, i) => (
            <View key={i} style={{ width: '48%' }}>
              <ConditionChip label={chip.label} value={chip.value} />
            </View>
          ))}
        </View>

        {int_.interiorOdor  && <AlertCard type="warning" text="Odor Detected" />}
        {intDamages.length > 0
          ? <AlertCard type="danger"  text={`${intDamages.length} interior damage item${intDamages.length !== 1 ? 's' : ''} reported`} />
          : <AlertCard type="success" text="No interior damage reported" />
        }
        {intDamages.length > 0 && <DamageTable items={intDamages} />}

        {intPhotos.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: C.gray400, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>INTERIOR PHOTOS</Text>
            <PhotoGrid photos={intPhotos} photoHeight={80} />
          </View>
        )}
      </ReportPage>

      {/* ══ PAGE 7 (or 6): ENGINE ══════════════════════════════════════════ */}
      <ReportPage {...base} pageNum={pgEngine}>
        <SectionHeader label="ENGINE & MECHANICAL" />

        <FluidLevelBar label="Oil Level"    level={eng.oilLevel}            />
        <FluidLevelBar label="Coolant Level" level={eng.coolantLevel}       />
        <FluidLevelBar label="Brake Fluid"  level={eng.brakeFluid}          />
        <FluidLevelBar label="Trans Fluid"  level={eng.transmissionFluid}   />

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 10 }}>
          <ConditionChip label="Battery" value={fmt(eng.batteryCondition)} />
          <ConditionChip label="Belts"   value={fmt(eng.beltCondition)}    />
          <ConditionChip label="Hoses"   value={fmt(eng.hoseCondition)}    />
        </View>

        {eng.visibleLeaks     && <AlertCard type="danger"  text={`Visible Leaks — ${eng.leakNotes ?? 'Present'}`} />}
        {eng.unusualNoise     && <AlertCard type="danger"  text="Unusual Engine Noise — Diagnostic Recommended"  />}
        {eng.checkEngineLight && <AlertCard type="warning" text="Check Engine Light: ON" />}
        {!eng.visibleLeaks && !eng.unusualNoise && !eng.checkEngineLight && (
          <AlertCard type="success" text="No engine warnings detected" />
        )}

        {eng.engineNotes && (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: C.gray400, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>ENGINE NOTES</Text>
            <Text style={{ color: C.gray600, fontSize: 8, fontStyle: 'italic' }}>{eng.engineNotes}</Text>
          </View>
        )}

        {img(eng.enginePhoto) && (
          <View>
            <Text style={{ color: C.gray400, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>ENGINE BAY</Text>
            <Image src={img(eng.enginePhoto)} style={{ width: '100%', height: 120, borderRadius: 6, objectFit: 'cover', borderWidth: 1, borderColor: C.gray200, borderStyle: 'solid' }} />
          </View>
        )}
      </ReportPage>

      {/* ══ PAGE 8 (or 7): CERTIFICATION ══════════════════════════════════ */}
      <ReportPage {...base} pageNum={pgCert}>
        <SectionHeader label="INSPECTOR CERTIFICATION" />

        <View style={{ borderWidth: 1, borderColor: C.gray200, borderStyle: 'solid', borderRadius: 8, padding: 20, marginBottom: 14 }}>
          <Text style={{ color: C.midnight, fontFamily: 'Helvetica-Bold', fontSize: 14, marginBottom: 4 }}>
            {vi.inspectorName ?? '—'}
          </Text>
          <Text style={{ color: C.gray600, fontSize: 9, marginBottom: 2 }}>Vehicle Inspector</Text>
          <Text style={{ color: C.gray600, fontSize: 9, marginBottom: 12 }}>{fmtDate(date)}</Text>

          <Text style={{ color: C.gray600, fontStyle: 'italic', fontSize: 8.5, lineHeight: 1.6, marginBottom: 14 }}>
            I hereby certify that this vehicle inspection was conducted accurately and completely to the best of my knowledge. All conditions noted herein reflect the actual state of the vehicle at the time of inspection.
          </Text>

          <View style={s.divider} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, marginBottom: 14 }}>
            <View>
              <Text style={{ color: C.gray400, fontSize: 8 }}>Report ID</Text>
              <Text style={{ color: C.midnight, fontFamily: 'Courier', fontSize: 9 }}>
                {inspectionData.inspectionId ?? '—'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: C.gray400, fontSize: 8 }}>Vehicle Score</Text>
              <Text style={{ color: gc, fontFamily: 'Helvetica-Bold', fontSize: 12 }}>
                {scoreResult.grade} ({scoreResult.score}/100)
              </Text>
            </View>
          </View>

          {img(signatureUrl) && (
            <>
              <Text style={{ color: C.gray400, fontSize: 7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>SIGNATURE</Text>
              <Image src={img(signatureUrl)} style={{ width: 180, height: 60, objectFit: 'contain' }} />
            </>
          )}

          <View style={{ position: 'absolute', bottom: 20, right: 20 }}>
            <CertificationSeal />
          </View>
        </View>

        <View style={{ backgroundColor: C.gray100, borderRadius: 6, padding: '10px 14px' }}>
          <Text style={{ color: C.gray400, fontSize: 7.5, lineHeight: 1.5 }}>
            This inspection report is based on visual examination and basic functional tests performed at the time of inspection. It does not constitute a warranty or guarantee of vehicle condition, performance, or value. Report valid for 30 days from inspection date.
          </Text>
        </View>
      </ReportPage>

    </Document>
  )
}

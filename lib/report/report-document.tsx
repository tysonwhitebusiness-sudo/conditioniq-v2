import React from 'react'
import { Document, Page, View, Text, Image, Link, Svg, Circle, Rect } from '@react-pdf/renderer'
import type { ReportModel, ReportPhoto, RecommendationUrgency } from './model'
import type { ReportImage } from './photos'
import { PAGE, CONTENT_WIDTH, photoBox, columnWidth, PHOTO_BOXES, REPORT_TIME_ZONE, reportVerifyText } from './layout'
import { needsAttention, checkedOk, treadDepth, isFlat, tireNotes, TIRE_POSITIONS, vinCheckDigitValid, DISCLOSURE, AI_DISCLOSURE, type FindingLevel } from './findings'

// R3 · The approved layout ("A4"), drawn from what the inspection recorded.
//
// Page 1 is the summary a buyer reads first: the vehicle, the score and how it
// was reached, the lead photo, and what needs attention next to what checked
// out. Everything after is the evidence — damage, condition, photos, documents
// — with what to do next and the inspector's certification at the end.
//
// The AI slots (summary, urgency-sorted recommendations, recall, complaints,
// photo check) print only when model.assist carries them. Without them the
// report still reads as finished: the score's own recommendations stand in.
//
// Two react-pdf traps, both caught by the render test (scripts/report-test.mjs):
//   · a line break inside one text block is drawn but not measured
//   · a percentage height inside a row corrupts text measurement for the page
// Neither appears in this file; don't reintroduce them. Section titles sit
// inside a wrap={false} group with their first block so none is left alone at
// the foot of a page.

const C = {
  ink: '#0D1B2A', ink2: '#3D4F61', ink3: '#6B7C8C', line: '#D9E1E8', fill: '#F2F5F8',
  white: '#FFFFFF', accent: '#0077A0', cyan: '#00B4D8', amber: '#F4A62A', midnight: '#0D1B2A',
  ok: '#1B7A4E', okBg: '#E4F4EC', warn: '#A86400', warnBg: '#FCF1DC', risk: '#C0362C', riskBg: '#FBE9E7',
  note: '#4A5B6B', noteBg: '#EEF2F5',
  cardBorder: '#DCE7EE', summaryBorder: '#BFE6F1', checkBorder: '#F0C98A', checkBg: '#FFF8EC',
  recallText: '#C9D5DF', recallMuted: '#8FA3B3',
}

const LEVEL: Record<FindingLevel | 'ok', [string, string]> = {
  risk: [C.risk, C.riskBg], warn: [C.warn, C.warnBg], note: [C.note, C.noteBg], ok: [C.ok, C.okBg],
}
const URGENCY: Record<RecommendationUrgency, string> = { 'Before road use': C.risk, Soon: C.warn, Reconditioning: C.note }

export interface ReportDiagram {
  view: string
  image: ReportImage
  aspect: number
  modelAssetId: string
}

export interface ReportDocumentProps {
  model: ReportModel
  /** Prepared photos, keyed by their source string. */
  images: Record<string, ReportImage | null>
  diagrams: ReportDiagram[]
  branding?: { logo?: ReportImage | null; headerColor?: string | null; accentColor?: string | null }
  /** The verify link as a QR code, printed on the certification card. */
  qr?: { data: Buffer; format: 'png' } | null
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: REPORT_TIME_ZONE })
const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: REPORT_TIME_ZONE, timeZoneName: 'short' })
const label = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—'
  return String(v).replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}
const conditionColor = (v: unknown): string => {
  const s = typeof v === 'string' ? v.toLowerCase() : ''
  if (!s) return C.ink3
  if (['good', 'full', 'current', 'present', 'pass', 'yes'].some(x => s.includes(x))) return C.ok
  if (['low', 'poor', 'burned', 'torn', 'cracked', 'shattered', 'leaking', 'wet', 'fail'].some(x => s.includes(x))) return C.risk
  if (['not_checked', 'not checked', 'not_visible', 'n/v'].some(x => s.includes(x))) return C.ink3
  return C.warn
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const treadColor = (tread: number | null) => (tread == null ? C.ink3 : tread >= 6 ? C.ok : tread >= 3 ? C.warn : C.risk)
const barColor = (pct: number) => (pct >= 0.9 ? C.ok : pct >= 0.7 ? C.accent : pct >= 0.5 ? C.warn : C.risk)

export const TEST_GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  { title: 'Starting & drivetrain', items: [['engineStarts', 'Engine start'], ['shiftsToD', 'Shift to drive'], ['shiftsToR', 'Shift to reverse'], ['parkingBrake', 'Parking brake']] },
  { title: 'Lights', items: [['headlights', 'Headlights'], ['taillights', 'Taillights'], ['turnSignals', 'Turn signals'], ['brakeLights', 'Brake lights'], ['hazardLights', 'Hazard lights']] },
  { title: 'Controls', items: [['horn', 'Horn'], ['wipers', 'Wipers'], ['washerFluid', 'Washer fluid'], ['ac', 'A/C'], ['heater', 'Heater'], ['radio', 'Radio']] },
  { title: 'Windows & locks', items: [['powerWindows', 'Power windows'], ['powerLocks', 'Power locks'], ['mirrors', 'Mirrors']] },
]

/** Damage prints as cards up to this many pins, as a table beyond it. */
const DAMAGE_CARD_LIMIT = 4

// ── Styles shared by the pieces below ─────────────────────────────────────
const S = {
  eyebrow: { fontSize: 7, fontWeight: 600, letterSpacing: 1, color: C.accent, textTransform: 'uppercase' as const },
  label: { fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, color: C.ink3, textTransform: 'uppercase' as const },
  k: { color: C.ink3, fontSize: 7.5 },
  card: { backgroundColor: C.white, borderWidth: 0.75, borderColor: C.cardBorder, borderRadius: 7, padding: 11 },
  note: { color: C.ink2, fontSize: 7.5, marginTop: 4 },
}

// ── Primitives ─────────────────────────────────────────────────────────────

function Photo({ img, kind, width, style }: { img: ReportImage | null | undefined; kind: keyof typeof PHOTO_BOXES; width?: number; style?: any }) {
  const box = photoBox(kind, width)
  return (
    <View style={{ width: box.width, height: box.height, borderRadius: box.radius, overflow: 'hidden', backgroundColor: C.fill, ...(style ?? {}) }}>
      {img ? <Image src={{ data: img.data, format: img.format }} style={{ width: box.width, height: box.height, objectFit: box.fit }} /> : null}
    </View>
  )
}

function CaptionedPhoto({ photo, number, images, kind, width }: { photo: ReportPhoto; number: number; images: ReportDocumentProps['images']; kind: keyof typeof PHOTO_BOXES; width?: number }) {
  const box = photoBox(kind, width)
  return (
    <View style={{ width: box.width }}>
      <View style={{ position: 'relative' }}>
        <Photo img={images[photo.src]} kind={kind} width={width} />
        <Text style={{ position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(13,27,42,0.78)', color: C.white, fontSize: 6.5, fontWeight: 700, paddingVertical: 1.5, paddingHorizontal: 4, borderRadius: 2 }}>
          {String(number)}
        </Text>
      </View>
      <Text style={{ fontSize: 7, color: C.ink3, marginTop: 2.5 }}>{photo.label}</Text>
    </View>
  )
}

// Page breaks go on the group a title sits in, not on the title: a break inside
// a wrap={false} group is ignored.
function SectionTitle({ title, count, meta, first }: { title: string; count?: number; meta?: string; first?: boolean }) {
  return (
    <View minPresenceAhead={110} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: first ? 0 : 20, marginBottom: 9, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: C.ink }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Text style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>{title}</Text>
        {count != null ? (
          <Text style={{ fontSize: 9, fontWeight: 700, color: C.white, backgroundColor: C.ink, borderRadius: 7, paddingVertical: 1, paddingHorizontal: 5 }}>{String(count)}</Text>
        ) : null}
      </View>
      {meta ? <Text style={{ fontSize: 7.5, color: C.ink3 }}>{meta}</Text> : null}
    </View>
  )
}

// A value with a decimal in it — "2.5L", "13.5 in" — is split at the point.
// Inter turns digit-period-digit into a ligature that drops the leading digit
// when the whole value is a single text run, which is why engines printed as
// ".5L". Two runs, no ligature.
function Value({ text, color, weight = 600, style }: { text: string; color?: string; weight?: number; style?: any }) {
  const at = text.search(/\d\.\d/)
  const base = { fontWeight: weight, color: color ?? C.ink, ...(style ?? {}) }
  if (at === -1) return <Text style={base}>{text}</Text>
  return (
    <Text style={base}>
      {text.slice(0, at + 1)}
      <Text>{text.slice(at + 1)}</Text>
    </Text>
  )
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.4, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
      <Text style={{ color: C.ink2 }}>{k}</Text>
      <Value text={v} color={color} />
    </View>
  )
}

function Icon({ level, size = 11 }: { level: FindingLevel | 'ok'; size?: number }) {
  const [color, bg] = LEVEL[level]
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color, fontSize: size * 0.68, fontWeight: 800, lineHeight: 1 }}>{level === 'ok' ? '✓' : level === 'note' ? 'i' : '!'}</Text>
    </View>
  )
}

function ScoreRing({ score, grade, size = 74, stroke = 6 }: { score: number; grade: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const color = score >= 90 ? '#10B981' : score >= 70 ? C.cyan : score >= 50 ? '#F59E0B' : '#EF4444'
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.line} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${circumference * score / 100} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: size * 0.3, fontWeight: 800, lineHeight: 1 }}>{String(score)}</Text>
        <Text style={{ fontSize: size * 0.12, fontWeight: 600, color: C.ink3, marginTop: 2 }}>{`Grade ${grade}`}</Text>
      </View>
    </View>
  )
}

function Diagram({ diagram, pins, width }: { diagram: ReportDiagram; pins: ReportModel['pins']; width: number }) {
  const height = width * diagram.aspect
  const badge = 11
  return (
    <View style={{ width, height, position: 'relative' }}>
      <Image src={{ data: diagram.image.data, format: diagram.image.format }} style={{ width, height }} />
      {pins.filter(p => p.assetType === '2d' && p.view === diagram.view && p.modelAssetId === diagram.modelAssetId).map(p => (
        <View key={p.number} style={{ position: 'absolute', left: (p.x / 100) * width - badge / 2, top: (p.y / 100) * height - badge / 2, width: badge, height: badge, borderRadius: badge / 2, backgroundColor: C.risk, borderWidth: 1.2, borderColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.white, fontSize: badge * 0.58, fontWeight: 700 }}>{String(p.number)}</Text>
        </View>
      ))}
    </View>
  )
}

function PinBadge({ number, size = 16 }: { number: number; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.risk, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: C.white, fontWeight: 800, fontSize: size / 2 }}>{String(number)}</Text>
    </View>
  )
}

/** Tread depth at each corner, laid around a car seen from above. */
function TireCar({ exterior, width = 170 }: { exterior: Record<string, any>; width?: number }) {
  const corner = (name: string, position: string) => {
    const tread = treadDepth(exterior, position)
    return (
      <View style={{ width: 44, alignItems: 'center' }}>
        <Text style={{ fontSize: 6.5, color: C.ink3 }}>{name}</Text>
        <Text style={{ fontSize: 11, fontWeight: 800, color: treadColor(tread) }}>{tread == null ? '—' : `${tread}/32"`}</Text>
        {tireNotes(exterior, position).length ? (
          <Text style={{ fontSize: 6.5, color: isFlat(exterior, position) ? C.risk : C.warn, fontWeight: 700 }}>{tireNotes(exterior, position).join(' · ')}</Text>
        ) : null}
      </View>
    )
  }
  const wheels: Array<[number, number, string]> = [[2, 12, 'tireFrontLeft'], [36, 12, 'tireFrontRight'], [2, 58, 'tireRearLeft'], [36, 58, 'tireRearRight']]
  return (
    <View style={{ width, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ gap: 16 }}>{corner('LF', 'tireFrontLeft')}{corner('LR', 'tireRearLeft')}</View>
      <Svg width={44} height={70} viewBox="0 0 44 84">
        <Rect x={8} y={2} width={28} height={80} rx={11} fill={C.fill} stroke={C.line} strokeWidth={1} />
        <Rect x={12} y={18} width={20} height={14} rx={3} fill={C.white} stroke={C.line} strokeWidth={0.8} />
        {wheels.map(([x, y, position]) => {
          const tread = treadDepth(exterior, position)
          return <Rect key={position} x={x} y={y} width={6} height={14} rx={2} fill={isFlat(exterior, position) ? C.risk : tread == null ? C.line : treadColor(tread)} />
        })}
      </Svg>
      <View style={{ gap: 16 }}>{corner('RF', 'tireFrontRight')}{corner('RR', 'tireRearRight')}</View>
    </View>
  )
}

// ── Document ───────────────────────────────────────────────────────────────

export default function ReportDocument({ model, images, diagrams, branding, qr }: ReportDocumentProps) {
  const { sections, tests, assist } = model
  const allTests = TEST_GROUPS.flatMap(g => g.items.map(([key, name]) => ({ key, name, result: tests[key] ?? 'nt' })))
  const passed = allTests.filter(t => t.result === 'pass').length
  const failed = allTests.filter(t => t.result === 'fail').length
  const headerColor = branding?.headerColor ?? C.ink
  const has = (section: Record<string, any>, keys: string[]) =>
    keys.some(k => { const v = section?.[k]; return v !== undefined && v !== null && v !== '' })

  const findings = needsAttention(model)
  const ok = checkedOk(model)
  const vinValid = vinCheckDigitValid(model.vin)
  const specLine = [model.bodyClass, model.engine, model.driveType, model.fuel].filter(Boolean).join('  ·  ')
  const breakdown: Array<[string, number, number]> = [
    ['Exterior', model.score.breakdown.exterior, 25], ['Interior', model.score.breakdown.interior, 20],
    ['Mechanical', model.score.breakdown.mechanical, 30], ['Documents', model.score.breakdown.documentation, 15],
    ['Mileage', model.score.breakdown.mileage, 10],
  ]

  // Condition: each column prints only what was recorded.
  const exteriorKeys = ['overallCondition', 'overallExterior', 'paintCondition', 'glassCondition']
  const interiorKeys = ['overallCondition', 'overallInterior', 'frontSeats', 'rearSeats', 'dashboard', 'headliner', 'carpetFloor', 'carpet', 'steeringWheel', 'interiorOdor']
  const underHoodKeys = ['oilLevel', 'coolantLevel', 'brakeFluid', 'transmissionFluid', 'batteryCondition', 'beltCondition', 'hoseCondition']
  const hasTires = TIRE_POSITIONS.some(([, position]) => treadDepth(sections.exterior, position) !== null || isFlat(sections.exterior, position))
  const hasExterior = has(sections.exterior, exteriorKeys)
  const hasInterior = has(sections.interior, interiorKeys)
  const hasUnderHood = has(sections.engine, underHoodKeys)
  const hasTests = allTests.some(t => t.result !== 'nt')
  const hasCondition = hasExterior || hasTires || hasInterior || hasUnderHood || hasTests

  // Photos: numbered in print order; documents print with their section.
  const galleryPhotos = model.photos.filter(p => p.group !== 'documents')
  const documentPhotos = model.photos.filter(p => p.group === 'documents')
  const numberOf = new Map(galleryPhotos.map((p, i) => [p.src, i + 1]))
  const passengerSide = galleryPhotos.find(p => p.label === 'Passenger side')
  const front = galleryPhotos.find(p => p.label === 'Front')
  const heroPair = passengerSide && front ? [passengerSide, front] : []
  const gridPhotos = galleryPhotos.filter(p => !heroPair.includes(p))
  const gridWidth = columnWidth(PHOTO_BOXES.gallery.columns, PHOTO_BOXES.gallery.gap)
  const heroWidth = columnWidth(PHOTO_BOXES.heroPair.columns, PHOTO_BOXES.heroPair.gap)

  const plateState = sections.documentation.licensePlateState ?? sections.documentation.plateState
  const hasDocuments =
    has(sections.documentation, ['registrationCurrent', 'insurancePresent', 'licensePlate']) ||
    has(sections.bol, ['bolPresent', 'bolProvided', 'bolNotes']) ||
    has(sections.keys, ['mechanicalKeys', 'keyFobs']) ||
    documentPhotos.length > 0
  const documentNotes = sections.documentation.documentationNotes ?? sections.documentation.docNotes
  const glassPane = sections.exterior.glassDamagedPane ?? sections.exterior.glassDamageLocation
  // Documents sit in one row beside the details, narrowing when there are many.
  const documentRowWidth = CONTENT_WIDTH - 200 - 16
  const documentWidth = Math.min(PHOTO_BOXES.document.width, (documentRowWidth - 7 * (documentPhotos.length - 1)) / Math.max(1, documentPhotos.length))

  const recommendations = assist.recommendations ?? []
  const fallbackRecommendations = recommendations.length ? [] : model.score.recommendations ?? []
  const recall = assist.recalls?.[0]
  // The AI line in the small print appears only when AI wrote something here;
  // rule-based recommendations and NHTSA recalls are not AI-written.
  const hasAssist = assist.aiWritten ?? !!(assist.summary || assist.verdict?.length || recommendations.length || assist.photoCheck)

  // Page 1 is built around the lead photo. Without one it is too short to stand
  // alone, so the evidence follows straight on rather than leaving it half empty.
  const evidenceStartsPage = !!model.leadPhotoSrc

  const diagramFor = (pin: ReportModel['pins'][number]) =>
    pin.assetType === '2d' ? diagrams.find(d => d.view === pin.view && d.modelAssetId === pin.modelAssetId) : undefined

  const Header = () => (
    <View fixed style={{ position: 'absolute', top: 22, left: PAGE.margin, right: PAGE.margin, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 7, borderBottomWidth: 1.5, borderBottomColor: headerColor }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {branding?.logo ? <Image src={{ data: branding.logo.data, format: branding.logo.format }} style={{ height: 14, maxWidth: 60, objectFit: 'contain' }} /> : null}
        <Text style={{ fontWeight: 800, fontSize: 9 }}>{model.companyName ?? 'Condition IQ'}</Text>
        <Text style={{ color: C.ink3, fontSize: 7.5 }}>·  Vehicle condition report</Text>
      </View>
      <Text style={{ fontSize: 7.5, color: C.ink2 }}>{`${model.title}  ·  ${model.vin}`}</Text>
    </View>
  )

  const Footer = () => (
    <View fixed style={{ position: 'absolute', bottom: 20, left: PAGE.margin, right: PAGE.margin, flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 7, color: C.ink3, lineHeight: 1.35 }}>{`Report ${model.reportNo}  ·  ${reportVerifyText(model.reportNo)}  ·  Powered by Condition IQ`}</Text>
      <Text style={{ fontSize: 7, color: C.ink3 }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )

  const pageStyle = { fontFamily: 'Inter', fontSize: 8.5, color: C.ink, paddingTop: 58, paddingBottom: 46, paddingHorizontal: PAGE.margin }

  // ── Evidence sections, in print order ────────────────────────────────────
  const damageSection = model.pins.length > 0 && (
    <>
      {model.pins.length <= DAMAGE_CARD_LIMIT ? (
        model.pins.map((pin, index) => {
          const diagram = diagramFor(pin)
          const card = (
            <View style={{ ...S.card, flexDirection: 'row', gap: 14, alignItems: 'center', marginBottom: 8 }}>
              <Photo img={pin.photoUrl ? images[pin.photoUrl] : null} kind="damage" />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <PinBadge number={pin.number} />
                  <Text style={{ fontSize: 13, fontWeight: 800 }}>{pin.area ?? 'Area not recorded'}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 22, marginTop: 8 }}>
                  {[['Type', pin.type ?? '—'], ['Severity', pin.severity ?? '—'], ...(pin.aiagCode ? [['AIAG', pin.aiagCode]] : []), ['Found by', 'Inspector']].map(([k, v]) => (
                    <View key={k}>
                      <Text style={S.label}>{k}</Text>
                      <Text style={{ fontWeight: 600, marginTop: 2 }}>{v}</Text>
                    </View>
                  ))}
                </View>
                {!pin.photoUrl ? <Text style={{ ...S.k, marginTop: 8 }}>No close-up photo taken</Text> : null}
              </View>
              {diagram ? <Diagram diagram={diagram} pins={[pin]} width={84} /> : null}
            </View>
          )
          return index === 0 ? (
            <View key={pin.number} wrap={false}>
              <SectionTitle title="Damage" count={model.pins.length} meta="AIAG area · type · severity" first={evidenceStartsPage} />
              {card}
            </View>
          ) : (
            <View key={pin.number} wrap={false}>{card}</View>
          )
        })
      ) : (
        <>
          <View wrap={false}>
            <SectionTitle title="Damage" count={model.pins.length} meta="AIAG area · type · severity" first={evidenceStartsPage} />
            {diagrams.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                {diagrams.slice(0, 4).map(d => (
                  <View key={`${d.modelAssetId}:${d.view}`} style={{ alignItems: 'center' }}>
                    <Diagram diagram={d} pins={model.pins} width={104} />
                    <Text style={{ fontSize: 6.5, color: C.ink3, marginTop: 2, textTransform: 'uppercase' }}>{`${d.view} view`}</Text>
                  </View>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.ink }}>
              {([['#', 22], ['Area', 115], ['Damage', 160], ['Severity', 95], ['AIAG', 55], ['Close-up', 60]] as Array<[string, number]>).map(([t, w]) => (
                <Text key={t} style={{ width: w, fontSize: 7, fontWeight: 600, color: C.ink3 }}>{t}</Text>
              ))}
            </View>
          </View>
          {model.pins.map(pin => (
            <View key={pin.number} wrap={false} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
              <View style={{ width: 22 }}><PinBadge number={pin.number} size={13} /></View>
              <Text style={{ width: 115, paddingRight: 8, fontWeight: 600 }}>{pin.area ?? '—'}</Text>
              <Text style={{ width: 160, paddingRight: 8 }}>{pin.type ?? '—'}</Text>
              <Text style={{ width: 95, paddingRight: 8 }}>{pin.severity ?? '—'}</Text>
              <Text style={{ width: 55, color: C.ink2 }}>{pin.aiagCode ?? '—'}</Text>
              {pin.photoUrl ? <Photo img={images[pin.photoUrl]} kind="damageThumb" /> : <Text style={{ color: C.ink3 }}>—</Text>}
            </View>
          ))}
        </>
      )}
      {sections.exterior.exteriorNotes ? <Text style={S.note}>{`Exterior notes: ${sections.exterior.exteriorNotes}`}</Text> : null}
    </>
  )

  const conditionSection = hasCondition && (
    <View wrap={false}>
      <SectionTitle title="Condition" first={evidenceStartsPage && !damageSection} />
      <View style={{ flexDirection: 'row', gap: 20 }}>
        <View style={{ flex: 1 }}>
          {hasExterior && (
            <>
              <Text style={{ ...S.label, marginBottom: 2 }}>Exterior</Text>
              {[['Overall', sections.exterior.overallCondition ?? sections.exterior.overallExterior], ['Paint', sections.exterior.paintCondition]]
                .map(([k, v]) => <Row key={k as string} k={k as string} v={label(v)} color={conditionColor(v)} />)}
              <Row k="Glass" v={glassPane && sections.exterior.glassCondition !== 'good' ? `${label(sections.exterior.glassCondition)} · ${glassPane}` : label(sections.exterior.glassCondition)} color={conditionColor(sections.exterior.glassCondition)} />
            </>
          )}
          {hasTires && (
            <>
              <Text style={{ ...S.label, marginTop: hasExterior ? 7 : 0, marginBottom: 4 }}>Tires</Text>
              <View style={{ alignItems: 'center' }}><TireCar exterior={sections.exterior} /></View>
            </>
          )}
          {hasUnderHood && (
            <>
              <Text style={{ ...S.label, marginTop: hasExterior || hasTires ? 7 : 0, marginBottom: 2 }}>Under hood</Text>
              {[['Oil', 'oilLevel'], ['Coolant', 'coolantLevel'], ['Brake fluid', 'brakeFluid'], ['Transmission fluid', 'transmissionFluid'], ['Battery', 'batteryCondition'], ['Belts', 'beltCondition'], ['Hoses', 'hoseCondition']]
                .map(([k, key]) => <Row key={k} k={k} v={label(sections.engine[key])} color={conditionColor(sections.engine[key])} />)}
              {sections.engine.checkEngineLight !== undefined ? (
                <Row k="Check engine light" v={sections.engine.checkEngineLight ? 'On' : 'Off'} color={sections.engine.checkEngineLight ? C.risk : C.ok} />
              ) : null}
              {sections.engine.visibleLeaks !== undefined ? (
                <Row k="Leaks" v={sections.engine.visibleLeaks ? (sections.engine.leakDescription ? `Yes · ${sections.engine.leakDescription}` : 'Yes') : 'None seen'} color={sections.engine.visibleLeaks ? C.risk : C.ok} />
              ) : null}
              {sections.engine.unusualNoise !== undefined ? (
                <Row k="Engine noise" v={sections.engine.unusualNoise ? (sections.engine.noiseType ? label(sections.engine.noiseType) : 'Unusual') : 'Normal'} color={sections.engine.unusualNoise ? C.risk : C.ok} />
              ) : null}
              {sections.engine.engineNotes ? <Text style={S.note}>{`Notes: ${sections.engine.engineNotes}`}</Text> : null}
            </>
          )}
        </View>

        <View style={{ flex: 1 }}>
          {hasInterior && (
            <>
              <Text style={{ ...S.label, marginBottom: 2 }}>Interior</Text>
              {[['Overall', sections.interior.overallCondition ?? sections.interior.overallInterior], ['Front seats', sections.interior.frontSeats], ['Rear seats', sections.interior.rearSeats], ['Dashboard', sections.interior.dashboard], ['Headliner', sections.interior.headliner], ['Carpet / floor', sections.interior.carpetFloor ?? sections.interior.carpet], ['Steering wheel', sections.interior.steeringWheel]]
                .map(([k, v]) => <Row key={k as string} k={k as string} v={label(v)} color={conditionColor(v)} />)}
              <Row k="Odor" v={sections.interior.interiorOdor ? `Present${sections.interior.odorType ? ` · ${label(sections.interior.odorType)}` : ''}` : 'None'} color={sections.interior.interiorOdor ? C.warn : C.ok} />
              {sections.interior.interiorNotes ? <Text style={S.note}>{`Notes: ${sections.interior.interiorNotes}`}</Text> : null}
            </>
          )}
          {hasTests && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: hasInterior ? 8 : 0 }}>
                <Text style={S.label}>Function tests</Text>
                <Text style={{ fontSize: 15, fontWeight: 800, color: failed > 0 ? C.risk : C.ok }}>{`${passed}/${allTests.length}`}</Text>
                <Text style={{ fontSize: 7.5, color: C.ink3 }}>passed</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
                {allTests.map(t => (
                  <Text key={t.key} style={{ width: '50%', paddingVertical: 1.8, color: t.result === 'fail' ? C.risk : C.ink2, fontWeight: t.result === 'fail' ? 700 : 400 }}>
                    {`${t.result === 'pass' ? '✓' : t.result === 'fail' ? '✕' : '–'}  ${t.name}`}
                  </Text>
                ))}
              </View>
              {sections.function.functionNotes ? <Text style={S.note}>{`Notes: ${sections.function.functionNotes}`}</Text> : null}
              {model.engineStartVideoUrl ? (
                <Link src={model.engineStartVideoUrl} style={{ ...S.note, color: C.accent, textDecoration: 'none' }}>Engine start video recorded · open video</Link>
              ) : null}
            </>
          )}
        </View>
      </View>
    </View>
  )

  const photosSection = galleryPhotos.length > 0 && (
    <>
      <View wrap={false}>
        <SectionTitle title="Photos" count={galleryPhotos.length} first={evidenceStartsPage && !damageSection && !conditionSection} />
        {assist.photoCheck ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 0.75, borderColor: C.checkBorder, backgroundColor: C.checkBg, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 9 }}>
            <Icon level="warn" />
            <Text style={{ flex: 1 }}>{`Photo check: ${assist.photoCheck}`}</Text>
          </View>
        ) : null}
        {heroPair.length ? (
          <View style={{ flexDirection: 'row', gap: PHOTO_BOXES.heroPair.gap, marginBottom: 8 }}>
            {heroPair.map(p => <CaptionedPhoto key={p.src} photo={p} number={numberOf.get(p.src)!} images={images} kind="heroPair" width={heroWidth} />)}
          </View>
        ) : null}
        {!heroPair.length ? (
          <View style={{ flexDirection: 'row', gap: PHOTO_BOXES.gallery.gap }}>
            {gridPhotos.slice(0, PHOTO_BOXES.gallery.columns).map(p => <CaptionedPhoto key={p.src} photo={p} number={numberOf.get(p.src)!} images={images} kind="gallery" width={gridWidth} />)}
          </View>
        ) : null}
      </View>
      {(heroPair.length ? gridPhotos : gridPhotos.slice(PHOTO_BOXES.gallery.columns)).length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: PHOTO_BOXES.gallery.gap, marginTop: heroPair.length ? 0 : PHOTO_BOXES.gallery.gap }}>
          {(heroPair.length ? gridPhotos : gridPhotos.slice(PHOTO_BOXES.gallery.columns)).map(p => (
            <View key={p.src} wrap={false} style={{ marginBottom: 3 }}>
              <CaptionedPhoto photo={p} number={numberOf.get(p.src)!} images={images} kind="gallery" width={gridWidth} />
            </View>
          ))}
        </View>
      )}
    </>
  )

  const documentsSection = hasDocuments && (
    <View wrap={false}>
      <SectionTitle title="Documents and keys" first={evidenceStartsPage && !damageSection && !conditionSection && !photosSection} />
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <View style={{ width: 200 }}>
          <Row k="Registration" v={sections.documentation.registrationCurrent ? 'Current' : 'Not current'} color={sections.documentation.registrationCurrent ? C.ok : C.risk} />
          <Row k="Insurance" v={sections.documentation.insurancePresent ? 'Present' : 'Not present'} color={sections.documentation.insurancePresent ? C.ok : C.risk} />
          <Row k="Bill of lading" v={(sections.bol.bolPresent ?? sections.bol.bolProvided) ? 'Present' : 'Not present'} />
          {sections.documentation.licensePlate ? <Row k="License plate" v={`${sections.documentation.licensePlate}${plateState ? ` · ${plateState}` : ''}`} /> : null}
          <Row k="Keys" v={`${plural(Number(sections.keys.mechanicalKeys ?? 0), 'key')} · ${plural(Number(sections.keys.keyFobs ?? 0), 'fob')}`} />
          {sections.bol.bolNotes ? <Text style={{ ...S.k, marginTop: 4 }}>{`BOL notes: ${sections.bol.bolNotes}`}</Text> : null}
          {documentNotes ? <Text style={{ ...S.k, marginTop: 2 }}>{`Notes: ${documentNotes}`}</Text> : null}
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: 7 }}>
          {documentPhotos.map(p => (
            <View key={p.src} style={{ width: documentWidth }}>
              <Photo img={images[p.src]} kind="document" width={documentWidth} />
              <Text style={{ fontSize: 6.5, color: C.ink3, marginTop: 2 }}>{p.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )

  const nextStepsSection = (recommendations.length > 0 || fallbackRecommendations.length > 0 || recall || assist.complaints) && (
    <>
      <View wrap={false}>
        <SectionTitle title="What to do next" meta={recommendations.length ? 'By urgency · each with its source' : undefined} />
        {recommendations.length > 0 ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['Before road use', 'Soon', 'Reconditioning'] as RecommendationUrgency[])
              .filter(u => recommendations.some(r => r.urgency === u))
              .map(u => (
                <View key={u} style={{ ...S.card, flex: 1, borderTopWidth: 3, borderTopColor: URGENCY[u], padding: 9 }}>
                  <Text style={{ fontWeight: 800, fontSize: 9, color: URGENCY[u], marginBottom: 4 }}>{u}</Text>
                  {recommendations.filter(r => r.urgency === u).map((r, i) => (
                    <View key={i} style={{ marginBottom: 6 }}>
                      <Text style={{ fontWeight: 600 }}>{r.action}</Text>
                      <Text style={{ fontSize: 6.8, color: C.ink3, marginTop: 1.5 }}>{r.source}</Text>
                    </View>
                  ))}
                </View>
              ))}
          </View>
        ) : fallbackRecommendations.length > 0 ? (
          <View style={S.card}>
            {fallbackRecommendations.map((rec, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 6, paddingVertical: 2.8, borderBottomWidth: i === fallbackRecommendations.length - 1 ? 0 : 0.5, borderBottomColor: C.line }}>
                <Text style={{ color: C.ink3, width: 10 }}>{`${i + 1}.`}</Text>
                <Text style={{ flex: 1 }}>{rec}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {(recall || assist.complaints) && (
        <View wrap={false} style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
          {recall ? (
            <View style={{ flex: 1, backgroundColor: C.midnight, borderRadius: 7, padding: 11 }}>
              <Text style={{ ...S.label, color: C.amber }}>{assist.recalls!.length > 1 ? `Open recalls · NHTSA · ${assist.recalls!.length}` : 'Open recall · NHTSA'}</Text>
              <Text style={{ color: C.white, fontWeight: 700, fontSize: 9.5, marginTop: 4, marginBottom: 4 }}>{`${recall.id} · ${recall.component}`}</Text>
              <Text style={{ color: C.recallText, marginBottom: 5 }}>{recall.summary}</Text>
              <Text style={{ color: C.recallMuted, fontSize: 6.8 }}>
                {`${recall.reportedOn ? `Issued ${recall.reportedOn}. ` : ''}Recall lists cover the model, not whether this VIN was repaired.`}
              </Text>
            </View>
          ) : null}
          {assist.complaints ? (
            <View style={{ ...S.card, width: recall ? 150 : undefined, flex: recall ? undefined : 1 }}>
              <Text style={S.label}>Owner complaints</Text>
              <Text style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{String(assist.complaints.count)}</Text>
              <Text style={{ color: C.ink2, fontSize: 7.5 }}>
                {`for the ${model.name} on NHTSA.${assist.complaints.topAreas.length ? ` Top: ${assist.complaints.topAreas.join(', ')}.` : ''}`}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </>
  )

  // Pages 2+: the evidence, then what to do next and the certification.
  const evidence = (
    <>
        {damageSection}
        {conditionSection}
        {photosSection}
        {documentsSection}
        {nextStepsSection}

        {/* The disclosure travels with the certification, never alone on a page. */}
        <View wrap={false} style={{ marginTop: 16 }}>
        <View style={{ ...S.card, borderColor: C.summaryBorder, flexDirection: 'row', gap: 16, padding: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: 700, fontSize: 10 }}>Inspector certification</Text>
            <Text style={{ color: C.ink2, marginTop: 3 }}>
              I certify this inspection was performed as recorded and that the conditions noted reflect the vehicle at the time of inspection.
            </Text>
            <View style={{ flexDirection: 'row', gap: 22, marginTop: 12, alignItems: 'flex-end' }}>
              <View style={{ width: 180 }}>
                {model.signatureSrc && images[model.signatureSrc]
                  ? <Photo img={images[model.signatureSrc]} kind="signature" style={{ height: 40, backgroundColor: C.white, borderBottomWidth: 0.75, borderBottomColor: C.ink }} />
                  : <View style={{ height: 26, borderBottomWidth: 0.75, borderBottomColor: C.ink }} />}
                <Text style={{ ...S.k, marginTop: 3 }}>{`${model.inspectorName ?? '—'}  ·  signature`}</Text>
              </View>
              {model.startedAt ? (
                <View>
                  <Text style={S.k}>Started</Text>
                  <Text style={{ fontWeight: 600 }}>{fmtTime(model.startedAt)}</Text>
                </View>
              ) : null}
              <View>
                <Text style={S.k}>Signed</Text>
                <Text style={{ fontWeight: 600 }}>{`${fmtDate(model.signedAt ?? model.date)}, ${fmtTime(model.signedAt ?? model.date)}`}</Text>
              </View>
              <View>
                <Text style={S.k}>Report ID</Text>
                <Text style={{ fontSize: 7.5 }}>{model.reportNo}</Text>
              </View>
            </View>
            {model.signedFrom ? (
              <Text style={{ ...S.k, marginTop: 6 }}>{`Signed on site at ${model.signedFrom.lat.toFixed(5)}, ${model.signedFrom.lng.toFixed(5)}`}</Text>
            ) : null}
          </View>
          {qr ? (
            <View style={{ width: 60, alignItems: 'center' }}>
              <Image src={{ data: qr.data, format: qr.format }} style={{ width: 60, height: 60 }} />
              <Text style={{ fontSize: 5.5, color: C.ink3, marginTop: 2 }}>Scan to verify</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: C.ink3, fontSize: 6.6, marginTop: 10 }}>
          {hasAssist ? `${DISCLOSURE} ${AI_DISCLOSURE}` : DISCLOSURE}
        </Text>
        </View>
    </>
  )

  return (
    <Document title={`Condition report ${model.vin}`} author={model.companyName ?? 'Condition IQ'}>
      {/* ── Page 1 · the summary ─────────────────────────────────────────── */}
      <Page size={PAGE.size} style={pageStyle}>
        <Header />
        <Footer />

        <View style={{ flexDirection: 'row', gap: 20, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={S.eyebrow}>{`Condition report  ·  ${model.inspectionType}`}</Text>
            <Text style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, marginTop: 4, marginBottom: 2, lineHeight: 1.2 }}>{model.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <Text style={{ fontSize: 9.5, color: C.ink2, letterSpacing: 0.4 }}>{model.vin}</Text>
              {vinValid ? (
                <Text style={{ color: C.ok, backgroundColor: C.okBg, borderRadius: 7, paddingVertical: 1.5, paddingHorizontal: 5, fontSize: 6.5, fontWeight: 700 }}>
                  {model.decodedByNhtsa ? '✓ Check digit valid · decoded by NHTSA' : '✓ Check digit valid'}
                </Text>
              ) : null}
            </View>
            {specLine ? <Value text={specLine} color={C.ink3} weight={400} style={{ fontSize: 7.5, marginTop: 4 }} /> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6, marginTop: 10 }}>
              {([
                // E · Whether the typed odometer was checked against the dashboard photo.
                ['Odometer', model.odometer && !isNaN(Number(model.odometer)) ? `${Number(model.odometer).toLocaleString('en-US')} mi` : model.odometer ?? '—',
                  model.gauges?.odometerStatus === 'verified' ? 'Matches dashboard photo'
                    : model.gauges?.odometerStatus === 'mismatch' ? `Photo reads ${model.gauges.odometerRead?.toLocaleString('en-US')} ${model.gauges.unit ?? 'mi'}`
                    : model.odometer ? 'Not verified from photos' : null],
                ['Inspected', `${fmtDate(model.date)}, ${fmtTime(model.date)}`, null],
                ['Location', model.location ?? '—', null],
                ['Inspector', model.inspectorName ?? '—', null],
                ...(model.assetId ? [['Asset', model.assetId, null]] : []),
              ] as Array<[string, string, string | null]>).map(([k, v, sub]) => (
                <View key={k}>
                  <Text style={S.k}>{k}</Text>
                  <Text style={{ fontWeight: 600, marginTop: 1 }}>{v}</Text>
                  {sub ? <Text style={{ fontSize: 6.5, marginTop: 1, color: model.gauges?.odometerStatus === 'mismatch' && k === 'Odometer' ? C.warn : C.ink3 }}>{sub}</Text> : null}
                </View>
              ))}
            </View>
          </View>
          <View style={{ width: 196, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <ScoreRing score={model.score.score} grade={model.score.grade} />
            <View style={{ flex: 1, gap: 3.5 }}>
              {breakdown.map(([name, value, max]) => (
                <View key={name}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 6.5, color: C.ink2 }}>{name}</Text>
                    <Text style={{ fontSize: 6.5, fontWeight: 700 }}>{`${value}/${max}`}</Text>
                  </View>
                  <View style={{ height: 3, backgroundColor: C.fill, borderRadius: 1.5, marginTop: 1 }}>
                    <View style={{ height: 3, width: Math.max(0, Math.min(1, value / max)) * 112, backgroundColor: barColor(value / max), borderRadius: 1.5 }} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {assist.summary || assist.verdict?.length ? (
          <View style={{ ...S.card, borderColor: C.summaryBorder, padding: 12, marginTop: 14 }}>
            {(assist.verdict ?? []).map((line, i, all) => (
              <Text key={i} style={{ fontWeight: 700, fontSize: 10, marginBottom: i === all.length - 1 ? 5 : 1 }}>{line}</Text>
            ))}
            {assist.summary ? <Text style={{ color: C.ink2 }}>{assist.summary}</Text> : null}
          </View>
        ) : null}

        {model.leadPhotoSrc ? <Photo img={images[model.leadPhotoSrc]} kind="lead" style={{ marginTop: 16 }} /> : null}

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
          <View style={{ ...S.card, flex: 1.25 }}>
            <Text style={{ ...S.label, marginBottom: 5 }}>{findings.length ? `Needs attention  ·  ${findings.length}` : 'Needs attention'}</Text>
            {findings.length ? findings.map((f, i) => (
              <View key={i} wrap={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2.8, borderBottomWidth: i === findings.length - 1 ? 0 : 0.5, borderBottomColor: C.line }}>
                <Icon level={f.level} />
                <Text style={{ flex: 1, fontWeight: 500 }}>{f.text}</Text>
                <Text style={{ color: C.ink3, fontSize: 7 }}>{f.section}</Text>
              </View>
            )) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2.8 }}>
                <Icon level="ok" />
                <Text style={{ flex: 1 }}>No issues recorded</Text>
              </View>
            )}
          </View>
          {ok.length > 0 && (
            <View style={{ ...S.card, flex: 1 }}>
              <Text style={{ ...S.label, marginBottom: 5 }}>Checked and OK</Text>
              {ok.map((t, i) => (
                <View key={i} wrap={false} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2.8, borderBottomWidth: i === ok.length - 1 ? 0 : 0.5, borderBottomColor: C.line }}>
                  <Icon level="ok" />
                  <Text style={{ flex: 1 }}>{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      {evidenceStartsPage ? null : evidence}
      </Page>

      {evidenceStartsPage ? (
        <Page size={PAGE.size} style={pageStyle}>
          <Header />
          <Footer />
          {evidence}
        </Page>
      ) : null}
    </Document>
  )
}

// Kept for the render test, which reports what it measured against these.
export const REPORT_TARGETS = { maxPages: 6, maxBlankPercent: 45, maxFileSizeKb: 1500 }

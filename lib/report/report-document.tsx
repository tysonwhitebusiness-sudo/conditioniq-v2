import React from 'react'
import { Document, Page, View, Text, Image, Svg, Circle, Rect } from '@react-pdf/renderer'
import type { ReportModel, ReportPhoto } from './model'
import type { ReportImage } from './photos'
import { PAGE, CONTENT_WIDTH, photoBox, columnWidth, PHOTO_BOXES } from './layout'

// R1 and R2 · the report as it is drawn today, on the server.
//
// Section order is unchanged from the old report; what changed is underneath:
// Letter paper, embedded fonts, a header and footer that repeat on every page
// with real page numbers, and photos in fixed boxes rather than boxes sized
// from a photo whose shape the old renderer could not read.
//
// Two react-pdf traps, both caught by the render test (scripts/report-test.mjs):
//   · a line break inside one text block is drawn but not measured
//   · a percentage height inside a row corrupts text measurement for the page
// Neither appears in this file; don't reintroduce them.

const C = {
  ink: '#0D1B2A', ink2: '#3D4F61', ink3: '#6B7C8C', line: '#D9E1E8', fill: '#F2F5F8',
  white: '#FFFFFF', accent: '#0077A0', cyan: '#00B4D8', amber: '#F4A62A',
  ok: '#1B7A4E', okBg: '#E4F4EC', warn: '#A86400', warnBg: '#FCF1DC', risk: '#C0362C', riskBg: '#FBE9E7',
  cardBorder: '#DCE7EE',
}

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
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
const fmtTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
const severityColor = (code: number | null): string =>
  code == null ? C.ink3 : code <= 2 ? '#D08A00' : code <= 4 ? '#E0671B' : C.risk

export const TEST_GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  { title: 'Starting & drivetrain', items: [['engineStarts', 'Engine start'], ['shiftsToD', 'Shift to drive'], ['shiftsToR', 'Shift to reverse'], ['parkingBrake', 'Parking brake']] },
  { title: 'Lights', items: [['headlights', 'Headlights'], ['taillights', 'Taillights'], ['turnSignals', 'Turn signals'], ['brakeLights', 'Brake lights'], ['hazardLights', 'Hazard lights']] },
  { title: 'Controls', items: [['horn', 'Horn'], ['wipers', 'Wipers'], ['washerFluid', 'Washer fluid'], ['ac', 'A/C'], ['heater', 'Heater'], ['radio', 'Radio']] },
  { title: 'Windows & locks', items: [['powerWindows', 'Power windows'], ['powerLocks', 'Power locks'], ['mirrors', 'Mirrors']] },
]

const TIRES: Array<[string, string]> = [['LF', 'tireFrontLeft'], ['RF', 'tireFrontRight'], ['LR', 'tireRearLeft'], ['RR', 'tireRearRight']]

function treadOf(exterior: Record<string, any>, key: string): number | null {
  const legacy: Record<string, string> = { tireFrontLeft: 'tireTreadFL', tireFrontRight: 'tireTreadFR', tireRearLeft: 'tireTreadRL', tireRearRight: 'tireTreadRR' }
  const raw = exterior?.[key]?.treadDepth ?? exterior?.[legacy[key]]
  const n = parseInt(String(raw ?? ''), 10)
  return isNaN(n) ? null : n
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

function CaptionedPhoto({ photo, images, kind, width }: { photo: ReportPhoto; images: ReportDocumentProps['images']; kind: keyof typeof PHOTO_BOXES; width?: number }) {
  const box = photoBox(kind, width)
  return (
    <View style={{ width: box.width }}>
      <View style={{ position: 'relative' }}>
        <Photo img={images[photo.src]} kind={kind} width={width} />
        <Text style={{ position: 'absolute', top: 3, left: 3, backgroundColor: 'rgba(13,27,42,0.78)', color: C.white, fontSize: 6.5, fontWeight: 700, paddingVertical: 1.5, paddingHorizontal: 4, borderRadius: 2 }}>
          {String(photo.number)}
        </Text>
      </View>
      <Text style={{ fontSize: 7, color: C.ink3, marginTop: 2.5 }}>{photo.label}</Text>
    </View>
  )
}

function SectionTitle({ title, meta, breakBefore }: { title: string; meta?: string; breakBefore?: boolean }) {
  return (
    <View break={breakBefore} minPresenceAhead={110} style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: breakBefore ? 0 : 20, marginBottom: 9, paddingBottom: 5, borderBottomWidth: 2, borderBottomColor: C.ink }}>
      <Text style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.3 }}>{title}</Text>
      {meta ? <Text style={{ fontSize: 7.5, color: C.ink3 }}>{meta}</Text> : null}
    </View>
  )
}

// A value with a decimal in it — "2.5L", "13.5 in" — is split at the point.
// Inter turns digit-period-digit into a ligature that drops the leading digit
// when the whole value is a single text run, which is why engines printed as
// ".5L". Two runs, no ligature.
function Value({ text, color, weight = 600 }: { text: string; color?: string; weight?: number }) {
  const at = text.search(/\d\.\d/)
  if (at === -1) return <Text style={{ fontWeight: weight, color: color ?? C.ink }}>{text}</Text>
  return (
    <Text style={{ fontWeight: weight, color: color ?? C.ink }}>
      {text.slice(0, at + 1)}
      <Text>{text.slice(at + 1)}</Text>
    </Text>
  )
}

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.6, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
      <Text style={{ color: C.ink2 }}>{k}</Text>
      <Value text={v} color={color} />
    </View>
  )
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const size = 74, stroke = 6
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
        <Text style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{String(score)}</Text>
        <Text style={{ fontSize: 8, fontWeight: 600, color: C.ink3, marginTop: 2 }}>{`Grade ${grade}`}</Text>
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
          <Text style={{ color: C.white, fontSize: badge * 0.55, fontWeight: 700 }}>{String(p.number)}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Document ───────────────────────────────────────────────────────────────

export default function ReportDocument({ model, images, diagrams, branding }: ReportDocumentProps) {
  const { sections, tests } = model
  const allTests = TEST_GROUPS.flatMap(g => g.items.map(([key, name]) => ({ key, name, result: tests[key] ?? 'nt' })))
  const passed = allTests.filter(t => t.result === 'pass').length
  const failed = allTests.filter(t => t.result === 'fail').length
  const headerColor = branding?.headerColor ?? C.ink
  const gallery = (group: ReportPhoto['group']) => model.photos.filter(p => p.group === group)
  const has = (section: Record<string, any>, keys: string[]) =>
    keys.some(k => { const v = section?.[k]; return v !== undefined && v !== null && v !== '' })
  const exteriorKeys = ['overallCondition', 'overallExterior', 'paintCondition', 'glassCondition']
  const interiorKeys = ['overallCondition', 'overallInterior', 'frontSeats', 'rearSeats', 'dashboard', 'headliner', 'carpetFloor', 'carpet', 'steeringWheel', 'interiorOdor']
  const underHoodKeys = ['oilLevel', 'coolantLevel', 'brakeFluid', 'transmissionFluid', 'batteryCondition', 'beltCondition', 'hoseCondition']
  const hasTires = TIRES.some(([, key]) => treadOf(sections.exterior, key) !== null)
  const hasExterior = has(sections.exterior, exteriorKeys) || hasTires
  const hasInterior = has(sections.interior, interiorKeys)
  const hasUnderHood = has(sections.engine, underHoodKeys)
  const hasTests = allTests.some(t => t.result !== 'nt')
  const hasCondition = hasExterior || hasInterior || hasUnderHood || hasTests
  const hasDocuments =
    has(sections.documentation, ['registrationCurrent', 'insurancePresent', 'licensePlate']) ||
    has(sections.bol, ['bolPresent', 'bolProvided', 'bolNotes']) ||
    has(sections.keys, ['mechanicalKeys', 'keyFobs']) ||
    gallery('documents').length > 0
  const vehicleRows = [
    ['Year', model.year], ['Make', model.make], ['Model', model.model], ['Trim', model.trim], ['Body', model.bodyClass],
    ['Engine', model.engine], ['Fuel', model.fuel], ['Drive', model.driveType],
    ['VIN', model.vin !== '—' ? model.vin : null], ['Odometer', model.odometer ? `${Number(model.odometer).toLocaleString()} mi` : null],
  ].filter(([, v]) => v) as Array<[string, string]>
  const galleryWidth = columnWidth(PHOTO_BOXES.gallery.columns, PHOTO_BOXES.gallery.gap)

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
      <Text style={{ fontSize: 7, color: C.ink3 }}>{`Report ${model.reportNo}  ·  Inspected ${fmtDate(model.date)}  ·  Powered by Condition IQ`}</Text>
      <Text style={{ fontSize: 7, color: C.ink3 }} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  )

  return (
    <Document title={`Condition report ${model.vin}`} author={model.companyName ?? 'Condition IQ'}>
      <Page size={PAGE.size} style={{ fontFamily: 'Inter', fontSize: 8.5, color: C.ink, paddingTop: 58, paddingBottom: 46, paddingHorizontal: PAGE.margin }}>
        <Header />
        <Footer />

        {/* Vehicle, score and the lead photo */}
        <View style={{ flexDirection: 'row', gap: 20, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, fontWeight: 600, letterSpacing: 1, color: C.accent, textTransform: 'uppercase' }}>
              {`Condition report  ·  ${model.inspectionType}`}
            </Text>
            <Text style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, marginTop: 4, marginBottom: 2 }}>{model.title}</Text>
            <Text style={{ fontSize: 9.5, color: C.ink2, letterSpacing: 0.4 }}>{model.vin}</Text>
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 10 }}>
              {[
                ['Odometer', model.odometer ? `${Number(model.odometer).toLocaleString()} mi` : '—'],
                ['Inspected', `${fmtDate(model.date)}, ${fmtTime(model.date)}`],
                ['Location', model.location ?? '—'],
                ['Inspector', model.inspectorName ?? '—'],
              ].map(([k, v]) => (
                <View key={k}>
                  <Text style={{ color: C.ink3, fontSize: 7.5 }}>{k}</Text>
                  <Text style={{ fontWeight: 600, marginTop: 1 }}>{v}</Text>
                </View>
              ))}
            </View>
          </View>
          <ScoreRing score={model.score.score} grade={model.score.grade} />
        </View>

        {model.leadPhotoSrc ? <Photo img={images[model.leadPhotoSrc]} kind="lead" style={{ marginTop: 14 }} /> : null}

        {model.score.recommendations?.length > 0 && (
          <View style={{ marginTop: 14 }}>
            <Text style={{ fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, color: C.ink3, textTransform: 'uppercase', marginBottom: 5 }}>Recommendations</Text>
            {model.score.recommendations.map((rec, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 6, paddingVertical: 2.6, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
                <Text style={{ color: C.ink3 }}>{`${i + 1}.`}</Text>
                <Text style={{ flex: 1 }}>{rec}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Specifications */}
        {vehicleRows.length > 0 && (
          <>
            <SectionTitle title="Vehicle" meta={model.assetId ? `Asset ${model.assetId}` : undefined} />
            <View style={{ flexDirection: 'row', gap: 20 }}>
              <View style={{ flex: 1 }}>
                {vehicleRows.slice(0, Math.ceil(vehicleRows.length / 2)).map(([k, v]) => <Row key={k} k={k} v={v} />)}
              </View>
              <View style={{ flex: 1 }}>
                {vehicleRows.slice(Math.ceil(vehicleRows.length / 2)).map(([k, v]) => <Row key={k} k={k} v={v} />)}
              </View>
            </View>
          </>
        )}

        {/* Damage */}
        {model.pins.length > 0 && (
          <>
            <View wrap={false}>
              <SectionTitle title="Damage" meta={`${model.pins.length} recorded  ·  AIAG area, type and severity`} />
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
            </View>
            <View>
              <View wrap={false}>
                <View style={{ flexDirection: 'row', paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.ink }}>
                  {[['#', 18], ['Area', 96], ['Damage', 150], ['Severity', 80], ['Close-up', 60]].map(([t, w]) => (
                    <Text key={t as string} style={{ width: w as number, fontSize: 7, fontWeight: 600, color: C.ink3 }}>{t as string}</Text>
                  ))}
                </View>
              </View>
              {model.pins.map(pin => (
                <View key={pin.number} wrap={false} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
                  <View style={{ width: 18 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: C.risk, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: C.white, fontSize: 7, fontWeight: 700 }}>{String(pin.number)}</Text>
                    </View>
                  </View>
                  <Text style={{ width: 96, fontWeight: 600 }}>{pin.area ?? '—'}</Text>
                  <Text style={{ width: 150 }}>{pin.type ?? '—'}</Text>
                  <View style={{ width: 80, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: severityColor(pin.severityCode) }} />
                    <Text>{pin.severity ?? '—'}</Text>
                  </View>
                  {pin.photoUrl ? <Photo img={images[pin.photoUrl]} kind="damageThumb" /> : <Text style={{ color: C.ink3 }}>—</Text>}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Condition */}
        {hasCondition && (
        <View wrap={false}>
        <SectionTitle title="Condition" />
        <View style={{ flexDirection: 'row', gap: 20 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, color: C.ink3, textTransform: 'uppercase', marginBottom: 2 }}>Exterior</Text>
            {[['Overall', sections.exterior.overallCondition ?? sections.exterior.overallExterior], ['Paint', sections.exterior.paintCondition], ['Glass', sections.exterior.glassCondition]]
              .map(([k, v]) => <Row key={k as string} k={k as string} v={label(v)} color={conditionColor(v)} />)}

            <Text style={{ fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, color: C.ink3, textTransform: 'uppercase', marginTop: 8, marginBottom: 4 }}>Tires · tread depth</Text>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {TIRES.map(([name, key]) => {
                const tread = treadOf(sections.exterior, key)
                const flat = sections.exterior?.[key]?.flat
                const color = tread == null ? C.ink3 : tread >= 6 ? C.ok : tread >= 3 ? C.warn : C.risk
                return (
                  <View key={name} style={{ flex: 1, borderWidth: 0.75, borderColor: C.line, borderRadius: 4, paddingVertical: 5, alignItems: 'center' }}>
                    <Text style={{ fontSize: 6.5, color: C.ink3 }}>{name}</Text>
                    <Text style={{ fontSize: 11, fontWeight: 800, color }}>{tread == null ? '—' : `${tread}/32"`}</Text>
                    {flat ? <Text style={{ fontSize: 6.5, color: C.risk, fontWeight: 700 }}>Flat</Text> : null}
                  </View>
                )
              })}
            </View>

            <Text style={{ fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, color: C.ink3, textTransform: 'uppercase', marginTop: 8, marginBottom: 2 }}>Under hood</Text>
            {[['Oil', 'oilLevel'], ['Coolant', 'coolantLevel'], ['Brake fluid', 'brakeFluid'], ['Transmission fluid', 'transmissionFluid'], ['Battery', 'batteryCondition'], ['Belts', 'beltCondition'], ['Hoses', 'hoseCondition']]
              .map(([k, key]) => <Row key={k} k={k} v={label(sections.engine[key])} color={conditionColor(sections.engine[key])} />)}
            {sections.engine.engineNotes ? <Text style={{ color: C.ink2, fontSize: 7.5, marginTop: 4 }}>{`Notes: ${sections.engine.engineNotes}`}</Text> : null}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, color: C.ink3, textTransform: 'uppercase', marginBottom: 2 }}>Interior</Text>
            {[['Overall', sections.interior.overallCondition ?? sections.interior.overallInterior], ['Front seats', sections.interior.frontSeats], ['Rear seats', sections.interior.rearSeats], ['Dashboard', sections.interior.dashboard], ['Headliner', sections.interior.headliner], ['Carpet / floor', sections.interior.carpetFloor ?? sections.interior.carpet], ['Steering wheel', sections.interior.steeringWheel]]
              .map(([k, v]) => <Row key={k as string} k={k as string} v={label(v)} color={conditionColor(v)} />)}
            <Row k="Odor" v={sections.interior.interiorOdor ? `Present${sections.interior.odorType ? ` · ${label(sections.interior.odorType)}` : ''}` : 'None'} color={sections.interior.interiorOdor ? C.warn : C.ok} />
            {sections.interior.interiorNotes ? <Text style={{ color: C.ink2, fontSize: 7.5, marginTop: 4 }}>{`Notes: ${sections.interior.interiorNotes}`}</Text> : null}

            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
              <Text style={{ fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, color: C.ink3, textTransform: 'uppercase' }}>Function tests</Text>
              <Text style={{ fontSize: 14, fontWeight: 800, color: failed > 0 ? C.risk : C.ok }}>{`${passed}/${allTests.length}`}</Text>
              <Text style={{ fontSize: 7.5, color: C.ink3 }}>passed</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
              {allTests.map(t => (
                <Text key={t.key} style={{ width: '50%', paddingVertical: 1.8, color: t.result === 'fail' ? C.risk : C.ink2 }}>
                  {`${t.result === 'pass' ? '✓' : t.result === 'fail' ? '✕' : '–'}  ${t.name}`}
                </Text>
              ))}
            </View>
            {sections.function.functionNotes ? <Text style={{ color: C.ink2, fontSize: 7.5, marginTop: 4 }}>{`Notes: ${sections.function.functionNotes}`}</Text> : null}
          </View>
        </View>
        </View>
        )}

        {/* Photos */}
        {model.photos.length > 0 && (
          <>
            {(['exterior', 'interior', 'engine'] as const).filter(g => gallery(g).length > 0).map((group, groupIndex) => {
              const photos = gallery(group)
              if (photos.length === 0) return null
              const heading = group === 'exterior' ? 'Exterior' : group === 'interior' ? 'Interior' : 'Under hood'
              return (
                <View key={group} style={{ marginBottom: 8 }}>
                  <View wrap={false}>
                    {groupIndex === 0 ? <SectionTitle title="Photos" meta={`${model.photos.length} photos · numbered for reference`} /> : null}
                    <Text style={{ fontSize: 6.8, fontWeight: 700, letterSpacing: 0.9, color: C.ink3, textTransform: 'uppercase', marginBottom: 5 }}>{heading}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: PHOTO_BOXES.gallery.gap }}>
                      {photos.slice(0, PHOTO_BOXES.gallery.columns).map(p => <CaptionedPhoto key={p.number} photo={p} images={images} kind="gallery" width={galleryWidth} />)}
                    </View>
                  </View>
                  {photos.length > PHOTO_BOXES.gallery.columns && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: PHOTO_BOXES.gallery.gap, marginTop: PHOTO_BOXES.gallery.gap }}>
                      {photos.slice(PHOTO_BOXES.gallery.columns).map(p => (
                        <View key={p.number} wrap={false}><CaptionedPhoto photo={p} images={images} kind="gallery" width={galleryWidth} /></View>
                      ))}
                    </View>
                  )}
                </View>
              )
            })}
          </>
        )}

        {/* Documents and keys */}
        {hasDocuments && (
        <View wrap={false}>
        <SectionTitle title="Documents and keys" />
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ width: 200 }}>
            <Row k="Registration" v={sections.documentation.registrationCurrent ? 'Current' : 'Not current'} color={sections.documentation.registrationCurrent ? C.ok : C.risk} />
            <Row k="Insurance" v={sections.documentation.insurancePresent ? 'Present' : 'Not present'} color={sections.documentation.insurancePresent ? C.ok : C.risk} />
            <Row k="Bill of lading" v={(sections.bol.bolPresent ?? sections.bol.bolProvided) ? 'Present' : 'Not present'} />
            {sections.documentation.licensePlate ? (
              <Row k="License plate" v={`${sections.documentation.licensePlate}${sections.documentation.licensePlateState || sections.documentation.plateState ? ` · ${sections.documentation.licensePlateState ?? sections.documentation.plateState}` : ''}`} />
            ) : null}
            <Row k="Keys" v={`${sections.keys.mechanicalKeys ?? 0} keys · ${sections.keys.keyFobs ?? 0} fobs`} />
            {sections.bol.bolNotes ? <Text style={{ color: C.ink3, fontSize: 7.5, marginTop: 4 }}>{`BOL notes: ${sections.bol.bolNotes}`}</Text> : null}
            {sections.documentation.documentationNotes ?? sections.documentation.docNotes ? (
              <Text style={{ color: C.ink3, fontSize: 7.5, marginTop: 2 }}>{`Notes: ${sections.documentation.documentationNotes ?? sections.documentation.docNotes}`}</Text>
            ) : null}
          </View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 7 }}>
            {gallery('documents').map(p => (
              <View key={p.number} style={{ width: photoBox('document').width }}>
                <Photo img={images[p.src]} kind="document" />
                <Text style={{ fontSize: 6.5, color: C.ink3, marginTop: 2 }}>{p.label}</Text>
              </View>
            ))}
          </View>
        </View>
        </View>
        )}

        {/* Certification */}
        <View wrap={false}>
        <SectionTitle title="Certification" />
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.ink2 }}>
              I certify this inspection was performed as recorded and that the conditions noted reflect the vehicle at the time of inspection.
            </Text>
            <View style={{ flexDirection: 'row', gap: 22, marginTop: 12 }}>
              <View style={{ width: 190 }}>
                {model.signatureSrc && images[model.signatureSrc]
                  ? <Photo img={images[model.signatureSrc]} kind="signature" />
                  : <View style={{ height: 28, borderBottomWidth: 0.75, borderBottomColor: C.ink }} />}
                <Text style={{ color: C.ink3, fontSize: 7.5, marginTop: 3 }}>{`${model.inspectorName ?? '—'}  ·  Inspector signature`}</Text>
              </View>
              <View>
                <Text style={{ color: C.ink3, fontSize: 7.5 }}>Signed</Text>
                <Text style={{ fontWeight: 600 }}>{`${fmtDate(model.date)}, ${fmtTime(model.date)}`}</Text>
              </View>
              <View>
                <Text style={{ color: C.ink3, fontSize: 7.5 }}>Report ID</Text>
                <Text style={{ fontWeight: 600 }}>{model.reportNo}</Text>
              </View>
            </View>
          </View>
        </View>
        </View>
        <Text style={{ color: C.ink3, fontSize: 6.6, marginTop: 10 }}>
          This report records the vehicle&apos;s visible condition and the results of basic operating checks at the date and time shown. It is not a warranty, a guarantee, a safety or roadworthiness certification, or a repair estimate. A visual inspection cannot reliably identify mechanical, electrical, structural, driver-assistance or hybrid and electric battery conditions; those require a qualified technician and equipment. Vehicle details such as trim, body and engine are decoded from the VIN using NHTSA data and were not independently verified.
        </Text>
      </Page>
    </Document>
  )
}

// Kept for the render test, which reports what it measured against these.
export const REPORT_TARGETS = { maxPages: 6, maxBlankPercent: 45, maxFileSizeKb: 1500 }
void Rect

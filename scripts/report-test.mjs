// R1 · Report foundation — the check that every report change is measured by.
//
//   npm run report:test              render the sample inspections and check them
//   npm run report:test -- --keep    also leave the PDFs and page images behind
//   npm run report:test -- --id=<inspection id>   check one real inspection too
//
// For each report it measures:
//   pages          how many, and whether every page carries the header
//   blank          how much of each page is empty
//   overlaps       text drawn on top of other text — the failure mode that two
//                  react-pdf traps produce, and that is invisible at thumbnail size
//   size           the finished file
//
// The samples are built in memory (scripts/report-cases.mjs), so this runs
// without touching the database.
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { getDocumentProxy, renderPageAsImage } from 'unpdf'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { REPORT_CASES } from './report-cases.mjs'

// --id renders a real inspection, which needs the same environment the server
// has. Next loads .env.local itself; a plain node run has to be told.
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const at = line.indexOf('=')
  if (at > 0 && !line.startsWith('#')) process.env[line.slice(0, at).trim()] ??= line.slice(at + 1).trim().replace(/^"|"$/g, '')
}

const require = createRequire(import.meta.url)
const React = require('react')
const { renderReportToBuffer } = await import('../lib/report/render-document.ts')
const { buildReportModel } = await import('../lib/report/model.ts')
const { calculateVehicleScore } = await import('../lib/vehicle-score.ts')
const ReportDocument = (await import('../lib/report/report-document.tsx')).default

const KEEP = process.argv.includes('--keep')
const ONE_ID = process.argv.find(a => a.startsWith('--id='))?.slice(5)
const OUT = join(process.cwd(), '.report-test')

// What a report has to stay inside.
//
// Blank space is judged on the pages before the last one: a final page carrying
// only the certification block is expected to be mostly white, and a one-page
// report for an inspection with nothing recorded is the right answer, not a
// layout fault. What matters is whether a report wastes the pages it does fill.
const LIMITS = {
  pages: 6,
  averageBlankPercent: 50,
  blankPercentBeforeLastPage: 60,
  fileSizeKb: 1500,
  overlaps: 0,
  pagesWithoutHeader: 0,
}

mkdirSync(OUT, { recursive: true })

// A solid colour photo stands in for a real one: the point of the test is the
// layout, and a fixed image keeps runs comparable.
function samplePhoto(width, height, shade) {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(width * 0.1, height * 0.55, width * 0.8, height * 0.3)
  return { data: canvas.toBuffer('image/jpeg', 70), format: 'jpg', width, height }
}

const PHOTO_SHAPES = {
  tall: [900, 1600, '#6C7A89'],
  wide: [1600, 900, '#7F8C8D'],
  square: [1200, 1200, '#95A5A6'],
}

async function measure(name, buffer) {
  const bytes = new Uint8Array(buffer)
  const pdf = await getDocumentProxy(bytes.slice())
  const pages = pdf.numPages
  const blank = []
  let overlaps = 0
  let pagesWithoutHeader = 0
  let orphanedHeadings = 0

  for (let n = 1; n <= pages; n++) {
    const page = await pdf.getPage(n)
    const text = await page.getTextContent()

    // Text overlap: two items on the same line whose boxes cross. Items are
    // positioned by their transform; height comes from the font size.
    const items = text.items
      // Pin badges are numbers placed deliberately on a diagram, and pins on the
      // same panel are meant to sit close together; they are not a layout fault.
      .filter(i => i.str && i.str.trim().length > 0 && !/^\d{1,3}$/.test(i.str.trim()))
      .map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: i.height || Math.abs(i.transform[3]) }))
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const A = items[a], B = items[b]
        const sameLine = Math.abs(A.y - B.y) < Math.min(A.h, B.h) * 0.55
        if (!sameLine) continue
        const overlapWidth = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x)
        // A sliver is kerning; a third of the shorter item is text on text.
        if (overlapWidth > Math.min(A.w, B.w) * 0.34) {
          overlaps++
          if (process.argv.includes('--why')) console.log(`    overlap p${n}: "${A.str.slice(0, 28)}" × "${B.str.slice(0, 28)}"`)
        }
      }
    }

    // A heading (section titles are 17 pt) with no text below it before the
    // footer is stranded at the foot of the page.
    const FOOTER_TOP = 40
    for (const heading of items.filter(i => i.h >= 15)) {
      const below = items.filter(i => i.y < heading.y - 2 && i.y > FOOTER_TOP)
      if (below.length === 0) {
        orphanedHeadings++
        if (process.argv.includes('--why')) console.log(`    stranded heading p${n}: "${heading.str}"`)
      }
    }

    const pageText = items.map(i => i.str).join(' ')
    if (!/Vehicle condition report/i.test(pageText)) pagesWithoutHeader++

    const png = Buffer.from(await renderPageAsImage(bytes.slice(), n, { canvasImport: () => import('@napi-rs/canvas'), scale: 1.2 }))
    if (KEEP) writeFileSync(join(OUT, `${name}-p${n}.png`), png)
    const img = await loadImage(png)
    const canvas = createCanvas(img.width, img.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, img.width, img.height).data
    let blankRows = 0
    const top = Math.round(img.height * 0.07)
    const bottom = Math.round(img.height * 0.94)
    for (let y = top; y < bottom; y++) {
      let empty = true
      for (let x = Math.round(img.width * 0.05); x < img.width * 0.95; x += 2) {
        const i = (y * img.width + x) * 4
        if (data[i] < 238 || data[i + 1] < 238 || data[i + 2] < 238) { empty = false; break }
      }
      if (empty) blankRows++
    }
    blank.push(Math.round((blankRows / (bottom - top)) * 100))
  }

  return { pages, blank, overlaps, pagesWithoutHeader, orphanedHeadings, sizeKb: Math.round(buffer.length / 1024) }
}

async function renderCase(testCase) {
  const images = {}
  const diagrams = []
  for (const [src, shape] of Object.entries(testCase.photoShapes ?? {})) {
    images[src] = samplePhoto(...PHOTO_SHAPES[shape])
  }
  const score = calculateVehicleScore(testCase.inspection)
  const model = buildReportModel(testCase.inspection, score, testCase.pins ?? [], { companyName: testCase.companyName, inspectorName: testCase.inspectorName })
  for (const pin of testCase.pins ?? []) if (pin.photoUrl && !images[pin.photoUrl]) images[pin.photoUrl] = samplePhoto(...PHOTO_SHAPES.square)
  if (testCase.diagram) {
    const image = samplePhoto(800, 420, '#DDE3E8')
    diagrams.push({ view: 'rear', image, aspect: 420 / 800, modelAssetId: testCase.diagram })
  }
  const buffer = await renderReportToBuffer(React.createElement(ReportDocument, { model, images, diagrams }))
  if (KEEP) writeFileSync(join(OUT, `${testCase.name}.pdf`), buffer)
  return buffer
}

const failures = []
const rows = []

function check(name, m) {
  const filled = m.blank.length > 1 ? m.blank.slice(0, -1) : []
  const averageBlank = filled.length ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length) : 0
  const worstBeforeLast = filled.length ? Math.max(...filled) : 0
  if (m.pages > LIMITS.pages) failures.push(`${name}: ${m.pages} pages (limit ${LIMITS.pages})`)
  if (averageBlank > LIMITS.averageBlankPercent) failures.push(`${name}: ${averageBlank}% blank on average before the last page (limit ${LIMITS.averageBlankPercent}%)`)
  if (worstBeforeLast > LIMITS.blankPercentBeforeLastPage) failures.push(`${name}: a page before the last is ${worstBeforeLast}% blank (limit ${LIMITS.blankPercentBeforeLastPage}%)`)
  if (m.overlaps > LIMITS.overlaps) failures.push(`${name}: ${m.overlaps} overlapping text runs`)
  if (m.pagesWithoutHeader > LIMITS.pagesWithoutHeader) failures.push(`${name}: ${m.pagesWithoutHeader} page(s) with no header`)
  if (m.sizeKb > LIMITS.fileSizeKb) failures.push(`${name}: ${m.sizeKb} kB (limit ${LIMITS.fileSizeKb} kB)`)
  if (m.orphanedHeadings > 0) failures.push(`${name}: ${m.orphanedHeadings} heading(s) stranded at the foot of a page`)
}

for (const testCase of REPORT_CASES) {
  const buffer = await renderCase(testCase)
  const m = await measure(testCase.name, buffer)
  rows.push({ name: testCase.name, ...m })
  check(testCase.name, m)
}

if (ONE_ID) {
  const { renderInspectionReport } = await import('../lib/report/render.ts')
  const { buffer } = await renderInspectionReport(ONE_ID)
  if (KEEP) writeFileSync(join(OUT, `real-${ONE_ID}.pdf`), buffer)
  const m = await measure(`real-${ONE_ID}`, buffer)
  rows.push({ name: `real:${ONE_ID.slice(0, 8)}`, ...m })
  check(`real:${ONE_ID.slice(0, 8)}`, m)
}

console.log('')
console.log('case                     pages  blank per page            overlaps  no header   size')
for (const r of rows) {
  console.log(
    `${r.name.padEnd(24)} ${String(r.pages).padStart(5)}  ${r.blank.map(b => `${b}%`).join(' ').padEnd(24)} ${String(r.overlaps).padStart(8)}  ${String(r.pagesWithoutHeader).padStart(9)}  ${String(r.sizeKb).padStart(4)} kB`,
  )
}

if (!KEEP) { try { rmSync(OUT, { recursive: true, force: true }) } catch { /* left behind is harmless */ } }

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`)
  for (const f of failures) console.error(`  ${f}`)
  process.exit(1)
}
console.log(`\nAll ${rows.length} reports within limits.`)

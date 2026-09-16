/**
 * One-time helper for the Phase 9 vehicle diagram library seed: the delivered
 * 2D source images are single 2x2-grid PNGs (top-left=top, top-right=front,
 * bottom-left=side, bottom-right=rear — confirmed visually on a sample), not
 * the four separate view files scripts/seed-vehicle-model-assets.ts expects.
 * This crops each source image into its four quadrants.
 *
 * Usage:
 *   npx tsx scripts/split-2d-images.ts <sourceDir> <outDir>
 *
 * sourceDir must contain {category}/{name}.png files (the raw delivered layout).
 * outDir is written as {category}/2d/{name}/{top,front,side,rear}.png, matching
 * the ASSET_SOURCE_DIR layout scripts/seed-vehicle-model-assets.ts expects.
 */

import sharp from 'sharp'
import * as path from 'path'
import * as fs from 'fs'

const [, , sourceDir, outDir] = process.argv
if (!sourceDir || !outDir) {
  console.error('Usage: npx tsx scripts/split-2d-images.ts <sourceDir> <outDir>')
  process.exit(1)
}

const CATEGORIES = ['sedan', 'suv', 'truck', 'van'] as const
const QUADRANTS: { view: string; left: boolean; top: boolean }[] = [
  { view: 'top',   left: true,  top: true },
  { view: 'front', left: false, top: true },
  { view: 'side',  left: true,  top: false },
  { view: 'rear',  left: false, top: false },
]

// The source grids are NOT an even 50/50 split — top/side views (long axis
// horizontal) need much more width than front/rear (narrow, tall), so the
// vertical gutter sits well right of center (~65-70% in on a sample). Detect
// each image's real gutter from its actual whitespace band instead of
// assuming a fixed ratio, so this holds up across different vehicles/aspect
// ratios rather than baking in one image's measurements.
const WHITE_THRESHOLD = 250

async function findGutter(
  isBackground: (i: number) => boolean, length: number, otherLength: number, isColumn: boolean,
): Promise<{ start: number; end: number }> {
  let best = { start: -1, end: -1, len: 0 }
  let curStart = -1
  const lo = length * 0.2, hi = length * 0.8
  for (let i = 0; i <= length; i++) {
    const bg = i < length && isBackground(i)
    if (bg) { if (curStart === -1) curStart = i }
    else if (curStart !== -1) {
      const len = i - curStart
      if (len > best.len && curStart > lo && i < hi) best = { start: curStart, end: i, len }
      curStart = -1
    }
  }
  if (best.len === 0) throw new Error(`Could not find a central ${isColumn ? 'vertical' : 'horizontal'} gutter`)
  return best
}

async function splitOne(filePath: string, destDir: string): Promise<void> {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info

  const colIsBg = new Array(width).fill(true)
  const rowIsBg = new Array(height).fill(true)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels
      if (data[idx] < WHITE_THRESHOLD || data[idx + 1] < WHITE_THRESHOLD || data[idx + 2] < WHITE_THRESHOLD) {
        colIsBg[x] = false
        rowIsBg[y] = false
      }
    }
  }

  const colGutter = await findGutter(x => colIsBg[x], width, height, true)
  const rowGutter = await findGutter(y => rowIsBg[y], height, width, false)
  const splitX = Math.round((colGutter.start + colGutter.end) / 2)
  const splitY = Math.round((rowGutter.start + rowGutter.end) / 2)

  fs.mkdirSync(destDir, { recursive: true })

  for (const { view, left, top } of QUADRANTS) {
    await sharp(filePath)
      .extract({
        left: left ? 0 : splitX,
        top: top ? 0 : splitY,
        width: left ? splitX : width - splitX,
        height: top ? splitY : height - splitY,
      })
      .toFile(path.join(destDir, `${view}.png`))
  }
}

async function main() {
  for (const category of CATEGORIES) {
    const catDir = path.join(sourceDir, category)
    if (!fs.existsSync(catDir)) continue
    for (const file of fs.readdirSync(catDir)) {
      if (!file.endsWith('.png')) continue
      const name = file.replace(/\.png$/, '')
      const destDir = path.join(outDir, category, '2d', name)
      await splitOne(path.join(catDir, file), destDir)
      console.log(`Split: ${category}/${name}`)
    }
  }
  console.log('Done.')
}

main().catch(e => { console.error(e); process.exit(1) })

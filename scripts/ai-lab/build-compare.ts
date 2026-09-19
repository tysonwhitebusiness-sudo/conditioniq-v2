// G · Builds the check-in vs check-out test set.
//
//   npx tsx scripts/ai-lab/build-compare.ts
//
// There are no real check-in/check-out pairs with new damage yet, so the set
// is built from what exists, and says plainly which parts are synthetic:
//
//   real      the same vehicle inspected twice by customers, each side paired
//             with itself: the honest false-alarm test (angle, light, lot all differ)
//   existing  a damaged photo paired with a shifted, re-lit copy of itself:
//             damage present at check-in must not be called new
//   added     a real pair with a real damage crop (from VehiDE) pasted onto the
//             check-out photo: the check-in side is genuinely clean there, so
//             a miss is a real miss. Synthetic, and says so.
// (Painting damage out of VehiDE photos was tried first and dropped: the
// patches left the damage visible or obvious seams in almost every pair.)
//   other     two different vehicles: should be "not comparable"
//
// Written to <data>/sets/compare/ with compare.json. Private, never in the repo.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp, { type OverlayOptions } from 'sharp'
import { SETS_DIR, loadEnv, shuffle } from './config'
loadEnv()

const OUT = join(SETS_DIR, 'compare')
const SLOTS = ['exteriorFrontPhoto', 'exteriorRearPhoto', 'exteriorDriverPhoto', 'exteriorPassengerPhoto'] as const
const EDGE = 1024
// Customer pairs where one inspection's photos are not the vehicle (plate
// photos, black frames).
const JUNK = /real-(410541|074248)-/

export interface CompareItem {
  id: string
  kind: 'real' | 'existing' | 'added' | 'other'
  before: string
  after: string
  /** Damage groups that are new at check-out; empty when nothing is new. */
  newGroups: string[]
}

const small = (buf: Buffer) => sharp(buf).rotate().resize(EDGE, EDGE, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()

/** A different day: a few percent off one side, a little darker. */
async function jitter(buf: Buffer, seed: number): Promise<Buffer> {
  const img = sharp(buf)
  const { width = 1, height = 1 } = await img.metadata()
  const dx = Math.round(width * (0.03 + (seed % 3) * 0.01)), dy = Math.round(height * 0.02)
  const left = seed % 2 ? dx : 0, top = seed % 2 ? 0 : dy
  return sharp(await img.extract({ left, top, width: width - dx, height: height - dy }).toBuffer())
    .resize(width, height).modulate({ brightness: 0.86 + (seed % 4) * 0.03 }).jpeg({ quality: 85 }).toBuffer()
}

/**
 * The labelled damage painted over with the clean panel beside it (a shifted
 * copy of the photo, blended in with a soft edge), so the check-in copy shows
 * undamaged paint there. Only used on photos where the damage is small, where
 * the neighbouring panel is a believable stand-in.
 */
async function patchOut(buf: Buffer, boxes: Array<{ x: number; y: number; w: number; h: number }>): Promise<Buffer> {
  const { width = 1, height = 1 } = await sharp(buf).metadata()
  const layers: OverlayOptions[] = []
  for (const b of boxes) {
    const pad = 0.6 // VehiDE boxes are often a little off the damage
    const left = Math.max(0, Math.round((b.x - b.w * pad) * width)), top = Math.max(0, Math.round((b.y - b.h * pad) * height))
    const w = Math.min(width - left, Math.round(b.w * (1 + 2 * pad) * width)), h = Math.min(height - top, Math.round(b.h * (1 + 2 * pad) * height))
    if (w < 6 || h < 6) continue
    // The clean source: beside the damage, whichever side fits, else above or below.
    const shift = Math.round(w * 1.15), vshift = Math.round(h * 1.15)
    const src = left + w + shift <= width ? { left: left + shift, top }
      : left - shift >= 0 ? { left: left - shift, top }
      : top + h + vshift <= height ? { left, top: top + vshift }
      : { left, top: Math.max(0, top - vshift) }
    const region = await sharp(buf).extract({ ...src, width: w, height: h }).removeAlpha().raw().toBuffer()
    const feather = Math.max(2, Math.round(Math.min(w, h) / 6))
    const core = Buffer.alloc(w * h)
    for (let y = feather; y < h - feather; y++) for (let x = feather; x < w - feather; x++) core[y * w + x] = 255
    const mask = await sharp(core, { raw: { width: w, height: h, channels: 1 } }).blur(feather / 2 + 0.3).raw().toBuffer()
    const rgba = Buffer.alloc(w * h * 4)
    for (let i = 0; i < w * h; i++) { rgba[i * 4] = region[i * 3]; rgba[i * 4 + 1] = region[i * 3 + 1]; rgba[i * 4 + 2] = region[i * 3 + 2]; rgba[i * 4 + 3] = mask[i] }
    layers.push({ input: await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), left, top })
  }
  return sharp(buf).composite(layers).jpeg({ quality: 85 }).toBuffer()
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const items: CompareItem[] = []
  const save = (name: string, buf: Buffer) => { writeFileSync(join(OUT, name), buf); return `compare/${name}` }

  // ── real: customer vehicles inspected twice ──────────────────────────────
  const { createAdminClient } = await import('../../lib/supabase/admin')
  const { storagePathFromPhotoUrl } = await import('../../lib/ai/checkin-compare')
  const admin = createAdminClient()
  const { data: rows } = await admin.from('vehicle_inspections')
    .select('id, vin, created_at, exterior_data').eq('status', 'completed').not('vin', 'is', null).order('created_at')
  const byVin = new Map<string, any[]>()
  for (const r of rows ?? []) {
    if (r.vin?.length !== 17) continue
    const paths = SLOTS.map(s => storagePathFromPhotoUrl(r.exterior_data?.[s]))
    if (paths.some(p => !p)) continue
    byVin.set(r.vin, [...(byVin.get(r.vin) ?? []), { ...r, paths }])
  }
  const other: Array<{ vin: string; slot: string; file: string }> = []
  for (const [vin, list] of Array.from(byVin)) {
    for (let i = 1; i < list.length; i++) {
      const [a, b] = [list[i - 1], list[i]]
      for (let s = 0; s < SLOTS.length; s++) {
        const [fa, fb] = await Promise.all([a.paths[s], b.paths[s]].map(async (p: string) => {
          const { data } = await admin.storage.from('inspection-photos').download(p)
          return data ? small(Buffer.from(await data.arrayBuffer())) : null
        }))
        if (!fa || !fb) continue
        const id = `real-${vin.slice(-6)}-${i}-${SLOTS[s].replace(/exterior|Photo/g, '').toLowerCase()}`
        items.push({ id, kind: 'real', before: save(`${id}-a.jpg`, fa), after: save(`${id}-b.jpg`, fb), newGroups: [] })
        if (i === 1) other.push({ vin, slot: SLOTS[s], file: `compare/${id}-b.jpg` })
      }
    }
  }

  // ── other: the same side of two different vehicles ───────────────────────
  for (const slot of SLOTS) {
    const same = other.filter(o => o.slot === slot)
    for (let i = 1; i < same.length && i <= 2; i++) {
      items.push({ id: `other-${slot.replace(/exterior|Photo/g, '').toLowerCase()}-${i}`, kind: 'other', before: same[i - 1].file, after: same[i].file, newGroups: [] })
    }
  }

  // ── existing and new: labelled VehiDE damage ─────────────────────────────
  const manifest = JSON.parse(readFileSync(join(SETS_DIR, 'manifest.json'), 'utf8'))
  const vehide = (manifest.damage.test as any[]).concat(manifest.damage.tuning).filter(d => d.source === 'vehide' && d.boxes?.length)
  const area = (d: any) => d.boxes.reduce((s: number, b: any) => s + b.w * b.h, 0)
  const existing = shuffle(vehide.filter(d => area(d) < 0.3), 11).slice(0, 30)
  const smallDamage = vehide.filter(d => area(d) < 0.08 && d.boxes.every((b: any) => b.w < 0.35 && b.h < 0.35))
  let n = 0
  for (const d of existing) {
    n++
    const original = await small(readFileSync(join(SETS_DIR, d.file)))
    items.push({ id: `existing-${d.id}`, kind: 'existing', before: save(`${d.id}-shifted.jpg`, await jitter(original, n)), after: save(`${d.id}-after.jpg`, original), newGroups: [] })
  }
  // added: a damage crop pasted onto each genuine real pair's check-out photo,
  // on the body in the lower middle of the frame, with a soft edge.
  const genuine = items.filter(i => i.kind === 'real' && !JUNK.test(i.id))
  let k = 0
  for (const pair of genuine) {
    const d = smallDamage[k++ % smallDamage.length]
    const src = await small(readFileSync(join(SETS_DIR, d.file)))
    const { width: sw = 1, height: sh = 1 } = await sharp(src).metadata()
    const box = d.boxes[0]
    const pad = 0.35
    const left = Math.max(0, Math.round((box.x - box.w * pad) * sw)), top = Math.max(0, Math.round((box.y - box.h * pad) * sh))
    const cw = Math.min(sw - left, Math.round(box.w * (1 + 2 * pad) * sw)), ch = Math.min(sh - top, Math.round(box.h * (1 + 2 * pad) * sh))
    const target = readFileSync(join(SETS_DIR, pair.after))
    const { width: tw = 1, height: th = 1 } = await sharp(target).metadata()
    let w = Math.round(tw * 0.13), h = Math.max(8, Math.round(w * ch / cw))
    if (h > th * 0.2) { h = Math.round(th * 0.2); w = Math.max(8, Math.round(h * cw / ch)) }
    const crop = await sharp(src).extract({ left, top, width: cw, height: ch }).resize(w, h).removeAlpha().raw().toBuffer()
    const feather = Math.max(2, Math.round(Math.min(w, h) / 5))
    const core = Buffer.alloc(w * h)
    for (let y = feather; y < h - feather; y++) for (let x = feather; x < w - feather; x++) core[y * w + x] = 255
    const mask = await sharp(core, { raw: { width: w, height: h, channels: 1 } }).blur(feather / 2 + 0.3).raw().toBuffer()
    const rgba = Buffer.alloc(w * h * 4)
    for (let i = 0; i < w * h; i++) { rgba[i * 4] = crop[i * 3]; rgba[i * 4 + 1] = crop[i * 3 + 1]; rgba[i * 4 + 2] = crop[i * 3 + 2]; rgba[i * 4 + 3] = mask[i] }
    const x = Math.round(tw * (0.4 + (k % 3) * 0.08)), y = Math.round(th * 0.6)
    const out = await sharp(target).composite([{ input: await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer(), left: Math.min(tw - w, x), top: Math.min(th - h, y) }]).jpeg({ quality: 85 }).toBuffer()
    const id = pair.id.replace('real-', 'added-')
    items.push({ id, kind: 'added', before: pair.before, after: save(`${id}-b.jpg`, out), newGroups: [box.group] })
  }


  writeFileSync(join(SETS_DIR, 'compare.json'), JSON.stringify({ created: new Date().toISOString(), items }, null, 1))
  const count = (k: string) => items.filter(i => i.kind === k).length
  console.log(`added ${count('added')}, real ${count('real')} pairs from ${Array.from(byVin.values()).filter(l => l.length > 1).length} vehicles, other ${count('other')}, existing ${count('existing')}, new ${count('new')}`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })

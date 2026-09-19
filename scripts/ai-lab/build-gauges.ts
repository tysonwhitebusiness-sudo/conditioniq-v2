// E · Builds the gauge set: real dashboard and odometer photos with the
// odometer reading the inspector typed. Written to sets/gauges2/ with its own
// manifest, gauges.json. Readings are checked by eye afterwards (the typed value
// can be wrong), using the contact sheets this also writes.
//
//   npx tsx scripts/ai-lab/build-gauges.ts

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { SETS_DIR, loadEnv } from './config'
loadEnv()

async function main() {
  const { createAdminClient } = await import('../../lib/supabase/admin')
  const db = createAdminClient()
  const dir = join(SETS_DIR, 'gauges2')
  mkdirSync(dir, { recursive: true })
  const { data: rows } = await db.from('vehicle_inspections').select('id, company_id, odometer, interior_data').eq('status', 'completed').not('odometer', 'is', null).limit(1000)
  const items: Array<{ id: string; file: string; slot: string; typed: number }> = []
  for (const r of rows ?? []) {
    if (!(Number(r.odometer) > 0)) continue
    for (const slot of ['odometerPhoto', 'dashboardPhoto']) {
      const url = r.interior_data?.[slot]
      if (typeof url !== 'string' || !url.startsWith('http')) continue
      const file = `${r.id.slice(0, 8)}-${slot}.jpg`
      if (!existsSync(join(dir, file))) {
        let buf: Buffer | null = null
        const res = await fetch(url).catch(() => null)
        if (res?.ok) buf = Buffer.from(await res.arrayBuffer())
        else {
          const p = decodeURIComponent(url.split('/inspection-photos/')[1]?.split('?')[0] ?? '')
          const { data } = p ? await db.storage.from('inspection-photos').download(p) : { data: null }
          if (data) buf = Buffer.from(await data.arrayBuffer())
        }
        if (!buf) continue
        writeFileSync(join(dir, file), await sharp(buf).rotate().resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer())
      }
      items.push({ id: `${r.id.slice(0, 8)}-${slot}`, file: `gauges2/${file}`, slot, typed: Number(r.odometer) })
    }
  }
  writeFileSync(join(SETS_DIR, 'gauges.json'), JSON.stringify(items, null, 1))
  // Contact sheets for reading the odometer by eye.
  const W = 420, H = 330
  for (let s = 0; s * 6 < items.length; s++) {
    const c = createCanvas(W * 3, H * 2), g = c.getContext('2d')
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
    for (let i = 0; i < 6 && s * 6 + i < items.length; i++) {
      const it = items[s * 6 + i]; const img = await loadImage(readFileSync(join(SETS_DIR, it.file)))
      const k = Math.min(W / img.width, (H - 22) / img.height), x0 = (i % 3) * W, y0 = Math.floor(i / 3) * H
      g.drawImage(img, x0, y0 + 22, img.width * k, img.height * k)
      g.fillStyle = '#c00'; g.font = 'bold 15px sans-serif'; g.fillText(`${s * 6 + i}: ${it.id} typed=${it.typed}`, x0 + 4, y0 + 16)
    }
    writeFileSync(join(dir, `_sheet-${s}.png`), c.toBuffer('image/png'))
  }
  console.log(`${items.length} gauge photos (${items.filter(i => i.slot === 'odometerPhoto').length} odometer close-ups, ${items.filter(i => i.slot === 'dashboardPhoto').length} dashboard photos)`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })

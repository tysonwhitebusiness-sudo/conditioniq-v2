// B · High-resolution copies of a set's photos, for testing whether small or
// distant damage is found more often at 2048 px than at 1024 px.
//
//   npx tsx scripts/ai-lab/build-hires.ts [test|tuning]
//
// Written beside the normal sets under sets/hires/, same file names. A photo
// already smaller than 2048 px is kept at its own size, never enlarged.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { SETS_DIR, VEHIDE_DIR, loadEnv } from './config'
import { readManifest } from './harness'

loadEnv()

async function main() {
  const set = (process.argv[2] ?? 'test') as 'test' | 'tuning'
  const { createAdminClient } = await import('../../lib/supabase/admin')
  const db = createAdminClient()
  const items = readManifest().damage[set]
  const sizes: number[] = []
  for (const item of items) {
    const out = join(SETS_DIR, 'hires', item.file)
    mkdirSync(dirname(out), { recursive: true })
    let raw: Buffer | null = null
    if (item.source === 'vehide') {
      raw = execFileSync('unzip', ['-p', join(VEHIDE_DIR, 'vehide.zip'), `validation/validation/${item.file.replace(/^damage\//, '')}`], { maxBuffer: 64 * 1024 * 1024 })
    } else {
      const key = item.id.replace(/^c-[0-9a-f]{8}-/, '')
      const { data } = await db.from('vehicle_inspections').select('exterior_data').eq('id', item.inspectionId!).single()
      const url: string = data?.exterior_data?.[key]
      const res = url ? await fetch(url).catch(() => null) : null
      if (res?.ok) raw = Buffer.from(await res.arrayBuffer())
      else {
        const path = decodeURIComponent(String(url ?? '').split('/inspection-photos/')[1]?.split('?')[0] ?? '')
        const { data: blob } = path ? await db.storage.from('inspection-photos').download(path) : { data: null }
        if (blob) raw = Buffer.from(await blob.arrayBuffer())
      }
    }
    if (!raw) { console.log('missing', item.id); continue }
    const img = sharp(raw).rotate()
    const meta = await img.metadata()
    sizes.push(Math.max(meta.width ?? 0, meta.height ?? 0))
    if (!existsSync(out)) writeFileSync(out, await img.resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer())
  }
  const atFull = sizes.filter(s => s >= 2048).length
  console.log(`${sizes.length}/${items.length} written; ${atFull} at the full 2048 px, the rest at their original size (median original edge ${sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)]} px)`)
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })

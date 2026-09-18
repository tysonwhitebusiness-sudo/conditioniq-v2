import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// B · Shared settings for the AI lab: where the datasets live and how the
// public damage dataset's labels map onto ours.
//
// The datasets are kept outside the project (they hold customer photos) in a
// private folder, C:\Users\13143\ciq-ai-data unless AI_DATA_DIR says otherwise.

export const DATA_DIR = process.env.AI_DATA_DIR ?? 'C:/Users/13143/ciq-ai-data'
export const SETS_DIR = join(DATA_DIR, 'sets')
export const RUNS_DIR = join(DATA_DIR, 'runs')
export const VEHIDE_DIR = join(DATA_DIR, 'vehide')

/** Longest edge of every image in the sets: what is sent to the model. */
export const IMAGE_EDGE = 1024

// The damage groups the lab scores. VehiDE's seven classes (Vietnamese) map
// onto groups of AIAG damage types; a suggestion counts as right when its
// group matches, since a photo cannot always separate, say, a scratch from a
// scuff, and the inspector picks the exact AIAG type when confirming.
export const DAMAGE_GROUPS = {
  scratch: { label: 'Scratch, scuff or chip in paint', aiag: [5, 9, 12, 34] },
  dent: { label: 'Dent', aiag: [4, 14] },
  tear: { label: 'Torn, cracked or broken panel or trim', aiag: [6, 13, 1] },
  glass: { label: 'Cracked or broken glass', aiag: [20, 21, 22] },
  missing: { label: 'Missing part', aiag: [8, 38] },
  puncture: { label: 'Hole or puncture', aiag: [11] },
  lamp: { label: 'Broken lamp or lens', aiag: [24] },
} as const
export type DamageGroup = keyof typeof DAMAGE_GROUPS

export const VEHIDE_CLASS: Record<string, DamageGroup> = {
  tray_son: 'scratch',
  mop_lom: 'dent',
  rach: 'tear',
  vo_kinh: 'glass',
  mat_bo_phan: 'missing',
  thung: 'puncture',
  be_den: 'lamp',
}

/** Loads .env.local for scripts run outside Next. */
export function loadEnv() {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const at = line.indexOf('=')
    if (at > 0 && !line.startsWith('#')) process.env[line.slice(0, at).trim()] ??= line.slice(at + 1).trim().replace(/^"|"$/g, '')
  }
}

/** A seeded shuffle, so a set built twice comes out the same. */
export function shuffle<T>(items: T[], seed = 7): T[] {
  const a = [...items]
  let s = seed
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export interface DamageItem {
  id: string
  file: string
  source: 'vehide' | 'customer'
  /** Damage groups present in the photo; empty for a no-damage photo. */
  groups: DamageGroup[]
  /** Normalised boxes (0–1) around each labelled damage, when the source has them. */
  boxes?: Array<{ group: DamageGroup; x: number; y: number; w: number; h: number }>
  /** For customer photos: the inspection, so its photos are never split across sets. */
  inspectionId?: string
}

export interface QualityItem {
  id: string
  file: string
  original: string
  problem: 'none' | 'blurry' | 'dark' | 'framing'
}

export interface Manifest {
  version: number
  created: string
  damage: { examples: DamageItem[]; tuning: DamageItem[]; test: DamageItem[] }
  realDamage: DamageItem[]
  quality: QualityItem[]
  gauges: Array<{ id: string; file: string; odometer: number }>
  recommendations: string[]
}

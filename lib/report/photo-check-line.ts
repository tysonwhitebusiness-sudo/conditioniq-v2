import { PHOTO_SLOT_LABELS } from './model'

// D · The report's photo check line, from the checks of the photos that were
// kept (a retake replaces its slot's check). Only photos that still had a
// concern when kept are listed. Empty means the line is left out.

export interface StoredPhotoCheck {
  slot: string
  problems: string[] | null
  right_subject: boolean | null
  framed: boolean | null
  note: string | null
}

const PROBLEM_WORD: Record<string, string> = { blurry: 'blurry', dark: 'too dark', bright: 'washed out' }

export function photoCheckLine(checks: StoredPhotoCheck[]): { text: string | null; usedAi: boolean } {
  const concerns: string[] = []
  let usedAi = false
  for (const c of checks) {
    const label = PHOTO_SLOT_LABELS[c.slot] ?? c.slot
    const words = (c.problems ?? []).map(p => PROBLEM_WORD[p]).filter(Boolean)
    if (c.right_subject === false) { words.push('may show a different view'); usedAi = true }
    if (c.framed === false) { words.push('subject not fully in frame'); usedAi = true }
    if (words.length) concerns.push(`"${label}" ${words.join(', ')}`)
  }
  if (!concerns.length) return { text: null, usedAi: false }
  const shown = concerns.slice(0, 4)
  const more = concerns.length - shown.length
  return {
    text: `${concerns.length} ${concerns.length === 1 ? 'photo was' : 'photos were'} kept with a concern: ${shown.join('; ')}${more ? `; and ${more} more` : ''}.`,
    usedAi,
  }
}

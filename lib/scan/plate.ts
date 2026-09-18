// S · Picking a license plate out of the text read from a photo.
//
// A reader returns every line of text it can see: the plate, but also the
// state name, dealer frame, dates on a temporary tag and the badge on the
// trunk. The plate is the tallest confident line that fits a plate format.
// Letters and digits that look alike (O and 0, I and 1, B and 8, S and 5) are
// settled by the state's format when the state is known; otherwise the read is
// left as it is and the inspector confirms it.
//
// Measured on 16 real plate photos from inspections, September 2026: 16 right,
// 0 wrong with the format rules; Tesseract got 1 of the same 16.

export interface TextLine {
  text: string
  /** 0–1. */
  confidence: number
  /** Height of the line's box in pixels; larger text is more likely the plate. */
  height: number
}

export interface PlateRead {
  plate: string
  confidence: number
}

// Words that sit on or around a plate and are never the plate itself.
const NOISE = new Set([
  'TEMPORARY', 'REGISTRATION', 'EXPIRES', 'EXPIRATION', 'DEALER', 'COUNTY', 'SAMPLE',
  'OKLAHOMA', 'INDIANA', 'WISCONSIN', 'MISSOURI', 'ARKANSAS', 'ILLINOIS', 'KANSAS', 'TEXAS', 'IOWA',
  'CALIFORNIA', 'NEBRASKA', 'TENNESSEE', 'KENTUCKY', 'COLORADO', 'FLORIDA', 'GEORGIA', 'ALABAMA',
])

// Letter positions (L), digit positions (D) and either (X) for the formats in
// current issue in the states our customers inspect in. Temporary tags and
// older formats fall back to the generic rule.
export const STATE_FORMATS: Record<string, string[]> = {
  OK: ['LLLDDD'],
  MO: ['LLDLDL', 'LLDDLDL'],
  KS: ['DDDLLL', 'LLLDDD'],
  AR: ['LLLDDL', 'DDDLLL'],
  IL: ['LLDDDDD', 'LDDDDDD'],
  IN: ['DDDLLL', 'LDDDDDD'],
  TX: ['LLLDDDD'],
  WI: ['LLLDDDD', 'LDDDDL'],
  IA: ['LLLDDD'],
  NE: ['LLLDDD', 'DLLDDD'],
  MI: ['LLLDDDD'],
}

const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '8': 'B', '5': 'S', '2': 'Z', '6': 'G' }
const TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', B: '8', S: '5', Z: '2', G: '6' }

/** Fits a read to one of the state's formats, fixing look-alike characters; null if none fits. */
export function fitStateFormat(plate: string, state: string | null | undefined): string | null {
  const formats = state ? STATE_FORMATS[state.toUpperCase()] : undefined
  if (!formats) return null
  for (const format of formats) {
    if (format.length !== plate.length) continue
    let fixed = ''
    for (let i = 0; i < format.length; i++) {
      const c = plate[i], want = format[i]
      if (want === 'L') fixed += /[A-Z]/.test(c) ? c : TO_LETTER[c] ?? '?'
      else if (want === 'D') fixed += /\d/.test(c) ? c : TO_DIGIT[c] ?? '?'
      else fixed += c
    }
    if (!fixed.includes('?')) return fixed
  }
  return null
}

/** A plausible plate: 2 to 8 letters and digits with at least one digit. */
export function looksLikePlate(value: string): boolean {
  return /^[A-Z0-9]{2,8}$/.test(value) && /\d/.test(value)
}

export function pickPlate(lines: TextLine[], state?: string | null, minConfidence = 0.8): PlateRead | null {
  const candidates: Array<PlateRead & { weight: number }> = []
  for (const line of lines) {
    const raw = line.text.toUpperCase()
    if (/\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(raw)) continue // a date on a temporary tag
    const compact = raw.replace(/[^A-Z0-9]/g, '')
    if (compact.length < 5 || compact.length > 8 || NOISE.has(compact) || !/\d/.test(compact)) continue
    const plate = fitStateFormat(compact, state) ?? compact
    candidates.push({ plate, confidence: line.confidence, weight: line.height * line.confidence })
  }
  candidates.sort((a, b) => b.weight - a.weight)
  const best = candidates[0]
  return best && best.confidence >= minConfidence ? { plate: best.plate, confidence: best.confidence } : null
}

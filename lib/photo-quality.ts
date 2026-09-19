// D · Photo quality checks that run on the phone, free and instantly.
//
// Pure arithmetic on a small grayscale copy of the photo, so the camera's
// confirm screen and the lab measure exactly the same thing:
//
//   sharpness   variance of the Laplacian (edge strength). Blur smooths edges.
//   brightness  mean luminance, 0–255.
//
// Whether the photo shows the right thing, and whether the vehicle is framed,
// cannot be judged from pixels; that is the AI check (lib/ai/photo-check.ts).
// Thresholds were set on the lab's photo-quality set (real customer photos
// with blurred, darkened and badly framed copies); see scripts/ai-lab/quality-lab.ts.

/** Longest edge of the grayscale copy the checks run on. */
export const QUALITY_EDGE = 512

export interface QualityThresholds {
  /** Below this sharpness the photo is called blurry. */
  minSharpness: number
  /** Below this brightness the photo is called too dark. */
  minBrightness: number
  /** Above this brightness the photo is called washed out. */
  maxBrightness: number
}

export const QUALITY_THRESHOLDS: QualityThresholds = { minSharpness: 100, minBrightness: 45, maxBrightness: 235 }

export interface QualityMeasure {
  sharpness: number
  brightness: number
}

export type QualityProblem = 'blurry' | 'dark' | 'bright'

/** Measures a grayscale image given as one byte per pixel, row by row. */
export function measureQuality(gray: Uint8Array | Uint8ClampedArray, width: number, height: number): QualityMeasure {
  let sum = 0
  for (let i = 0; i < gray.length; i++) sum += gray[i]
  const brightness = sum / gray.length

  // 4-neighbour Laplacian over the interior pixels.
  let n = 0, mean = 0, m2 = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const lap = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i]
      n++
      const d = lap - mean
      mean += d / n
      m2 += d * (lap - mean)
    }
  }
  return { sharpness: n > 1 ? m2 / (n - 1) : 0, brightness }
}

export function qualityProblems(m: QualityMeasure, t: QualityThresholds = QUALITY_THRESHOLDS): QualityProblem[] {
  const out: QualityProblem[] = []
  if (m.brightness < t.minBrightness) out.push('dark')
  else if (m.brightness > t.maxBrightness) out.push('bright')
  // A very dark photo also has weak edges; only call it blurry when it is lit.
  if (m.sharpness < t.minSharpness && m.brightness >= t.minBrightness) out.push('blurry')
  return out
}

export const PROBLEM_TEXT: Record<QualityProblem, string> = {
  blurry: 'This photo looks blurry',
  dark: 'This photo looks too dark',
  bright: 'This photo looks washed out',
}

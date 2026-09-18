import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Font } from '@react-pdf/renderer'

// R1 · Report foundation.
//
// The report uses Inter, the same face as the app, embedded in the file so the
// PDF looks the same wherever it is opened. The weights are read from disk as
// data URIs: react-pdf resolves a bare Windows path as a URL and fails.
//
// One trap worth knowing: with a real embedded face, a line break inside a
// single text block is drawn but not measured, so the text after it overlaps.
// Break lines into separate text blocks instead. The render test checks for
// exactly this.

const WEIGHTS = [400, 500, 600, 700, 800] as const
let registered = false

export function registerReportFonts() {
  if (registered) return
  const dir = join(process.cwd(), 'lib', 'report', 'fonts')
  Font.register({
    family: 'Inter',
    fonts: WEIGHTS.map(weight => ({
      src: `data:font/ttf;base64,${readFileSync(join(dir, `Inter-${weight}.ttf`)).toString('base64')}`,
      fontWeight: weight,
    })),
  })
  // Long words are never hyphenated in a condition report — a VIN split across
  // two lines is unreadable.
  Font.registerHyphenationCallback(word => [word])
  registered = true
}

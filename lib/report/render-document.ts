import { renderToBuffer, Font } from '@react-pdf/renderer'
import { registerReportFonts } from './fonts'

// One entry point for turning a report element into a PDF, so the fonts are
// always registered against the same renderer instance. Importing the renderer
// separately elsewhere can pick up a second copy of the module, whose font
// store knows nothing about Inter.
//
// Every render also starts from freshly loaded fonts. react-pdf keeps each
// loaded font for the life of the process, and a font carried over from one
// report into the next draws the wrong glyphs: "J. Smith" printed as ". Smith"
// and "2.5L" as ".5L" on the second report a warm server built. Reloading is a
// few milliseconds per weight. Renders take turns, because reloading while
// another report is mid-layout would pull its fonts out from under it.

let queue: Promise<unknown> = Promise.resolve()

function reloadFonts() {
  for (const family of Object.values(Font.getRegisteredFonts()) as Array<{ sources: Array<{ data: unknown; loadResultPromise: unknown }> }>) {
    for (const source of family.sources) {
      source.data = null
      source.loadResultPromise = null
    }
  }
}

export function renderReportToBuffer(element: any): Promise<Buffer> {
  const run = queue.then(async () => {
    registerReportFonts()
    reloadFonts()
    return (await renderToBuffer(element)) as Buffer
  })
  // The next render waits for this one whether it succeeds or not.
  queue = run.catch(() => undefined)
  return run
}

import { renderToBuffer } from '@react-pdf/renderer'
import { registerReportFonts } from './fonts'

// One entry point for turning a report element into a PDF, so the fonts are
// always registered against the same renderer instance. Importing the renderer
// separately elsewhere can pick up a second copy of the module, whose font
// store knows nothing about Inter.
export async function renderReportToBuffer(element: any): Promise<Buffer> {
  registerReportFonts()
  return (await renderToBuffer(element)) as Buffer
}

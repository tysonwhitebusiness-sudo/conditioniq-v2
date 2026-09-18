import { GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100, WHITE } from '@/lib/design-tokens'

// A report number that matches nothing on file. Worded for someone holding a
// paper copy: the likely causes are a mistyped number or an altered report.
export default function ReportNotFound() {
  return (
    <main style={{ minHeight: '100vh', background: GRAY_100, display: 'flex', justifyContent: 'center', padding: '40px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: GRAY_900, margin: '0 0 16px' }}>Condition IQ</p>
        <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 14, padding: 20 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: GRAY_900, margin: 0 }}>No report matches this number</h1>
          <p style={{ fontSize: 14, color: GRAY_700, lineHeight: 1.5, margin: '10px 0 0' }}>
            Check the report number printed in the footer of your copy. It is eight letters and digits, like 3F9A21C0.
          </p>
          <p style={{ fontSize: 13, color: GRAY_500, lineHeight: 1.5, margin: '10px 0 0' }}>
            If the number is right and no report is found, the copy may not have been issued through Condition IQ.
          </p>
        </div>
      </div>
    </main>
  )
}

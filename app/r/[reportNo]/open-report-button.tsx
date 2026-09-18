'use client'

import { useState } from 'react'
import { openReport } from '@/lib/pdf-generator'
import { PRIMARY, WHITE, DANGER_TEXT } from '@/lib/design-tokens'

/** Shown on the verify page only to users of the company that issued the report. */
export default function OpenReportButton({ inspectionId, reportUrl }: { inspectionId: string; reportUrl: string | null }) {
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        onClick={() => { setError(null); openReport({ id: inspectionId, report_url: reportUrl }).catch(e => setError(e?.message ?? 'Could not open the report')) }}
        style={{ width: '100%', height: 44, marginTop: 16, borderRadius: 10, border: 'none', background: PRIMARY, color: WHITE, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        Open full report
      </button>
      {error ? <p style={{ fontSize: 12, color: DANGER_TEXT, margin: '8px 0 0' }}>{error}</p> : null}
    </>
  )
}

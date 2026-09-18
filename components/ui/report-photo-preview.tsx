'use client'

import { useState } from 'react'
import { REPORT_BOX_PREVIEW, type ReportBoxKind } from '@/lib/report/layout'
import { PRIMARY, WHITE, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'

// P1 · Camera confirm.
//
// What the inspector sees before tapping Use Photo: the photo inside the box it
// will print in on the report — same shape, same centred crop, same caption —
// so a shot that loses the damage to the crop can be retaken on the spot.
// "Full photo" switches back to the whole frame for a closer look.

const BOX_NAME: Record<ReportBoxKind, string> = {
  gallery: 'photo gallery',
  lead: 'report cover',
  damage: 'damage close-up',
  document: 'documents',
}

export interface ReportPreviewSpec {
  box: ReportBoxKind
  caption: string
}

export default function ReportPhotoPreview({ src, spec }: { src: string; spec: ReportPreviewSpec }) {
  const [showFull, setShowFull] = useState(false)
  const shape = REPORT_BOX_PREVIEW[spec.box]
  // Keep a portrait box (documents) from running off a phone screen.
  const maxWidth = shape.ratio < 1 ? 'min(62vw, 300px)' : 'min(88vw, 520px)'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {showFull ? (
        <img src={src} alt="Full photo" style={{ flex: 1, minHeight: 0, width: '100%', objectFit: 'contain', display: 'block' }} />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '16px 16px 8px' }}>
          <span style={{ color: PRIMARY, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            How it prints on the report
          </span>
          {/* A slip of report paper with the photo in its box, as it will print. */}
          <div style={{ background: WHITE, borderRadius: 10, padding: 12, width: `calc(${maxWidth} + 24px)`, maxWidth: '100%', boxSizing: 'border-box' }}>
            <div
              data-testid="report-preview-box"
              data-box={spec.box}
              style={{
                width: '100%',
                aspectRatio: `${shape.ratio}`,
                borderRadius: spec.box === 'document' ? 4 : 6,
                overflow: 'hidden',
                background: GRAY_100,
                position: 'relative',
                border: spec.box === 'document' ? `1px solid ${GRAY_300}` : 'none',
              }}
            >
              <img
                src={src}
                alt={`${spec.caption}, as it prints`}
                style={{ width: '100%', height: '100%', objectFit: shape.fit, objectPosition: 'center', display: 'block' }}
              />
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 12, color: GRAY_500 }}>{spec.caption}</p>
          </div>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center', maxWidth: 320, lineHeight: 1.4 }}>
            {shape.fit === 'cover'
              ? `Printed in the ${BOX_NAME[spec.box]}. Anything outside this frame is cropped.`
              : `Printed whole in the ${BOX_NAME[spec.box]} — nothing is cropped.`}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 8 }}>
        <button
          type="button"
          onClick={() => setShowFull(v => !v)}
          style={{ background: 'rgba(255,255,255,0.12)', color: WHITE, border: 'none', borderRadius: 20, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {showFull ? 'Show report view' : 'Show full photo'}
        </button>
      </div>
    </div>
  )
}

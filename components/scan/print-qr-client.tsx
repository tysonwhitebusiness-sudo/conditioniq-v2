'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { regenerateQrToken } from '@/lib/qr-actions'

type Format = 'windshield' | 'hangtag'

const FORMAT_PAGE_SIZE: Record<Format, string> = {
  windshield: '4in 2in',
  hangtag: '4in 6in',
}

interface Vehicle {
  id: string
  vin: string
  year: string | null
  make: string | null
  model: string | null
}

export default function PrintQrClient({ vehicle, token }: { vehicle: Vehicle; token: string }) {
  const [currentToken, setCurrentToken] = useState(token)
  const [svg, setSvg] = useState('')
  const [format, setFormat] = useState<Format>('windshield')
  const [regenerating, setRegenerating] = useState(false)
  const [origin, setOrigin] = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  useEffect(() => {
    if (!origin) return
    const url = `${origin}/scan/${currentToken}`
    QRCode.toString(url, { type: 'svg', margin: 1, width: 260 }).then(setSvg)
  }, [origin, currentToken])

  const handleRegenerate = async () => {
    if (!window.confirm('This invalidates the currently printed QR code — anyone scanning the old sticker will get "not recognized." Continue?')) return
    setRegenerating(true)
    const next = await regenerateQrToken(vehicle.id)
    setCurrentToken(next)
    setRegenerating(false)
  }

  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', padding: 24, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @media print {
          @page { size: ${FORMAT_PAGE_SIZE[format]}; margin: ${format === 'windshield' ? '0' : '0.25in'}; }
          body * { visibility: hidden; }
          #qr-print-label, #qr-print-label * { visibility: visible; }
          #qr-print-label { position: fixed; inset: 0; margin: 0; border: none; }
        }
        /* qrcode's generated <svg> carries its own width/height attributes
           (from the toString width option) that would otherwise override the
           wrapper div's sizing and overlap the label next to it. */
        .qr-code-wrap svg { display: block; width: 100%; height: 100%; }
      `}</style>

      <div style={{ maxWidth: 480, margin: '0 auto 20px' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0D1B2A', margin: '0 0 4px' }}>Print QR Code</h1>
        <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 16px' }}>{vehicleLabel} · {vehicle.vin}</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['windshield', 'hangtag'] as const).map(f => (
            <button
              key={f} onClick={() => setFormat(f)}
              style={{
                flex: 1, height: 40, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: format === f ? '1.5px solid #00B4D8' : '1px solid #E1E8F0',
                background: format === f ? '#E0F7FC' : '#FFFFFF', color: format === f ? '#0097B2' : '#4A5568',
              }}
            >
              {f === 'windshield' ? 'Windshield Label (4×2 in)' : 'Hang Tag (4×6 in)'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => window.print()}
            style={{ flex: 1, height: 46, borderRadius: 12, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Print
          </button>
          <button
            onClick={handleRegenerate} disabled={regenerating}
            style={{ height: 46, padding: '0 16px', borderRadius: 12, border: '1.5px solid #EF4444', background: '#FFFFFF', color: '#EF4444', fontSize: 13, fontWeight: 600, cursor: regenerating ? 'default' : 'pointer', fontFamily: 'inherit' }}
          >
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
      </div>

      <div
        id="qr-print-label"
        style={{
          width: '4in',
          height: format === 'windshield' ? '2in' : '6in',
          margin: '0 auto', background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 8,
          display: 'flex', flexDirection: format === 'windshield' ? 'row' : 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14, padding: 18, boxSizing: 'border-box',
        }}
      >
        {svg
          ? <div className="qr-code-wrap" dangerouslySetInnerHTML={{ __html: svg }} style={{ width: format === 'windshield' ? 130 : 200, height: format === 'windshield' ? 130 : 200, flexShrink: 0 }} />
          : <p style={{ fontSize: 13, color: '#94A3B8' }}>Generating…</p>}
        <div style={{ textAlign: format === 'windshield' ? 'left' : 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: '0 0 2px' }}>{vehicleLabel}</p>
          <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748B', margin: 0 }}>{vehicle.vin}</p>
        </div>
      </div>
    </div>
  )
}

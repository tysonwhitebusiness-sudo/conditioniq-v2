'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setupScanPin } from '@/lib/qr-actions'

const MIDNIGHT = '#0D1B2A'
const CYAN = '#00B4D8'

const inputStyle: React.CSSProperties = {
  width: '100%', height: 52, border: '1.5px solid #E1E8F0', borderRadius: 12,
  padding: '0 14px', fontSize: 22, letterSpacing: '0.3em', textAlign: 'center',
  outline: 'none', fontFamily: 'monospace', background: '#FAFAFA', color: MIDNIGHT,
  boxSizing: 'border-box',
}

export default function SetupPinForm() {
  const router = useRouter()
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (pin !== confirm) { setError('PINs don’t match.'); return }
    setSaving(true)
    const { error: err } = await setupScanPin(pin)
    if (err) { setError(err); setSaving(false); return }
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#F0F4F8', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: 380, width: '100%', background: '#FFFFFF', borderRadius: 20,
        border: '1px solid #E1E8F0', padding: 28, boxShadow: '0 4px 24px rgba(13,27,42,0.08)',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: MIDNIGHT, margin: '0 0 6px' }}>Set a PIN for this device</h1>
        <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 22px', lineHeight: 1.5 }}>
          You'll use this to quickly get back in on this device for the next 24 hours, without signing in again.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>4–6 digit PIN</label>
            <input
              type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
              value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={inputStyle} autoFocus
            />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Confirm PIN</label>
            <input
              type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6}
              value={confirm} onChange={e => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: '#DC2626', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', margin: '0 0 16px' }}>
              {error}
            </p>
          )}

          <button
            type="submit" disabled={saving || pin.length < 4 || confirm.length < 4}
            style={{
              width: '100%', height: 48, borderRadius: 12, border: 'none',
              background: saving || pin.length < 4 ? '#94A3B8' : CYAN,
              color: '#FFFFFF', fontSize: 15, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving…' : 'Set PIN'}
          </button>
        </form>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { getAiKillSwitch, setAiKillSwitch } from '@/lib/ai/settings-actions'
import { WHITE, GRAY_900, GRAY_500, GRAY_300, DANGER, DANGER_LIGHT, DANGER_TEXT, SUCCESS_DARK } from '@/lib/design-tokens'

// A · Stops every AI call on the platform at once. Inspections carry on as
// they would with AI switched off; nothing is lost.
export default function AiKillSwitch() {
  const [on, setOn] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { getAiKillSwitch().then(setOn) }, [])
  if (on === null) return null

  const flip = async () => {
    const next = !on
    if (next && !window.confirm('Stop all AI calls for every account now?')) return
    setSaving(true); setError(null)
    const result = await setAiKillSwitch(next)
    setSaving(false)
    if (result.ok) setOn(next)
    else setError(result.error ?? 'Could not save')
  }

  return (
    <div style={{ background: on ? DANGER_LIGHT : WHITE, border: `1px solid ${on ? DANGER : GRAY_300}`, borderRadius: 16, padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <p style={{ fontSize: 14, fontWeight: 700, color: GRAY_900, margin: 0 }}>AI kill switch</p>
        <p style={{ fontSize: 13, color: on ? DANGER_TEXT : GRAY_500, margin: '2px 0 0' }}>
          {on ? 'All AI calls are stopped for every account.' : 'AI is running. Each inspection stays under its spend ceiling.'}
        </p>
        {error ? <p style={{ fontSize: 12, color: DANGER_TEXT, margin: '4px 0 0' }}>{error}</p> : null}
      </div>
      <button
        onClick={flip}
        disabled={saving}
        style={{ height: 36, padding: '0 14px', borderRadius: 10, border: 'none', background: on ? SUCCESS_DARK : DANGER, color: WHITE, fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }}
      >
        {on ? 'Resume AI' : 'Stop all AI'}
      </button>
    </div>
  )
}

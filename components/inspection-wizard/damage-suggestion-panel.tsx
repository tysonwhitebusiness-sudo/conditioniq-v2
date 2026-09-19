'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Plus } from 'lucide-react'
import type { DamageSuggestion } from '@/lib/damage-suggest-client'
import { suggestionTitle, SLOT_LABEL, type ExteriorSlot } from '@/lib/ai/damage-suggest-labels'
import { PRIMARY, PRIMARY_LIGHT, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'

// F · Damage the AI noticed in the exterior photos, above the damage diagram.
//
// Nothing here is recorded. "Add" starts placing a pin with what the AI could
// fill in; the inspector taps where it is and always sets the severity.
// "Not damage" dismisses it and is kept as a correction.

const LEAVE_MS = 260

export function suggestionPlace(s: DamageSuggestion): string | null {
  if (s.areaLabel) return s.areaLabel
  if (!s.whereText) return null
  return s.whereText.charAt(0).toUpperCase() + s.whereText.slice(1)
}

export default function DamageSuggestionPanel({
  suggestions, checking, photos, placingId, onAdd, onReject,
}: {
  suggestions: DamageSuggestion[]
  checking: boolean
  /** The step's photo slots, for a thumbnail of the photo each suggestion came from. */
  photos: Record<string, any>
  placingId: string | null
  onAdd: (s: DamageSuggestion) => void
  onReject: (s: DamageSuggestion) => void
}) {
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  // "Checking…" only appears if a check takes a moment, so it never flashes
  // for accounts without AI, whose checks return straight away.
  const [showChecking, setShowChecking] = useState(false)
  useEffect(() => {
    if (!checking) { setShowChecking(false); return }
    const t = setTimeout(() => setShowChecking(true), 700)
    return () => clearTimeout(t)
  }, [checking])

  const reject = (s: DamageSuggestion) => {
    setLeaving(prev => new Set(prev).add(s.id))
    setTimeout(() => onReject(s), LEAVE_MS)
  }

  const open = suggestions.length > 0 || showChecking

  return (
    <div id="damage-suggestions" className="ciq-collapse" data-open={open} aria-hidden={!open} style={{ scrollMarginTop: 80 }}>
      <div>
        <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 14, padding: 12, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: suggestions.length ? 10 : 0 }}>
            <span style={{ width: 30, height: 30, borderRadius: 15, background: PRIMARY_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Sparkles size={15} color={PRIMARY} className={suggestions.length ? undefined : 'ciq-pulse'} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: GRAY_900 }}>
                {suggestions.length
                  ? `${suggestions.length} possible ${suggestions.length === 1 ? 'damage' : 'damages'} in your photos`
                  : 'Checking photos for damage…'}
              </p>
              <p style={{ margin: '1px 0 0', fontSize: 12, color: GRAY_500 }}>
                {suggestions.length ? 'Look at each one. Nothing is recorded until you add it.' : 'Keep going; this runs in the background.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map(s => {
              const photo = photos[s.slot]
              const placing = placingId === s.id
              const place = suggestionPlace(s)
              return (
                <div key={s.id} className="ciq-collapse" data-open={!leaving.has(s.id)}>
                  <div>
                    <div className="ciq-rise" style={{
                      padding: 10, background: placing ? PRIMARY_LIGHT : GRAY_100,
                      border: `1px solid ${placing ? PRIMARY : GRAY_300}`, borderRadius: 12,
                      transition: 'background 200ms ease, border-color 200ms ease',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {typeof photo === 'string' && photo ? (
                          <img src={photo} alt="" style={{ width: 52, height: 52, borderRadius: 8, objectFit: 'cover', flexShrink: 0, display: 'block' }} />
                        ) : (
                          <span style={{ width: 52, height: 52, borderRadius: 8, background: GRAY_300, flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: GRAY_900 }}>{suggestionTitle(s.damageGroup)}</p>
                          {place && <p style={{ margin: '2px 0 0', fontSize: 13, color: GRAY_700, lineHeight: 1.35 }}>{place}</p>}
                          <p style={{ margin: '2px 0 0', fontSize: 12, color: GRAY_500 }}>From the {SLOT_LABEL[s.slot as ExteriorSlot]?.toLowerCase() ?? 'photos'}</p>
                        </div>
                      </div>
                      {placing ? (
                        <p style={{ margin: '10px 0 2px', fontSize: 13, fontWeight: 600, color: PRIMARY, textAlign: 'center' }}>
                          Tap its spot on the diagram below
                        </p>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button type="button" onClick={() => reject(s)} disabled={!!placingId}
                            style={{ flex: 1, height: 40, borderRadius: 10, border: `1px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontSize: 13, fontWeight: 600, cursor: placingId ? 'default' : 'pointer', opacity: placingId ? 0.5 : 1, transition: 'opacity 200ms ease', fontFamily: 'inherit' }}>
                            Not damage
                          </button>
                          <button type="button" onClick={() => onAdd(s)} disabled={!!placingId}
                            style={{ flex: 1, height: 40, borderRadius: 10, border: 'none', background: PRIMARY, color: WHITE, fontSize: 13, fontWeight: 700, cursor: placingId ? 'default' : 'pointer', opacity: placingId ? 0.5 : 1, transition: 'opacity 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: 'inherit' }}>
                            <Plus size={15} /> Add to diagram
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {showChecking && suggestions.length > 0 && (
            <p className="ciq-fade" style={{ margin: '8px 2px 0', fontSize: 12, color: GRAY_500 }}>
              <span className="ciq-pulse">●</span> Checking the latest photo…
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

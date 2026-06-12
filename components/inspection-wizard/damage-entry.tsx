'use client'

import { useState } from 'react'
import { Pencil, Trash2, Camera } from 'lucide-react'
import dynamic from 'next/dynamic'

const InspectionCamera = dynamic(() => import('@/components/ui/inspection-camera'), { ssr: false })

const DAMAGE_TYPES = [
  { value: 'scratch', label: 'Scratch' },
  { value: 'dent', label: 'Dent' },
  { value: 'crack', label: 'Crack' },
  { value: 'glass_damage', label: 'Glass Damage' },
  { value: 'rust', label: 'Rust' },
  { value: 'paint_damage', label: 'Paint Damage' },
  { value: 'tear', label: 'Tear' },
  { value: 'stain', label: 'Stain' },
  { value: 'missing_part', label: 'Missing Part' },
  { value: 'other', label: 'Other' },
]

const SEVERITIES = [
  { value: 'minor',    label: 'Minor',    bg: '#D1FAE5', color: '#065F46', border: '#10B981' },
  { value: 'moderate', label: 'Moderate', bg: '#FEF3C7', color: '#92400E', border: '#F59E0B' },
  { value: 'major',    label: 'Major',    bg: '#FEE2E2', color: '#991B1B', border: '#EF4444' },
]

const IMPACTS = [
  { value: 'cosmetic',    label: 'Cosmetic' },
  { value: 'functional',  label: 'Functional' },
  { value: 'safety',      label: 'Safety' },
]

const EXTERIOR_LOCATIONS = [
  { value: 'hood',                   label: 'Hood' },
  { value: 'roof',                   label: 'Roof' },
  { value: 'trunk',                  label: 'Trunk' },
  { value: 'front_bumper',           label: 'Front Bumper' },
  { value: 'rear_bumper',            label: 'Rear Bumper' },
  { value: 'driver_door_front',      label: 'Driver Door (Front)' },
  { value: 'driver_door_rear',       label: 'Driver Door (Rear)' },
  { value: 'passenger_door_front',   label: 'Passenger Door (Front)' },
  { value: 'passenger_door_rear',    label: 'Passenger Door (Rear)' },
  { value: 'driver_fender',          label: 'Driver Fender' },
  { value: 'passenger_fender',       label: 'Passenger Fender' },
  { value: 'driver_quarter_panel',   label: 'Driver Quarter Panel' },
  { value: 'passenger_quarter_panel',label: 'Passenger Quarter Panel' },
  { value: 'windshield',             label: 'Windshield' },
]

const INTERIOR_LOCATIONS = [
  { value: 'driver_seat',           label: 'Driver Seat' },
  { value: 'passenger_seat',        label: 'Passenger Seat' },
  { value: 'rear_seat_left',        label: 'Rear Seat Left' },
  { value: 'rear_seat_right',       label: 'Rear Seat Right' },
  { value: 'dashboard',             label: 'Dashboard' },
  { value: 'center_console',        label: 'Center Console' },
  { value: 'headliner',             label: 'Headliner' },
  { value: 'carpet_floor',          label: 'Carpet/Floor' },
  { value: 'door_panel_driver',     label: 'Door Panel (Driver)' },
  { value: 'door_panel_passenger',  label: 'Door Panel (Passenger)' },
]

interface Damage {
  id: string
  type: string
  severity: string
  location: string
  estimatedImpact: string
  description: string
  photo?: string
}

interface Props {
  damages: Damage[]
  onChange: (damages: Damage[]) => void
  locationType?: 'exterior' | 'interior'
}

function isComplete(d: Damage) {
  return !!d.photo && !!d.type && !!d.severity && !!d.location && !!d.estimatedImpact
}

function FieldLabel({ text, required, hasValue }: { text: string; required?: boolean; hasValue?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{text}</span>
      {required && !hasValue && (
        <span style={{ fontSize: 10, fontWeight: 600, color: '#EF4444', background: '#FEE2E2', padding: '1px 6px', borderRadius: 8 }}>
          Required
        </span>
      )}
    </div>
  )
}

function Pill({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '7px 13px', borderRadius: 20, fontSize: 13,
        fontWeight: selected ? 600 : 400,
        border: selected ? '2px solid #0D1B2A' : '1.5px solid #E1E8F0',
        cursor: 'pointer',
        background: selected ? '#0D1B2A' : '#FFFFFF',
        color: selected ? '#FFFFFF' : '#4A5568',
        fontFamily: 'inherit',
      }}
    >
      {label}
    </button>
  )
}

function SeverityPill({
  sev,
  selected,
  onClick,
}: {
  sev: typeof SEVERITIES[0]
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: '8px 0', borderRadius: 20, fontSize: 13,
        fontWeight: selected ? 700 : 400,
        border: selected ? `2px solid ${sev.border}` : '1.5px solid #E1E8F0',
        cursor: 'pointer',
        background: selected ? sev.bg : '#FFFFFF',
        color: selected ? sev.color : '#4A5568',
        fontFamily: 'inherit',
      }}
    >
      {sev.label}
    </button>
  )
}

function SeverityBadge({ value }: { value: string }) {
  const s = SEVERITIES.find(x => x.value === value)
  if (!s) return null
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

function Thumbnail({ url, onRetake }: { url: string; onRetake: () => void }) {
  return (
    <div style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
      <img src={url} alt="Damage" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <button
        type="button"
        onClick={onRetake}
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          background: 'rgba(0,0,0,0.62)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          padding: '5px 0',
        }}
      >
        <Camera size={10} color="#FFF" />
        <span style={{ color: '#FFF', fontSize: 9, fontWeight: 700, letterSpacing: '0.03em' }}>RETAKE</span>
      </button>
    </div>
  )
}

export default function DamageEntry({ damages, onChange, locationType = 'exterior' }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addingCamera, setAddingCamera] = useState(false)
  const [retakeId, setRetakeId] = useState<string | null>(null)

  const locations = locationType === 'exterior' ? EXTERIOR_LOCATIONS : INTERIOR_LOCATIONS

  const updateDamage = (id: string, updates: Partial<Damage>) => {
    onChange(damages.map(d => d.id === id ? { ...d, ...updates } : d))
  }

  const removeDamage = (id: string) => {
    onChange(damages.filter(d => d.id !== id))
    if (expanded === id) setExpanded(null)
  }

  const handleAddCapture = (_key: string, url: string) => {
    const id = crypto.randomUUID()
    onChange([...damages, {
      id, type: '', severity: '', location: '', estimatedImpact: '', description: '', photo: url,
    }])
    setExpanded(id)
    setAddingCamera(false)
  }

  const handleRetakeCapture = (_key: string, url: string) => {
    if (retakeId) updateDamage(retakeId, { photo: url })
    setRetakeId(null)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
          Damage Items{damages.length > 0 ? ` (${damages.length})` : ''}
        </span>
        <button
          type="button"
          onClick={() => setAddingCamera(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 20,
            background: '#0D1B2A', color: '#FFFFFF',
            border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          <Camera size={14} /> Add Damage
        </button>
      </div>

      {/* Empty state */}
      {damages.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '20px 0',
          color: '#94A3B8', fontSize: 13,
        }}>
          No damage recorded — tap "Add Damage" to photograph and log damage
        </div>
      )}

      {/* Damage item list */}
      {damages.map(d => {
        const isExp = expanded === d.id
        const complete = isComplete(d)
        const typeLabel = DAMAGE_TYPES.find(t => t.value === d.type)?.label
        const locLabel = locations.find(l => l.value === d.location)?.label

        return (
          <div
            key={d.id}
            style={{
              marginBottom: 10, borderRadius: 14, overflow: 'hidden',
              border: `1.5px solid ${!complete && d.photo ? '#FDE68A' : '#E1E8F0'}`,
              background: '#FFFFFF',
            }}
          >
            {/* ── Collapsed summary row ── */}
            {!isExp && (
              <div
                onClick={() => setExpanded(d.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 12px', cursor: 'pointer',
                }}
              >
                {d.photo && (
                  <img
                    src={d.photo}
                    alt=""
                    style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {typeLabel ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A' }}>{typeLabel}</span>
                    ) : (
                      <span style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic' }}>No type set</span>
                    )}
                    {d.severity && <SeverityBadge value={d.severity} />}
                    {locLabel && (
                      <span style={{ fontSize: 12, color: '#94A3B8' }}>{locLabel}</span>
                    )}
                  </div>
                  {!complete && (
                    <span style={{ fontSize: 11, color: '#D97706', display: 'block', marginTop: 2 }}>
                      Incomplete — tap to finish
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setExpanded(d.id) }}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      border: '1px solid #E1E8F0', background: '#F0F4F8',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Pencil size={13} color="#4A5568" />
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); removeDamage(d.id) }}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      border: '1px solid #FEE2E2', background: '#FFF5F5',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Trash2 size={13} color="#EF4444" />
                  </button>
                </div>
              </div>
            )}

            {/* ── Expanded edit state ── */}
            {isExp && (
              <div style={{ padding: '14px 14px 16px' }}>
                {/* Thumbnail + header */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
                  {d.photo ? (
                    <Thumbnail url={d.photo} onRetake={() => setRetakeId(d.id)} />
                  ) : (
                    <div style={{
                      width: 72, height: 72, borderRadius: 10,
                      border: '2px dashed #CBD5E1', background: '#F8FAFC',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 4, flexShrink: 0,
                    }}>
                      <Camera size={18} color="#94A3B8" />
                      <span style={{ fontSize: 9, color: '#94A3B8' }}>No photo</span>
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: '0 0 4px' }}>
                      Damage #{damages.indexOf(d) + 1}
                    </p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 8px', lineHeight: 1.4 }}>
                      Select type, severity, location, and impact below.
                    </p>
                    <button
                      type="button"
                      onClick={() => setExpanded(null)}
                      style={{
                        fontSize: 12, color: '#00B4D8', background: 'none',
                        border: 'none', cursor: 'pointer', padding: 0,
                        fontFamily: 'inherit', fontWeight: 500,
                      }}
                    >
                      Collapse ↑
                    </button>
                  </div>
                </div>

                {/* Type */}
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel text="Type" required hasValue={!!d.type} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {DAMAGE_TYPES.map(t => (
                      <Pill
                        key={t.value}
                        label={t.label}
                        selected={d.type === t.value}
                        onClick={() => updateDamage(d.id, { type: t.value })}
                      />
                    ))}
                  </div>
                </div>

                {/* Severity */}
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel text="Severity" required hasValue={!!d.severity} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    {SEVERITIES.map(s => (
                      <SeverityPill
                        key={s.value}
                        sev={s}
                        selected={d.severity === s.value}
                        onClick={() => updateDamage(d.id, { severity: s.value })}
                      />
                    ))}
                  </div>
                </div>

                {/* Location */}
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel text="Location" required hasValue={!!d.location} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {locations.map(l => (
                      <Pill
                        key={l.value}
                        label={l.label}
                        selected={d.location === l.value}
                        onClick={() => updateDamage(d.id, { location: l.value })}
                      />
                    ))}
                  </div>
                </div>

                {/* Impact */}
                <div style={{ marginBottom: 14 }}>
                  <FieldLabel text="Impact" required hasValue={!!d.estimatedImpact} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    {IMPACTS.map(imp => (
                      <Pill
                        key={imp.value}
                        label={imp.label}
                        selected={d.estimatedImpact === imp.value}
                        onClick={() => updateDamage(d.id, { estimatedImpact: imp.value })}
                      />
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Description</span>
                    <span style={{ fontSize: 10, color: '#94A3B8' }}>Optional</span>
                  </div>
                  <textarea
                    value={d.description}
                    onChange={e => updateDamage(d.id, { description: e.target.value })}
                    placeholder="Add notes about this damage..."
                    rows={2}
                    style={{
                      width: '100%', border: '1.5px solid #E1E8F0', borderRadius: 10,
                      padding: '10px 12px', fontSize: 13, color: '#0D1B2A',
                      resize: 'none', fontFamily: 'inherit', background: '#FAFAFA',
                      boxSizing: 'border-box', outline: 'none',
                    }}
                  />
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeDamage(d.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#EF4444', fontSize: 12, fontWeight: 500,
                    padding: '4px 0', fontFamily: 'inherit',
                  }}
                >
                  <Trash2 size={13} /> Remove this damage item
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* Camera — new damage */}
      {addingCamera && (
        <InspectionCamera
          slots={[{ key: 'photo', label: 'Damage Photo' }]}
          values={{ photo: null }}
          onCapture={handleAddCapture}
          onClose={() => setAddingCamera(false)}
          mode="square"
        />
      )}

      {/* Camera — retake */}
      {retakeId && (
        <InspectionCamera
          slots={[{ key: 'photo', label: 'Retake Photo' }]}
          values={{ photo: null }}
          onCapture={handleRetakeCapture}
          onClose={() => setRetakeId(null)}
          mode="square"
        />
      )}
    </div>
  )
}

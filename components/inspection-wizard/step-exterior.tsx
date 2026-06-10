'use client'

import { Eye, Camera } from 'lucide-react'
import PhotoField from '@/components/ui/photo-field'
import DamageEntry from './damage-entry'
import VoiceInput from '@/components/ui/voice-input'
import StepOpener from './step-opener'

const EXT_PHOTOS = ['exteriorFrontPhoto', 'exteriorRearPhoto', 'exteriorDriverPhoto', 'exteriorPassengerPhoto'] as const
const EXT_LABELS = ['Front', 'Rear', 'Driver Side', 'Passenger Side']

const TIRE_POSITIONS = ['tireFrontLeft', 'tireFrontRight', 'tireRearLeft', 'tireRearRight'] as const
const TIRE_LABELS: Record<string, string> = { tireFrontLeft: 'FL', tireFrontRight: 'FR', tireRearLeft: 'RL', tireRearRight: 'RR' }

const COND_FIELDS = [
  { key: 'overallCondition', label: 'Overall Condition', opts: ['Good', 'Fair', 'Poor'] },
  { key: 'paintCondition', label: 'Paint Condition', opts: ['Good', 'Faded', 'Scratched', 'Dented', 'Peeling'] },
  { key: 'glassCondition', label: 'Glass Condition', opts: ['Good', 'Chipped', 'Cracked', 'Shattered'] },
]

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

function ConditionPill({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: selected ? 600 : 400,
        border: 'none', cursor: 'pointer',
        background: selected ? '#F4A62A' : '#F0F4F8',
        color: selected ? '#0D1B2A' : '#4A5568',
      }}
    >
      {label}
    </button>
  )
}

function TirePill({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        padding: '5px 10px', borderRadius: 16, fontSize: 12, fontWeight: selected ? 600 : 400,
        border: 'none', cursor: 'pointer',
        background: selected ? '#FEF3C7' : '#F0F4F8',
        color: selected ? '#92400E' : '#4A5568',
      }}
    >
      {label}
    </button>
  )
}

export default function StepExterior({ data, onChange, onNext, onBack }: Props) {
  const set = (key: string, val: any) => onChange({ ...data, [key]: val })
  const setTire = (pos: string, key: string, val: any) =>
    onChange({ ...data, [pos]: { ...(data[pos] ?? {}), [key]: val } })

  const photosCount = EXT_PHOTOS.filter(k => data[k]).length
  const canAdvance = photosCount >= 1

  return (
    <div style={{ paddingBottom: 140 }}>
      <StepOpener
        icon={<Eye size={36} style={{ color: '#00B4D8' }} />}
        title="Exterior Inspection"
        subtitle="Document all four sides and exterior condition"
        instructionTitle="Photo Guide"
        instructionText="Capture all 4 exterior angles. Note any paint, glass, or tire issues below."
        complete={canAdvance}
        remainingText={canAdvance ? '' : 'At least 1 exterior photo required'}
      />

      <div style={{ padding: '0 24px' }}>
        {/* Capture All 4 CTA */}
        <button
          type="button"
          onClick={() => {}}
          style={{
            width: '100%', height: 48, borderRadius: 12, border: 'none',
            background: '#F4A62A', color: '#0D1B2A',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 16, boxShadow: '0 4px 12px rgba(244,166,42,0.3)',
          }}
        >
          <Camera size={18} /> Capture All 4 Photos →
        </button>

        {/* 2×2 photo grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {EXT_PHOTOS.map((key, i) => (
            <PhotoField key={key} label={EXT_LABELS[i]} value={data[key]} onChange={url => set(key, url)} />
          ))}
        </div>

        {/* Condition pills */}
        {COND_FIELDS.map(({ key, label, opts }) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 8 }}>
              {label}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {opts.map(opt => (
                <ConditionPill
                  key={opt}
                  label={opt}
                  selected={data[key] === opt.toLowerCase()}
                  onSelect={() => set(key, opt.toLowerCase())}
                />
              ))}
            </div>
          </div>
        ))}

        {data.glassCondition && data.glassCondition !== 'good' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
              Which pane?
            </label>
            <input
              value={data.glassDamageLocation ?? ''}
              onChange={e => set('glassDamageLocation', e.target.value)}
              className="step-input"
              placeholder="e.g. Windshield, Driver window..."
            />
          </div>
        )}

        {/* Tires */}
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', marginBottom: 12 }}>Tires</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {TIRE_POSITIONS.map(pos => {
              const tire = data[pos] ?? {}
              return (
                <div key={pos} style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 12, padding: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#0D1B2A', display: 'block', marginBottom: 8 }}>
                    {TIRE_LABELS[pos]}
                  </span>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Tread (32nds)</label>
                    <input
                      type="number"
                      value={tire.treadDepth ?? ''}
                      onChange={e => setTire(pos, 'treadDepth', e.target.value)}
                      className="step-input"
                      style={{ height: 36, fontSize: 13 }}
                      min={0} max={32}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <TirePill
                      label="Flat"
                      selected={!!tire.flat}
                      onSelect={() => setTire(pos, 'flat', !tire.flat)}
                    />
                    <TirePill
                      label="Uneven"
                      selected={!!tire.unevenWear}
                      onSelect={() => setTire(pos, 'unevenWear', !tire.unevenWear)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Damage */}
        <div style={{ marginBottom: 20 }}>
          <DamageEntry
            damages={data.damages ?? []}
            onChange={damages => set('damages', damages)}
            locationType="exterior"
          />
        </div>

        {/* Exterior notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
            Exterior Notes
          </label>
          <div style={{ position: 'relative' }}>
            <textarea
              value={data.exteriorNotes ?? ''}
              onChange={e => set('exteriorNotes', e.target.value)}
              className="step-textarea"
              placeholder="Additional exterior observations..."
              style={{ paddingRight: 44 }}
            />
            <div style={{ position: 'absolute', top: 10, right: 10 }}>
              <VoiceInput onTranscript={t => set('exteriorNotes', (data.exteriorNotes ?? '') + ' ' + t)} />
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div className="wizard-bottom-bar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#FFFFFF', borderTop: '1px solid #E1E8F0',
        padding: '12px 20px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}>
        {!canAdvance && (
          <p style={{ fontSize: 12, color: '#F59E0B', textAlign: 'center', marginBottom: 8 }}>
            At least 1 exterior photo required
          </p>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              width: '38%', height: 52, borderRadius: 12,
              background: '#FFFFFF', border: '1.5px solid #E1E8F0',
              color: '#4A5568', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            }}
          >
            ← Back
          </button>
          <button
            onClick={onNext}
            disabled={!canAdvance}
            style={{
              flex: 1, height: 52, borderRadius: 12, border: 'none',
              fontWeight: 700, fontSize: 15, cursor: canAdvance ? 'pointer' : 'not-allowed',
              background: canAdvance ? '#F4A62A' : '#E1E8F0',
              color: canAdvance ? '#0D1B2A' : '#94A3B8',
              boxShadow: canAdvance ? '0 4px 12px rgba(244,166,42,0.3)' : 'none',
            }}
          >
            Continue to Interior →
          </button>
        </div>
      </div>
    </div>
  )
}

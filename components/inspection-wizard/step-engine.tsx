'use client'

import { Wrench } from 'lucide-react'
import PhotoField from '@/components/ui/photo-field'
import VoiceInput from '@/components/ui/voice-input'
import StepOpener from './step-opener'

const FLUID_FIELDS = [
  { key: 'oilLevel', label: 'Oil Level', opts: [['Good', 'good'], ['Low', 'low'], ['Overfull', 'overfull'], ['Not Checked', 'not_checked']] },
  { key: 'coolantLevel', label: 'Coolant Level', opts: [['Good', 'good'], ['Low', 'low'], ['Not Checked', 'not_checked']] },
  { key: 'brakeFluid', label: 'Brake Fluid', opts: [['Good', 'good'], ['Low', 'low'], ['Not Checked', 'not_checked']] },
  { key: 'transmissionFluid', label: 'Transmission Fluid', opts: [['Good', 'good'], ['Low', 'low'], ['Not Checked', 'not_checked']] },
]

const COMPONENT_FIELDS = [
  { key: 'batteryCondition', label: 'Battery', opts: [['Good', 'good'], ['Fair', 'fair'], ['Poor', 'poor']] },
  { key: 'beltCondition', label: 'Belt', opts: [['Good', 'good'], ['Worn', 'worn'], ['Cracked', 'cracked'], ['N/V', 'not_visible']] },
  { key: 'hoseCondition', label: 'Hoses', opts: [['Good', 'good'], ['Worn', 'worn'], ['Leaking', 'leaking'], ['N/V', 'not_visible']] },
]

const NOISE_TYPES = ['knocking', 'ticking', 'squealing', 'grinding', 'rattling', 'other']

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
  inspectionId: string
}

function FluidPill({ label, value, selected, onSelect }: { label: string; value: string; selected: boolean; onSelect: () => void }) {
  let bg = '#F0F4F8', color = '#4A5568'
  if (selected) {
    if (value === 'good') { bg = '#D1FAE5'; color = '#065F46' }
    else if (value === 'low' || value === 'leaking' || value === 'poor') { bg = '#FEE2E2'; color = '#991B1B' }
    else if (value === 'overfull' || value === 'fair') { bg = '#FEF3C7'; color = '#92400E' }
    else { bg = '#F0F4F8'; color = '#4A5568' }
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: selected ? 600 : 400,
        border: `1px solid ${selected ? color : '#E1E8F0'}`, cursor: 'pointer',
        background: bg, color,
      }}
    >
      {label}
    </button>
  )
}

function YesNo({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {([true, false] as const).map(v => {
        const selected = value === v
        const isYes = v === true
        return (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            style={{
              flex: 1, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: selected ? 600 : 400, fontSize: 14,
              background: selected ? (isYes ? '#D1FAE5' : '#FEE2E2') : '#FFFFFF',
              color: selected ? (isYes ? '#065F46' : '#991B1B') : '#4A5568',
              outline: `1px solid ${selected ? (isYes ? '#10B981' : '#EF4444') : '#E1E8F0'}`,
            }}
          >
            {isYes ? 'Yes' : 'No'}
          </button>
        )
      })}
    </div>
  )
}

const label13 = { fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 8 } as const
const section13 = { fontSize: 14, fontWeight: 600, color: '#0D1B2A', display: 'block', marginBottom: 12 } as const

export default function StepEngine({ data, onChange, onNext, onBack, inspectionId }: Props) {
  const set = (key: string, val: any) => onChange({ ...data, [key]: val })

  return (
    <div style={{ paddingBottom: 140 }}>
      <StepOpener
        icon={<Wrench size={36} style={{ color: '#00B4D8' }} />}
        title="Engine Compartment"
        subtitle="Check fluid levels, components, and engine condition"
        instructionTitle="Engine Check"
        instructionText="Check all fluid levels, inspect belt and hose condition, and note any leaks, noises, or warning indicators."
        complete={true}
        remainingText=""
      />

      <div style={{ padding: '0 24px' }}>
        {/* Engine bay photo */}
        <div style={{ marginBottom: 20 }}>
          <PhotoField
            label="Engine Bay Photo"
            value={data.engineBayPhoto}
            onChange={url => set('engineBayPhoto', url)}
            inspectionId={inspectionId}
            fieldKey="engineBayPhoto"
          />
        </div>

        {/* Fluid levels */}
        <div style={{ marginBottom: 20 }}>
          <span style={section13}>Fluid Levels</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FLUID_FIELDS.map(({ key, label, opts }) => (
              <div key={key}>
                <label style={label13}>{label}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {opts.map(([l, v]) => (
                    <FluidPill
                      key={v}
                      label={l}
                      value={v}
                      selected={data[key] === v}
                      onSelect={() => set(key, v)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Components */}
        <div style={{ marginBottom: 20 }}>
          <span style={section13}>Components</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {COMPONENT_FIELDS.map(({ key, label, opts }) => (
              <div key={key}>
                <label style={label13}>{label}</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {opts.map(([l, v]) => (
                    <FluidPill
                      key={v}
                      label={l}
                      value={v}
                      selected={data[key] === v}
                      onSelect={() => set(key, v)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Visible leaks */}
        <div style={{ marginBottom: 16 }}>
          <label style={label13}>Visible Leaks</label>
          <YesNo value={data.visibleLeaks} onChange={v => set('visibleLeaks', v)} />
        </div>

        {data.visibleLeaks === true && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ ...label13, marginBottom: 6 }}>Leak Description</label>
            <input
              value={data.leakDescription ?? ''}
              onChange={e => set('leakDescription', e.target.value)}
              className="step-input"
              placeholder="Describe the leak..."
            />
            <div style={{ marginTop: 10 }}>
              <PhotoField
                label="Leak Photo"
                value={data.leakPhoto}
                onChange={url => set('leakPhoto', url)}
                inspectionId={inspectionId}
                fieldKey="leakPhoto"
              />
            </div>
          </div>
        )}

        {/* Unusual noise */}
        <div style={{ marginBottom: 16 }}>
          <label style={label13}>Unusual Noise</label>
          <YesNo value={data.unusualNoise} onChange={v => set('unusualNoise', v)} />
        </div>

        {data.unusualNoise === true && (
          <div style={{ marginBottom: 16 }}>
            <label style={label13}>Noise Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {NOISE_TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set('noiseType', t)}
                  style={{
                    padding: '8px 14px', borderRadius: 20, fontSize: 13,
                    border: 'none', cursor: 'pointer',
                    fontWeight: data.noiseType === t ? 600 : 400,
                    background: data.noiseType === t ? '#00B4D8' : '#F0F4F8',
                    color: data.noiseType === t ? '#FFFFFF' : '#4A5568',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Check engine light */}
        <div style={{ marginBottom: 20 }}>
          <label style={label13}>Check Engine Light</label>
          <YesNo value={data.checkEngineLight} onChange={v => set('checkEngineLight', v)} />
        </div>

        {/* Engine notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
            Engine Notes
          </label>
          <div style={{ position: 'relative' }}>
            <textarea
              value={data.engineNotes ?? ''}
              onChange={e => set('engineNotes', e.target.value)}
              className="step-textarea"
              placeholder="Additional engine observations..."
              style={{ paddingRight: 44 }}
            />
            <div style={{ position: 'absolute', top: 10, right: 10 }}>
              <VoiceInput onTranscript={t => set('engineNotes', (data.engineNotes ?? '') + ' ' + t)} />
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
            style={{
              flex: 1, height: 52, borderRadius: 12, border: 'none',
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
              background: '#00B4D8', color: '#FFFFFF',
              boxShadow: '0 4px 12px rgba(0,180,216,0.3)',
            }}
          >
            Continue to Review →
          </button>
        </div>
      </div>
    </div>
  )
}

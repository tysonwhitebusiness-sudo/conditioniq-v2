'use client'

import { Car } from 'lucide-react'
import PhotoField from '@/components/ui/photo-field'
import DamageEntry from './damage-entry'
import VoiceInput from '@/components/ui/voice-input'
import StepOpener from './step-opener'

const INT_PHOTOS = ['interiorDriverDoorPhoto', 'interiorRearDriverDoorPhoto', 'interiorTrunkPhoto', 'interiorRearPassengerDoorPhoto', 'interiorPassengerDoorPhoto', 'dashboardPhoto'] as const
const INT_PHOTO_LABELS = ['Driver Door', 'Rear Driver Door', 'Trunk', 'Rear Passenger Door', 'Passenger Door', 'Dashboard']

const CONDITIONS: Record<string, string[]> = {
  overallCondition: ['good', 'fair', 'poor'],
  frontSeats: ['good', 'stained', 'torn', 'worn', 'burned'],
  rearSeats: ['good', 'stained', 'torn', 'worn', 'burned'],
  dashboard: ['good', 'cracked', 'faded', 'warning_lights'],
  headliner: ['good', 'stained', 'sagging', 'torn'],
  carpetFloor: ['good', 'stained', 'worn', 'torn', 'wet'],
  steeringWheel: ['good', 'worn', 'cracked', 'peeling'],
}

const CONDITION_LABELS: Record<string, string> = {
  overallCondition: 'Overall Interior', frontSeats: 'Front Seats', rearSeats: 'Rear Seats',
  dashboard: 'Dashboard', headliner: 'Headliner', carpetFloor: 'Carpet/Floor', steeringWheel: 'Steering Wheel',
}

const ODOR_TYPES = ['smoke', 'mildew', 'pet', 'food', 'chemical', 'other']

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

function CondPill({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
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
      {label.replace('_', ' ')}
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

export default function StepInterior({ data, onChange, onNext, onBack }: Props) {
  const set = (key: string, val: any) => onChange({ ...data, [key]: val })

  return (
    <div style={{ paddingBottom: 140 }}>
      <StepOpener
        icon={<Car size={36} style={{ color: '#00B4D8' }} />}
        title="Interior Inspection"
        subtitle="Document interior condition, odors, and damage"
        instructionTitle="Interior Review"
        instructionText="Photograph all areas and record any damage, staining, or odors. Mark warning lights in dashboard notes."
        complete={true}
        remainingText=""
      />

      <div style={{ padding: '0 24px' }}>
        {/* 2×3 photo grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {INT_PHOTOS.map((key, i) => (
            <PhotoField key={key} label={INT_PHOTO_LABELS[i]} value={data[key]} onChange={url => set(key, url)} />
          ))}
        </div>

        {/* Condition pills */}
        {Object.entries(CONDITIONS).map(([key, opts]) => (
          <div key={key} style={{ marginBottom: 16 }}>
            <label style={label13}>{CONDITION_LABELS[key]}</label>
            {key === 'dashboard' && data[key] === 'warning_lights' && (
              <p style={{ fontSize: 12, color: '#92400E', background: '#FEF3C7', padding: '6px 10px', borderRadius: 8, marginBottom: 8 }}>
                Warning lights present — document in notes
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {opts.map(opt => (
                <CondPill
                  key={opt}
                  label={opt}
                  selected={data[key] === opt}
                  onSelect={() => set(key, opt)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Odor */}
        <div style={{ marginBottom: 16 }}>
          <label style={label13}>Odor Present</label>
          <YesNo
            value={data.interiorOdor}
            onChange={v => set('interiorOdor', v)}
          />
        </div>

        {data.interiorOdor === true && (
          <div style={{ marginBottom: 16 }}>
            <label style={label13}>Odor Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ODOR_TYPES.map(t => (
                <CondPill
                  key={t}
                  label={t}
                  selected={data.odorType === t}
                  onSelect={() => set('odorType', t)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Damage entries */}
        <div style={{ marginBottom: 20 }}>
          <DamageEntry
            damages={data.damages ?? []}
            onChange={damages => set('damages', damages)}
            locationType="interior"
          />
        </div>

        {/* Interior notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
            Interior Notes
          </label>
          <div style={{ position: 'relative' }}>
            <textarea
              value={data.interiorNotes ?? ''}
              onChange={e => set('interiorNotes', e.target.value)}
              className="step-textarea"
              placeholder="Additional interior observations..."
              style={{ paddingRight: 44 }}
            />
            <div style={{ position: 'absolute', top: 10, right: 10 }}>
              <VoiceInput onTranscript={t => set('interiorNotes', (data.interiorNotes ?? '') + ' ' + t)} />
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
              background: '#F4A62A', color: '#0D1B2A',
              boxShadow: '0 4px 12px rgba(244,166,42,0.3)',
            }}
          >
            Continue to Engine →
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Car, Camera } from 'lucide-react'
import dynamic from 'next/dynamic'
import DamageEntry from './damage-entry'
import VoiceInput from '@/components/ui/voice-input'
import StepOpener from './step-opener'

const InspectionCamera = dynamic(() => import('@/components/ui/inspection-camera'), { ssr: false })

const INT_PHOTOS = ['interiorDriverDoorPhoto', 'interiorRearDriverDoorPhoto', 'interiorTrunkPhoto', 'interiorRearPassengerDoorPhoto', 'interiorPassengerDoorPhoto', 'dashboardPhoto'] as const
const INT_PHOTO_LABELS = ['Driver Door', 'Rear Driver Door', 'Trunk', 'Rear Passenger Door', 'Passenger Door', 'Dashboard']
const INT_SLOTS = INT_PHOTOS.map((key, i) => ({ key, label: INT_PHOTO_LABELS[i] }))

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
  inspectionId: string
}

function CondPill({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: selected ? 600 : 400,
        border: 'none', cursor: 'pointer',
        background: selected ? '#00B4D8' : '#F0F4F8',
        color: selected ? '#FFFFFF' : '#4A5568',
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

function PhotoSlotCard({ label, value, onTap, failed }: { label: string; value?: string | null; onTap: () => void; failed?: boolean }) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 500, color: '#374151', margin: '0 0 5px' }}>{label}</p>
      {value ? (
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', outline: failed ? '2px solid #F59E0B' : 'none' }}>
          <img src={value} alt={label} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
          {failed && (
            <span style={{
              position: 'absolute', top: 6, left: 6,
              background: '#F59E0B', color: '#FFFFFF',
              fontSize: 9, fontWeight: 700,
              borderRadius: 20, padding: '2px 7px',
            }}>
              ⚠ Retry
            </span>
          )}
          <button
            onClick={onTap}
            style={{
              position: 'absolute', bottom: 6, right: 6,
              background: '#00B4D8', color: '#FFFFFF',
              fontSize: 10, fontWeight: 700,
              borderRadius: 20, padding: '3px 9px',
              border: 'none', cursor: 'pointer',
            }}
          >
            Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onTap}
          style={{
            width: '100%', height: 120,
            background: '#FFFFFF', border: '2px dashed #CBD5E1', borderRadius: 12,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: 'pointer',
          }}
        >
          <Camera size={22} style={{ color: '#94A3B8' }} />
          <span style={{ fontSize: 12, color: '#94A3B8' }}>Tap to capture</span>
        </button>
      )}
    </div>
  )
}

const label13 = { fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 8 } as const

export default function StepInterior({ data, onChange, onNext, onBack, inspectionId }: Props) {
  const [cameraStartKey, setCameraStartKey] = useState<string | null>(null)
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set())

  const set = (key: string, val: any) => onChange({ ...data, [key]: val })

  const openCaptureAll = () => {
    const firstUnfilled = INT_PHOTOS.find(k => !data[k])
    setCameraStartKey(firstUnfilled ?? INT_PHOTOS[0])
  }

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
        {/* Capture All CTA */}
        <button
          type="button"
          onClick={openCaptureAll}
          style={{
            width: '100%', height: 48, borderRadius: 12, border: 'none',
            background: '#00B4D8', color: '#FFFFFF',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 16, boxShadow: '0 4px 12px rgba(0,180,216,0.3)',
          }}
        >
          <Camera size={18} /> Capture All 6 Photos →
        </button>

        {/* 2×3 photo grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {INT_PHOTOS.map((key, i) => (
            <PhotoSlotCard
              key={key}
              label={INT_PHOTO_LABELS[i]}
              value={data[key]}
              onTap={() => setCameraStartKey(key)}
              failed={failedKeys.has(key)}
            />
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
                <CondPill key={opt} label={opt} selected={data[key] === opt} onSelect={() => set(key, opt)} />
              ))}
            </div>
          </div>
        ))}

        {/* Odor */}
        <div style={{ marginBottom: 16 }}>
          <label style={label13}>Odor Present</label>
          <YesNo value={data.interiorOdor} onChange={v => set('interiorOdor', v)} />
        </div>

        {data.interiorOdor === true && (
          <div style={{ marginBottom: 16 }}>
            <label style={label13}>Odor Type</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ODOR_TYPES.map(t => (
                <CondPill key={t} label={t} selected={data.odorType === t} onSelect={() => set('odorType', t)} />
              ))}
            </div>
          </div>
        )}

        {/* Damage entries */}
        <div style={{ marginBottom: 20 }}>
          <DamageEntry damages={data.damages ?? []} onChange={damages => set('damages', damages)} locationType="interior" inspectionId={inspectionId} />
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

      {/* Step-level camera — handles all 6 interior slots with auto-advance */}
      {cameraStartKey && (
        <InspectionCamera
          slots={INT_SLOTS}
          values={data}
          startKey={cameraStartKey}
          inspectionId={inspectionId}
          onCapture={(key, url) => {
            setFailedKeys(prev => { if (!prev.has(key)) return prev; const next = new Set(prev); next.delete(key); return next })
            onChange({ ...data, [key]: url })
          }}
          onUploadError={(key, dataUrl) => {
            setFailedKeys(prev => new Set(prev).add(key))
            onChange({ ...data, [key]: dataUrl })
          }}
          onClose={() => setCameraStartKey(null)}
        />
      )}

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
            Continue to Engine →
          </button>
        </div>
      </div>
    </div>
  )
}

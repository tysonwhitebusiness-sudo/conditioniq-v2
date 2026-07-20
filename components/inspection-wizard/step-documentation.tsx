'use client'

import { useState, useCallback } from 'react'
import { ClipboardList } from 'lucide-react'
import PhotoField from '@/components/ui/photo-field'
import VoiceInput from '@/components/ui/voice-input'
import StepOpener from './step-opener'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
  inspectionId: string
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

const label13 = { fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 } as const

export default function StepDocumentation({ data, onChange, onNext, onBack, inspectionId }: Props) {
  const [scanning, setScanning] = useState(false)
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null)

  const canAdvance = true

  const handlePlatePhotoCapture = useCallback(async (url: string) => {
    onChange({ ...data, licensePlatePhoto: url })
    if (!url) return
    setScanning(true)
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      const { data: result } = await worker.recognize(url)
      await worker.terminate()
      const confidence = result.confidence
      const raw = result.text.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8)
      setOcrConfidence(confidence)
      if (confidence > 50) onChange({ ...data, licensePlatePhoto: url, licensePlate: raw })
    } catch {
      // OCR failed silently
    } finally {
      setScanning(false)
    }
  }, [data, onChange])

  return (
    <div style={{ paddingBottom: 140 }}>
      <StepOpener
        icon={<ClipboardList size={36} style={{ color: '#00B4D8' }} />}
        title="Documentation"
        subtitle="Verify license, registration, and insurance"
        instructionTitle="Document Check"
        instructionText="Record the license plate info and verify registration and insurance documents are present and current."
        complete={canAdvance}
        remainingText=""
      />

      <div style={{ padding: '0 24px' }}>
        {/* License plate + state */}
        <div style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 80px', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={label13}>License Plate</label>
            <input
              value={data.licensePlate ?? ''}
              onChange={e => onChange({ ...data, licensePlate: e.target.value.toUpperCase() })}
              className="step-input"
              placeholder="ABC-1234"
              maxLength={8}
              style={{ fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}
            />
          </div>
          <div>
            <label style={label13}>State</label>
            <select
              value={data.licensePlateState ?? ''}
              onChange={e => onChange({ ...data, licensePlateState: e.target.value })}
              className="step-select"
            >
              <option value="">--</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Plate photo */}
        <div style={{ marginBottom: 4 }}>
          <PhotoField
            label="License Plate Photo"
            value={data.licensePlatePhoto}
            onChange={handlePlatePhotoCapture}
            inspectionId={inspectionId}
            fieldKey="licensePlatePhoto"
          />
        </div>
        {scanning && (
          <p style={{ fontSize: 12, color: '#00B4D8', marginBottom: 16, marginTop: 4 }}>Scanning plate…</p>
        )}
        {ocrConfidence !== null && !scanning && (
          <p style={{ fontSize: 12, marginBottom: 16, marginTop: 4, color: ocrConfidence < 70 ? '#F59E0B' : '#10B981' }}>
            OCR confidence: {Math.round(ocrConfidence)}%{ocrConfidence < 70 ? ' — please verify manually' : ''}
          </p>
        )}

        {/* Registration */}
        <div style={{ marginBottom: 16 }}>
          <label style={label13}>Registration Current</label>
          <YesNo
            value={data.registrationCurrent}
            onChange={v => onChange({ ...data, registrationCurrent: v })}
          />
        </div>
        {data.registrationCurrent === true && (
          <div style={{ marginBottom: 20 }}>
            <PhotoField
              label="Registration Photo"
              value={data.registrationPhoto}
              onChange={url => onChange({ ...data, registrationPhoto: url })}
              inspectionId={inspectionId}
              fieldKey="registrationPhoto"
            />
          </div>
        )}

        {/* Insurance */}
        <div style={{ marginBottom: 16 }}>
          <label style={label13}>Insurance Present</label>
          <YesNo
            value={data.insurancePresent}
            onChange={v => onChange({ ...data, insurancePresent: v })}
          />
        </div>
        {data.insurancePresent === true && (
          <div style={{ marginBottom: 20 }}>
            <PhotoField
              label="Insurance Photo"
              value={data.insurancePhoto}
              onChange={url => onChange({ ...data, insurancePhoto: url })}
              inspectionId={inspectionId}
              fieldKey="insurancePhoto"
            />
          </div>
        )}

        {/* Doc notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={label13}>Documentation Notes</label>
          <div style={{ position: 'relative' }}>
            <textarea
              value={data.docNotes ?? ''}
              onChange={e => onChange({ ...data, docNotes: e.target.value })}
              className="step-textarea"
              placeholder="Notes about documentation..."
              style={{ paddingRight: 44 }}
            />
            <div style={{ position: 'absolute', top: 10, right: 10 }}>
              <VoiceInput onTranscript={t => onChange({ ...data, docNotes: (data.docNotes ?? '') + ' ' + t })} />
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
            Continue to Exterior →
          </button>
        </div>
      </div>
    </div>
  )
}

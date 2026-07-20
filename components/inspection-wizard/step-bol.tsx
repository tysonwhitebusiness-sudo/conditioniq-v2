'use client'

import { FileText } from 'lucide-react'
import PhotoField from '@/components/ui/photo-field'
import VoiceInput from '@/components/ui/voice-input'
import StepOpener from './step-opener'

const QUICK_CHIPS = ['BOL matches vehicle', 'No discrepancies', 'Mileage matches', 'Signatures present', 'Date verified']

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
  inspectionId: string
}

const label13 = { fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 } as const

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

export default function StepBOL({ data, onChange, onNext, onBack, inspectionId }: Props) {
  const bolPresentSet = data.bolPresent !== undefined
  const canAdvance = bolPresentSet

  return (
    <div style={{ paddingBottom: 140 }}>
      <StepOpener
        icon={<FileText size={36} style={{ color: '#00B4D8' }} />}
        title="Bill of Lading"
        subtitle="Document the bill of lading details"
        instructionTitle="BOL Review"
        instructionText="Check the BOL document against the vehicle. Note any discrepancies below."
        complete={canAdvance}
        remainingText="Select whether BOL is present"
      />

      <div style={{ padding: '0 24px' }}>
        <div style={{ marginBottom: 20 }}>
          <label style={label13}>BOL Present <span style={{ color: '#EF4444' }}>*</span></label>
          <YesNo
            value={data.bolPresent}
            onChange={v => onChange({ ...data, bolPresent: v })}
          />
        </div>

        {data.bolPresent === true && (
          <>
            <div style={{ marginBottom: 20 }}>
              <PhotoField
                label="BOL Photo"
                value={data.bolPhoto}
                onChange={url => onChange({ ...data, bolPhoto: url })}
                inspectionId={inspectionId}
                fieldKey="bolPhoto"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={label13}>BOL Notes</label>
              <div style={{ position: 'relative' }}>
                <textarea
                  value={data.bolNotes ?? ''}
                  onChange={e => onChange({ ...data, bolNotes: e.target.value })}
                  className="step-textarea"
                  placeholder="Any discrepancies or notes about the BOL..."
                  style={{ paddingRight: 44 }}
                />
                <div style={{ position: 'absolute', top: 10, right: 10 }}>
                  <VoiceInput onTranscript={t => onChange({ ...data, bolNotes: (data.bolNotes ?? '') + ' ' + t })} />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {QUICK_CHIPS.map(chip => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => onChange({ ...data, bolNotes: ((data.bolNotes ?? '') + ' ' + chip).trim() })}
                    style={{
                      padding: '4px 12px', background: '#F0F4F8', color: '#4A5568',
                      borderRadius: 20, fontSize: 12, border: '1px solid #E1E8F0', cursor: 'pointer',
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
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
            Select whether BOL is present
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
              background: canAdvance ? '#00B4D8' : '#E1E8F0',
              color: canAdvance ? '#FFFFFF' : '#94A3B8',
              boxShadow: canAdvance ? '0 4px 12px rgba(0,180,216,0.3)' : 'none',
            }}
          >
            Continue to Keys →
          </button>
        </div>
      </div>
    </div>
  )
}

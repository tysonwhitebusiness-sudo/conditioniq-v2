'use client'

import { Key, Minus, Plus } from 'lucide-react'
import PhotoField from '@/components/ui/photo-field'
import StepOpener from './step-opener'

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 12, padding: '16px 20px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: 15, fontWeight: 500, color: '#0D1B2A' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          style={{
            width: 44, height: 44, borderRadius: 22,
            background: '#FFFFFF', border: '1.5px solid #E1E8F0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Minus size={18} color="#4A5568" />
        </button>
        <span style={{ fontSize: 32, fontWeight: 700, color: '#0D1B2A', width: 32, textAlign: 'center', lineHeight: 1 }}>
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          style={{
            width: 44, height: 44, borderRadius: 22,
            background: '#FFFFFF', border: '1.5px solid #E1E8F0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Plus size={18} color="#00B4D8" />
        </button>
      </div>
    </div>
  )
}

export default function StepKeys({ data, onChange, onNext, onBack }: Props) {
  return (
    <div style={{ paddingBottom: 140 }}>
      <StepOpener
        icon={<Key size={36} style={{ color: '#00B4D8' }} />}
        title="Keys & FOBs"
        subtitle="Count and document all keys and key fobs"
        instructionTitle="Key Count"
        instructionText="Count all mechanical keys and key fobs present with the vehicle."
        complete={true}
        remainingText=""
      />

      <div style={{ padding: '0 24px' }}>
        <div style={{ marginBottom: 16 }}>
          <Counter
            label="Mechanical Keys"
            value={data.mechanicalKeys ?? 0}
            onChange={v => onChange({ ...data, mechanicalKeys: v })}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <Counter
            label="Key FOBs"
            value={data.keyFobs ?? 0}
            onChange={v => onChange({ ...data, keyFobs: v })}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <PhotoField
            label="Keys Photo"
            value={data.keysPhoto}
            onChange={url => onChange({ ...data, keysPhoto: url })}
          />
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
            Continue to Functions →
          </button>
        </div>
      </div>
    </div>
  )
}

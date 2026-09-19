'use client'

import { X, ChevronLeft } from 'lucide-react'
import type { DamageAreaCode, DamageTypeCode, DamageSeverityCode } from '@/lib/damage-actions'

// Phase 11: the Area -> Type -> Severity bottom sheet, extracted verbatim out
// of damage-tagger.tsx (2D) so the 3D tagger can use the exact same picker
// flow rather than a re-implementation that could drift from it — the locked
// requirement is that 3D's picker works "exactly like 2D." JSX/styles below
// are unchanged from their prior inline form in damage-tagger.tsx; only the
// state/handlers moved from closures to props.

export type PickerStep = 'area' | 'type' | 'severity' | null

const STEP_LABEL: Record<Exclude<PickerStep, null>, string> = {
  area: 'Where?', type: 'What kind?', severity: 'How severe?',
}

export interface DamagePickerSheetProps {
  pickerStep: PickerStep
  areaCodes: DamageAreaCode[]
  typeCodes: DamageTypeCode[]
  severityCodes: DamageSeverityCode[]
  pickedArea: DamageAreaCode | null
  pickedType: DamageTypeCode | null
  saving: boolean
  onPickArea: (area: DamageAreaCode) => void
  onPickType: (type: DamageTypeCode) => void
  onPickSeverity: (severity: DamageSeverityCode) => void
  onBack: () => void
  onCancel: () => void
}

export default function DamagePickerSheet({
  pickerStep, areaCodes, typeCodes, severityCodes, pickedArea, pickedType, saving,
  onPickArea, onPickType, onPickSeverity, onBack, onCancel,
}: DamagePickerSheetProps) {
  if (!pickerStep) return null

  // Group area codes by category for the picker — readability only, no logic
  // keys off the grouping (matches the AIAG reference table's own comment).
  const areasByCategory = areaCodes.reduce<Record<string, DamageAreaCode[]>>((acc, a) => {
    (acc[a.category] ??= []).push(a)
    return acc
  }, {})

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={onCancel} className="ciq-fade" style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.5)' }} />
      <div className="ciq-sheet" style={{
        position: 'relative', background: '#FFFFFF', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, maxHeight: '75vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 32px rgba(13,27,42,0.2)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E1E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {pickerStep !== 'area' && (
              <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                <ChevronLeft size={18} color="#94A3B8" />
              </button>
            )}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#00B4D8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                {STEP_LABEL[pickerStep]}
              </p>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: '2px 0 0' }}>
                {pickerStep === 'area' && 'Select area'}
                {pickerStep === 'type' && 'Select damage type'}
                {pickerStep === 'severity' && 'Select severity'}
              </h3>
            </div>
          </div>
          <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <X size={18} color="#94A3B8" />
          </button>
        </div>

        {(pickedArea || pickedType) && (
          <div style={{ padding: '8px 20px 0', display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
            {pickedArea && <span style={{ fontSize: 11, fontWeight: 600, color: '#0097B2', background: '#E0F7FC', borderRadius: 20, padding: '3px 10px' }}>{pickedArea.label}</span>}
            {pickedType && <span style={{ fontSize: 11, fontWeight: 600, color: '#0097B2', background: '#E0F7FC', borderRadius: 20, padding: '3px 10px' }}>{pickedType.label}</span>}
          </div>
        )}

        <div key={pickerStep} className="ciq-fade" style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          {pickerStep === 'area' && Object.entries(areasByCategory).map(([category, areas]) => (
            <div key={category} style={{ marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '8px 12px 4px' }}>
                {category}
              </p>
              {areas.map(area => (
                <button key={area.id} onClick={() => onPickArea(area)} style={pickerRowStyle}>
                  {area.label}
                </button>
              ))}
            </div>
          ))}

          {pickerStep === 'type' && typeCodes.map(type => (
            <button key={type.id} onClick={() => onPickType(type)} style={pickerRowStyle}>
              {type.label}
            </button>
          ))}

          {pickerStep === 'severity' && severityCodes.map(severity => (
            <button key={severity.id} onClick={() => onPickSeverity(severity)} disabled={saving} style={{ ...pickerRowStyle, opacity: saving ? 0.5 : 1 }}>
              {severity.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const pickerRowStyle: React.CSSProperties = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '11px 16px', background: 'none', border: 'none',
  fontSize: 14, color: '#0D1B2A', cursor: 'pointer', fontFamily: 'inherit',
  borderRadius: 8,
}

'use client'

import { useState, useCallback } from 'react'
import { CheckCircle, AlertTriangle, ChevronRight, WifiOff, Car, FileText, Key, Settings, ClipboardList, Eye, Wrench } from 'lucide-react'
import { calculateVehicleScore } from '@/lib/vehicle-score'
import { getQualityIssues } from '@/lib/quality-check'
import { useAuth } from '@/contexts/auth-context'
import SignaturePad from '@/components/ui/signature-pad'
import StepOpener from './step-opener'

type StepId = 'vehicle-info' | 'bol' | 'keys' | 'function' | 'documentation' | 'exterior' | 'interior' | 'engine' | 'review'

interface Props {
  inspectionId: string
  inspectionData: Record<string, any>
  onComplete: (signature: string) => Promise<void>
  onBack: () => void
  onGoToStep?: (stepId: StepId) => void
}

const GRADE_COLORS: Record<string, string> = {
  'A+': '#10B981', 'A': '#10B981', 'B+': '#00B4D8', 'B': '#00B4D8',
  'C+': '#F59E0B', 'C': '#F59E0B', 'D': '#EF4444', 'F': '#EF4444',
}

const SECTION_CARDS: { id: StepId; label: string; icon: React.ReactNode; dataKey: string }[] = [
  { id: 'vehicle-info', label: 'Vehicle Info', icon: <Car size={18} color="#00B4D8" />, dataKey: 'vehicleInfo' },
  { id: 'bol', label: 'Bill of Lading', icon: <FileText size={18} color="#00B4D8" />, dataKey: 'bol_data' },
  { id: 'keys', label: 'Keys & FOBs', icon: <Key size={18} color="#00B4D8" />, dataKey: 'keys_data' },
  { id: 'function', label: 'Vehicle Function', icon: <Settings size={18} color="#00B4D8" />, dataKey: 'vehicle_function_data' },
  { id: 'documentation', label: 'Documentation', icon: <ClipboardList size={18} color="#00B4D8" />, dataKey: 'documentation_data' },
  { id: 'exterior', label: 'Exterior', icon: <Eye size={18} color="#00B4D8" />, dataKey: 'exterior_data' },
  { id: 'interior', label: 'Interior', icon: <Car size={18} color="#00B4D8" />, dataKey: 'interior_data' },
  { id: 'engine', label: 'Engine', icon: <Wrench size={18} color="#00B4D8" />, dataKey: 'engine_data' },
]

function sectionSummary(id: StepId, data: Record<string, any>): string {
  switch (id) {
    case 'vehicle-info': {
      const v = data.vehicleInfo
      if (!v?.vin) return 'Not started'
      return [v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin
    }
    case 'bol': {
      const b = data.bol_data
      if (b?.bolPresent === undefined) return 'Not reviewed'
      return b.bolPresent ? 'BOL Present' : 'No BOL'
    }
    case 'keys': {
      const k = data.keys_data
      const keys = (k?.mechanicalKeys ?? 0) + (k?.keyFobs ?? 0)
      return `${keys} key${keys !== 1 ? 's' : ''} total`
    }
    case 'function': {
      const tests = data.vehicle_function_data?.tests ?? {}
      const total = Object.keys(tests).length
      const passed = Object.values(tests).filter(v => v === 'pass').length
      const failed = Object.values(tests).filter(v => v === 'fail').length
      if (!total) return 'Not tested'
      return `${passed} pass · ${failed} fail`
    }
    case 'documentation': {
      const d = data.documentation_data
      const plate = d?.licensePlate ?? ''
      return plate || 'Not documented'
    }
    case 'exterior': {
      const e = data.exterior_data
      const photos = ['exteriorFrontPhoto', 'exteriorRearPhoto', 'exteriorDriverPhoto', 'exteriorPassengerPhoto'].filter(k => e?.[k]).length
      return `${photos}/4 photos · ${e?.overallCondition ?? 'not rated'}`
    }
    case 'interior': {
      const i = data.interior_data
      return i?.overallCondition ?? 'Not rated'
    }
    case 'engine': {
      const e = data.engine_data
      const hasPhoto = !!e?.engineBayPhoto
      const leaks = e?.visibleLeaks ? 'leaks noted' : ''
      return [hasPhoto ? 'Photo captured' : 'No photo', leaks].filter(Boolean).join(' · ') || 'Not inspected'
    }
    default:
      return ''
  }
}

export default function StepReview({ inspectionId, inspectionData, onComplete, onBack, onGoToStep }: Props) {
  const { isOwnerUser } = useAuth()
  const [signature, setSignature] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scoreResult = calculateVehicleScore(inspectionData)
  const qualityIssues = getQualityIssues(inspectionData)
  const blockingIssues = qualityIssues.filter(i => i.type === 'blocking')
  const warnings = qualityIssues.filter(i => i.type === 'warning')
  const hasBlocking = !isOwnerUser && blockingIssues.length > 0

  const gradeColor = GRADE_COLORS[scoreResult.grade] ?? '#94A3B8'
  const canSubmit = !!signature && !hasBlocking && !submitting

  const tests = inspectionData.vehicle_function_data?.tests ?? {}
  const passCount = Object.values(tests).filter(v => v === 'pass').length
  const failCount = Object.values(tests).filter(v => v === 'fail').length
  const allDamages = [
    ...(inspectionData.exterior_data?.damages ?? []),
    ...(inspectionData.interior_data?.damages ?? []),
  ]

  const handleSubmit = useCallback(async () => {
    if (!signature) { setError('Please sign before submitting'); return }
    if (hasBlocking) return
    setSubmitting(true)
    setError(null)
    try {
      // Safety net: SignaturePad uploads in the background on every stroke-end,
      // but a fast tap here could beat that upload to completion. Never submit
      // a base64 signature — if it's still raw, upload it now before proceeding.
      let finalSignature = signature
      if (finalSignature.startsWith('data:')) {
        const { uploadInspectionPhoto } = await import('@/lib/inspection-server-actions')
        finalSignature = await uploadInspectionPhoto(inspectionId, finalSignature, 'signature')
      }
      await onComplete(finalSignature)
    } catch (e: any) {
      setError(e.message ?? 'Failed to complete inspection')
    } finally {
      setSubmitting(false)
    }
  }, [signature, hasBlocking, onComplete, inspectionId])

  return (
    <div style={{ paddingBottom: 140 }}>
      <StepOpener
        icon={<CheckCircle size={36} style={{ color: '#00B4D8' }} />}
        title="Review & Submit"
        subtitle="Review all sections and sign to complete"
        instructionTitle="Final Review"
        instructionText="Tap any section to go back and make changes. Sign at the bottom to submit the inspection."
        complete={canSubmit}
        remainingText={!signature ? 'Signature required' : hasBlocking ? 'Resolve blocking issues' : ''}
      />

      <div style={{ padding: '0 24px' }}>
        {/* Score preview card */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 36, border: `3px solid ${gradeColor}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: gradeColor, lineHeight: 1 }}>{scoreResult.grade}</span>
              <span style={{ fontSize: 11, color: '#94A3B8' }}>{scoreResult.score}/100</span>
            </div>
            <div>
              <p style={{ fontSize: 16, fontWeight: 600, color: '#0D1B2A', marginBottom: 2 }}>{scoreResult.description}</p>
              <p style={{ fontSize: 13, color: '#94A3B8' }}>Market impact: {scoreResult.marketImpact}</p>
            </div>
          </div>

          {/* Category bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { label: 'Exterior', score: scoreResult.breakdown.exterior, max: 25 },
              { label: 'Interior', score: scoreResult.breakdown.interior, max: 20 },
              { label: 'Mechanical', score: scoreResult.breakdown.mechanical, max: 30 },
              { label: 'Documentation', score: scoreResult.breakdown.documentation, max: 15 },
              { label: 'Mileage', score: scoreResult.breakdown.mileage, max: 10 },
            ].map(cat => (
              <div key={cat.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: '#94A3B8', width: 90 }}>{cat.label}</span>
                <div style={{ flex: 1, height: 6, background: '#F0F4F8', borderRadius: 3 }}>
                  <div style={{ height: 6, borderRadius: 3, background: gradeColor, width: `${(cat.score / cat.max) * 100}%` }} />
                </div>
                <span style={{ fontSize: 12, color: '#4A5568', width: 36, textAlign: 'right' }}>{cat.score}/{cat.max}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'Pass', value: passCount, color: '#10B981' },
            { label: 'Fail', value: failCount, color: '#EF4444' },
            { label: 'Damage', value: allDamages.length, color: '#F59E0B' },
            { label: 'Steps', value: 8, color: '#00B4D8' },
          ].map(stat => (
            <div key={stat.label} style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 12, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Section review cards */}
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', marginBottom: 10 }}>Inspection Sections</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {SECTION_CARDS.map(section => (
            <button
              key={section.id}
              type="button"
              onClick={() => onGoToStep?.(section.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 12,
                padding: '14px 16px', width: '100%', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, background: '#E0F7FC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {section.icon}
                </div>
                <div style={{ textAlign: 'left' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', marginBottom: 2 }}>{section.label}</p>
                  <p style={{ fontSize: 12, color: '#94A3B8' }}>{sectionSummary(section.id, inspectionData)}</p>
                </div>
              </div>
              <ChevronRight size={18} color="#94A3B8" />
            </button>
          ))}
        </div>

        {/* Offline notice */}
        {typeof navigator !== 'undefined' && !navigator.onLine && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 13, color: '#92400E' }}>
            <WifiOff size={16} /> Offline — will sync when reconnected
          </div>
        )}

        {/* Blocking issues */}
        {blockingIssues.length > 0 && !isOwnerUser && (
          <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <AlertTriangle size={16} /> Required before signing
            </p>
            {blockingIssues.map((issue, i) => (
              <p key={i} style={{ fontSize: 13, color: '#EF4444', marginLeft: 10 }}>• {issue.message}</p>
            ))}
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#92400E', marginBottom: 8 }}>Warnings</p>
            {warnings.map((w, i) => (
              <p key={i} style={{ fontSize: 13, color: '#F59E0B', marginLeft: 10 }}>• {w.message}</p>
            ))}
          </div>
        )}

        {/* Signature */}
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', marginBottom: 10 }}>
            Inspector Signature <span style={{ color: '#EF4444' }}>*</span>
          </h3>
          <SignaturePad onSignature={setSignature} inspectionId={inspectionId} />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 12 }}>{error}</p>
        )}

        {scoreResult.recommendations.length > 0 && (
          <div style={{ background: '#F0F4F8', borderRadius: 12, padding: 14, marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#4A5568', marginBottom: 8 }}>Recommendations</p>
            {scoreResult.recommendations.map((rec, i) => (
              <p key={i} style={{ fontSize: 13, color: '#4A5568', marginLeft: 8, marginBottom: 4 }}>• {rec}</p>
            ))}
          </div>
        )}
      </div>

      {/* Fixed bottom bar — no back button, full-width submit */}
      <div className="wizard-bottom-bar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#FFFFFF', borderTop: '1px solid #E1E8F0',
        padding: '12px 20px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}>
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{
            width: '100%', height: 52, borderRadius: 12, border: 'none',
            fontWeight: 700, fontSize: 15, cursor: canSubmit ? 'pointer' : 'not-allowed',
            background: canSubmit ? '#00B4D8' : '#E1E8F0',
            color: canSubmit ? '#FFFFFF' : '#94A3B8',
            boxShadow: canSubmit ? '0 4px 12px rgba(0,180,216,0.3)' : 'none',
          }}
        >
          {submitting ? 'Generating report…' : 'Submit Inspection →'}
        </button>
      </div>
    </div>
  )
}

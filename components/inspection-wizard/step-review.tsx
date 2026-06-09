'use client'

import { useState, useCallback } from 'react'
import { calculateVehicleScore } from '@/lib/vehicle-score'
import { getQualityIssues } from '@/lib/quality-check'
import { useAuth } from '@/contexts/auth-context'
import SignaturePad from '@/components/ui/signature-pad'
import { AlertTriangle, CheckCircle, Clock, WifiOff } from 'lucide-react'

interface Props {
  inspectionData: Record<string, any>
  onComplete: (signature: string) => Promise<void>
  onBack: () => void
}

const GRADE_COLORS: Record<string, string> = {
  'A+': '#16a34a', 'A': '#22c55e', 'B+': '#2563eb', 'B': '#3b82f6',
  'C+': '#d97706', 'C': '#f59e0b', 'D': '#ef4444', 'F': '#dc2626',
}

const STEPS = ['Vehicle Info', 'BOL', 'Keys', 'Function', 'Documentation', 'Exterior', 'Interior', 'Engine']

export default function StepReview({ inspectionData, onComplete, onBack }: Props) {
  const { isOwnerUser } = useAuth()
  const [signature, setSignature] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allData = {
    vehicleInfo: inspectionData.vehicleInfo,
    bol_data: inspectionData.bol_data,
    keys_data: inspectionData.keys_data,
    vehicle_function_data: inspectionData.vehicle_function_data,
    documentation_data: inspectionData.documentation_data,
    exterior_data: inspectionData.exterior_data,
    interior_data: inspectionData.interior_data,
    engine_data: inspectionData.engine_data,
  }

  const scoreResult = calculateVehicleScore(allData)
  const qualityIssues = getQualityIssues(allData)
  const blockingIssues = qualityIssues.filter(i => i.type === 'blocking')
  const warnings = qualityIssues.filter(i => i.type === 'warning')
  const hasBlocking = !isOwnerUser && blockingIssues.length > 0

  const gradeColor = GRADE_COLORS[scoreResult.grade] ?? '#6b7280'

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
      await onComplete(signature)
    } catch (e: any) {
      setError(e.message ?? 'Failed to complete inspection')
    } finally {
      setSubmitting(false)
    }
  }, [signature, hasBlocking, onComplete])

  return (
    <div className="space-y-6 pb-32">
      {/* Score Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center border-4" style={{ borderColor: gradeColor }}>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: gradeColor }}>{scoreResult.grade}</div>
              <div className="text-xs text-gray-500">{scoreResult.score}/100</div>
            </div>
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-lg">{scoreResult.description}</p>
            <p className="text-sm text-gray-500">Market impact: {scoreResult.marketImpact}</p>
          </div>
        </div>

        {/* Category bars */}
        <div className="space-y-2">
          {[
            { label: 'Exterior', score: scoreResult.breakdown.exterior, max: 25 },
            { label: 'Interior', score: scoreResult.breakdown.interior, max: 20 },
            { label: 'Mechanical', score: scoreResult.breakdown.mechanical, max: 30 },
            { label: 'Documentation', score: scoreResult.breakdown.documentation, max: 15 },
            { label: 'Mileage', score: scoreResult.breakdown.mileage, max: 10 },
          ].map(cat => (
            <div key={cat.label} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-28">{cat.label}</span>
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{ width: `${(cat.score / cat.max) * 100}%`, backgroundColor: gradeColor }}
                />
              </div>
              <span className="text-xs text-gray-600 w-10 text-right">{cat.score}/{cat.max}</span>
            </div>
          ))}
        </div>

        {/* Recommendations */}
        {scoreResult.recommendations.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recommendations</p>
            {scoreResult.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-orange-500 mt-0.5">•</span>
                {rec}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Tests Pass', value: passCount, color: 'text-green-600' },
          { label: 'Tests Fail', value: failCount, color: 'text-red-600' },
          { label: 'Damages', value: allDamages.length, color: 'text-orange-600' },
          { label: 'Steps', value: STEPS.length, color: 'text-blue-600' },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-50 rounded-xl p-3 text-center">
            <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Vehicle Summary */}
      <div className="bg-gray-50 rounded-2xl p-4 text-sm space-y-1">
        {[
          ['VIN', inspectionData.vehicleInfo?.vin],
          ['Vehicle', `${inspectionData.vehicleInfo?.year ?? ''} ${inspectionData.vehicleInfo?.make ?? ''} ${inspectionData.vehicleInfo?.model ?? ''}`.trim()],
          ['Odometer', inspectionData.vehicleInfo?.odometer ? `${inspectionData.vehicleInfo.odometer} mi` : null],
          ['Location', inspectionData.vehicleInfo?.location],
        ].filter(([, v]) => v).map(([k, v]) => (
          <div key={String(k)} className="flex justify-between">
            <span className="text-gray-500">{k}</span>
            <span className="font-medium">{v}</span>
          </div>
        ))}
      </div>

      {/* Damage summary */}
      {allDamages.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Damage Report</h3>
          <div className="space-y-2">
            {allDamages.map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                <div className={`w-2 h-2 rounded-full ${d.severity === 'critical' ? 'bg-red-900' : d.severity === 'major' ? 'bg-red-500' : d.severity === 'moderate' ? 'bg-orange-400' : 'bg-yellow-400'}`} />
                <span className="text-sm capitalize">{d.type?.replace('_', ' ')}</span>
                <span className="text-xs text-gray-500 capitalize">{d.location?.replace(/_/g, ' ')}</span>
                <span className="text-xs text-gray-400 ml-auto capitalize">{d.severity}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Offline notice */}
      {typeof navigator !== 'undefined' && !navigator.onLine && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm text-yellow-700">
          <WifiOff size={16} /> You're offline. The report will be saved locally and synced when you reconnect.
        </div>
      )}

      {/* Quality issues */}
      {blockingIssues.length > 0 && !isOwnerUser && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-red-700 flex items-center gap-2"><AlertTriangle size={16} /> Required before signing</p>
          {blockingIssues.map((issue, i) => (
            <p key={i} className="text-sm text-red-600 ml-5">• {issue.message}</p>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-yellow-700">Warnings</p>
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-yellow-600 ml-3">• {w.message}</p>
          ))}
        </div>
      )}

      {/* Signature */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Inspector Signature <span className="text-red-500">*</span></h3>
        <SignaturePad onSignature={setSignature} />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3">
        <button onClick={onBack} className="flex-1 py-4 rounded-2xl border border-gray-200 text-gray-700 font-semibold">Back</button>
        <button
          onClick={handleSubmit}
          disabled={!signature || hasBlocking || submitting}
          className="flex-1 py-4 rounded-2xl bg-[#dc5010] text-white font-semibold disabled:opacity-40"
        >
          {submitting ? 'Generating...' : 'Sign & Generate Report'}
        </button>
      </div>
    </div>
  )
}

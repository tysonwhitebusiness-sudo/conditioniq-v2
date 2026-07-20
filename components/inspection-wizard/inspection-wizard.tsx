'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft, Car, X } from 'lucide-react'
import { updateInspectionOfflineAware } from '@/lib/offline-sync'
import { completeInspection, abandonInspection } from '@/lib/usage-actions'
import { useAuth } from '@/contexts/auth-context'
import { buildCustodyRecord, captureGPS } from '@/lib/chain-of-custody'
import { insertAuditEntry } from '@/lib/audit-trail'
import { calculateVehicleScore } from '@/lib/vehicle-score'

import StepVehicleInfo from './step-vehicle-info'
import StepBOL from './step-bol'
import StepKeys from './step-keys'
import StepFunction from './step-function'
import StepDocumentation from './step-documentation'
import StepExterior from './step-exterior'
import StepInterior from './step-interior'
import StepEngine from './step-engine'
import StepReview from './step-review'

export type StepId = 'vehicle-info' | 'bol' | 'keys' | 'function' | 'documentation' | 'exterior' | 'interior' | 'engine' | 'review'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'vehicle-info', label: 'Vehicle Info' },
  { id: 'bol', label: 'Bill of Lading' },
  { id: 'keys', label: 'Keys & FOBs' },
  { id: 'function', label: 'Vehicle Function' },
  { id: 'documentation', label: 'Documentation' },
  { id: 'exterior', label: 'Exterior' },
  { id: 'interior', label: 'Interior' },
  { id: 'engine', label: 'Engine' },
  { id: 'review', label: 'Review & Submit' },
]

interface Props {
  inspectionId: string
  initialData?: Record<string, any>
  inspectorId?: string
  onComplete: (inspectionData: Record<string, any>) => void
  onCancel?: () => void
  initialStep?: StepId
  isRemote?: boolean
  onStepChange?: (stepNum: number) => void
  sidebarWidth?: number
}

export default function InspectionWizard({ inspectionId, initialData, inspectorId, onComplete, onCancel, initialStep, onStepChange, sidebarWidth = 0 }: Props) {
  const { effectiveCompany } = useAuth()
  const [currentStep, setCurrentStep] = useState<StepId>(initialStep ?? 'vehicle-info')
  const [data, setData] = useState<Record<string, Record<string, any>>>({
    vehicleInfo: initialData?.vehicleInfo ?? initialData ?? {},
    bol_data: initialData?.bol_data ?? {},
    keys_data: initialData?.keys_data ?? {},
    vehicle_function_data: initialData?.vehicle_function_data ?? {},
    documentation_data: initialData?.documentation_data ?? {},
    exterior_data: initialData?.exterior_data ?? {},
    interior_data: initialData?.interior_data ?? {},
    engine_data: initialData?.engine_data ?? {},
  })
  const [startedAt] = useState(Date.now())
  const [gpsStart, setGpsStart] = useState<any>(null)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showVinCard, setShowVinCard] = useState(false)

  useEffect(() => {
    captureGPS().then(gps => { if (gps) setGpsStart(gps) })
  }, [])

  const stepIndex = STEPS.findIndex(s => s.id === currentStep)

  useEffect(() => {
    onStepChange?.(stepIndex + 1)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex])

  const saveStep = useCallback(async (stepKey: string, stepData: Record<string, any>) => {
    const updates: Record<string, any> = {
      [stepKey]: stepData,
      last_active_at: new Date().toISOString(),
    }
    if (stepKey === 'vehicleInfo') {
      Object.assign(updates, {
        vin: stepData.vin,
        make: stepData.make,
        model: stepData.model,
        year: stepData.year,
        asset_id: stepData.assetId,
        odometer: stepData.odometer,
        location: stepData.location,
        inspection_type: stepData.inspectionType ?? 'standard',
      })
    }
    await updateInspectionOfflineAware(inspectionId, updates)
  }, [inspectionId])

  const updateStepData = useCallback((stepKey: string, stepData: Record<string, any>) => {
    setData(prev => ({ ...prev, [stepKey]: stepData }))
  }, [])

  const goNext = useCallback(async (stepKey: string, stepData: Record<string, any>) => {
    updateStepData(stepKey, stepData)
    await saveStep(stepKey, stepData)
    const idx = STEPS.findIndex(s => s.id === currentStep)
    if (idx < STEPS.length - 1) setCurrentStep(STEPS[idx + 1].id)
  }, [currentStep, updateStepData, saveStep])

  const goBack = useCallback(() => {
    const idx = STEPS.findIndex(s => s.id === currentStep)
    if (idx > 0) setCurrentStep(STEPS[idx - 1].id)
  }, [currentStep])

  const goToStep = useCallback((stepId: StepId) => {
    setCurrentStep(stepId)
  }, [])

  const handleComplete = useCallback(async (signature: string) => {
    const allData = {
      vehicleInfo: data.vehicleInfo,
      bol_data: data.bol_data,
      keys_data: data.keys_data,
      vehicle_function_data: data.vehicle_function_data,
      documentation_data: data.documentation_data,
      exterior_data: data.exterior_data,
      interior_data: data.interior_data,
      engine_data: data.engine_data,
    }

    const scoreResult = calculateVehicleScore(allData)
    const gpsEnd = await captureGPS()

    await Promise.all([
      completeInspection(inspectionId, scoreResult.score),
      updateInspectionOfflineAware(inspectionId, {
        ...allData,
        signature_url: signature,
        signed_at: new Date().toISOString(),
        vehicle_score: scoreResult.score,
        status: 'completed',
        usage_status: 'completed',
      }),
      buildCustodyRecord({
        inspectionId,
        gpsStart,
        gpsEnd,
        signatureUrl: signature,
        formData: { ...data.exterior_data, ...data.interior_data },
      }),
    ])

    if (inspectorId) {
      await insertAuditEntry({
        userId: inspectorId,
        action: 'inspection_completed',
        resourceType: 'inspection',
        resourceId: inspectionId,
        details: { score: scoreResult.score, grade: scoreResult.grade },
      })
    }

    const { generateInspectionPDF } = await import('@/lib/pdf-generator')
    const reportUrl = await generateInspectionPDF({ ...allData, inspectionId, timestamp: new Date().toISOString(), gpsStart }, scoreResult, signature)

    // Save report URL so it can be retrieved from history
    if (reportUrl) {
      const { saveReportUrlAction } = await import('@/lib/inspection-server-actions')
      saveReportUrlAction(inspectionId, reportUrl).catch(e => console.error('[saveReport]', e))
    }

    // Silently sync to storage inventory — never blocks completion
    if (effectiveCompany?.id) {
      const { upsertVehicleToInventory } = await import('@/lib/storage-server-actions')
      const inspectionTypeForEvent = allData.vehicleInfo?.inspectionType ?? 'standard'
      upsertVehicleToInventory(
        inspectionId,
        effectiveCompany.id,
        allData,
        scoreResult,
        inspectionTypeForEvent
      ).then(vehicleId => {
        if (vehicleId) {
          const typeLabel = inspectionTypeForEvent === 'check_in' ? 'Check-in' : inspectionTypeForEvent === 'check_out' ? 'Check-out' : 'Standard'
          import('@/lib/vehicle-events-actions').then(({ logVehicleEvent }) => logVehicleEvent({
            companyId: effectiveCompany.id, vehicleId, eventType: 'inspection_completed',
            description: `${typeLabel} inspection completed`,
            metadata: { inspection_id: inspectionId, score: scoreResult.score, grade: scoreResult.grade },
            createdBy: inspectorId ?? null,
          }))
        }
      }).catch(err => console.error('[storage] upsert failed:', err))
    }

    onComplete({ ...allData, inspectionId, signature, scoreResult })
  }, [data, inspectionId, inspectorId, gpsStart, onComplete])

  const buildAllData = () => ({
    vehicleInfo: data.vehicleInfo,
    bol_data: data.bol_data,
    keys_data: data.keys_data,
    vehicle_function_data: data.vehicle_function_data,
    documentation_data: data.documentation_data,
    exterior_data: data.exterior_data,
    interior_data: data.interior_data,
    engine_data: data.engine_data,
  })

  const vin = data.vehicleInfo?.vin
  const vinDisplay = vin ? `${data.vehicleInfo?.year ?? ''} ${data.vehicleInfo?.make ?? ''} ${data.vehicleInfo?.model ?? ''}`.trim() || vin : '—'

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8' }}>
      {sidebarWidth > 0 && (
        <style>{`.wizard-bottom-bar { left: ${sidebarWidth}px !important; }`}</style>
      )}
      {/* Sticky header — 60px + 4px progress bar */}
      <div className="wizard-header" style={{ position: 'sticky', top: 0, zIndex: 20, background: '#0D1B2A' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
          {/* Back / Cancel */}
          <button
            onClick={() => stepIndex === 0 ? setShowCancelDialog(true) : goBack()}
            style={{
              width: 44, height: 44, borderRadius: 10,
              background: 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: 'pointer',
            }}
          >
            <ChevronLeft size={22} color="white" />
          </button>

          {/* Center */}
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', margin: 0, lineHeight: 1.2 }}>
              {STEPS[stepIndex]?.label}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', margin: 0, marginTop: 2 }}>
              Step {stepIndex + 1} of {STEPS.length}
            </p>
          </div>

          {/* VIN Card trigger */}
          <button
            onClick={() => setShowVinCard(true)}
            style={{
              width: 44, height: 44, borderRadius: 10,
              background: 'rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: 'pointer',
            }}
          >
            <Car size={20} color="white" />
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, background: 'rgba(255,255,255,0.1)' }}>
          <div style={{
            height: 4,
            width: `${((stepIndex + 1) / STEPS.length) * 100}%`,
            background: '#00B4D8',
            transition: 'width 300ms ease',
          }} />
        </div>
      </div>

      <div className="wizard-content" style={{ maxWidth: 600, margin: '0 auto' }}>
        {currentStep === 'vehicle-info' && (
          <StepVehicleInfo
            data={data.vehicleInfo}
            onChange={d => updateStepData('vehicleInfo', d)}
            onNext={() => goNext('vehicleInfo', data.vehicleInfo)}
            inspectionId={inspectionId}
          />
        )}
        {currentStep === 'bol' && (
          <StepBOL
            data={data.bol_data}
            onChange={d => updateStepData('bol_data', d)}
            onNext={() => goNext('bol_data', data.bol_data)}
            onBack={goBack}
            inspectionId={inspectionId}
          />
        )}
        {currentStep === 'keys' && (
          <StepKeys
            data={data.keys_data}
            onChange={d => updateStepData('keys_data', d)}
            onNext={() => goNext('keys_data', data.keys_data)}
            onBack={goBack}
            inspectionId={inspectionId}
          />
        )}
        {currentStep === 'function' && (
          <StepFunction
            data={data.vehicle_function_data}
            onChange={d => updateStepData('vehicle_function_data', d)}
            onNext={() => goNext('vehicle_function_data', data.vehicle_function_data)}
            onBack={goBack}
          />
        )}
        {currentStep === 'documentation' && (
          <StepDocumentation
            data={data.documentation_data}
            onChange={d => updateStepData('documentation_data', d)}
            onNext={() => goNext('documentation_data', data.documentation_data)}
            onBack={goBack}
            inspectionId={inspectionId}
          />
        )}
        {currentStep === 'exterior' && (
          <StepExterior
            data={data.exterior_data}
            onChange={d => updateStepData('exterior_data', d)}
            onNext={() => goNext('exterior_data', data.exterior_data)}
            onBack={goBack}
            inspectionId={inspectionId}
          />
        )}
        {currentStep === 'interior' && (
          <StepInterior
            data={data.interior_data}
            onChange={d => updateStepData('interior_data', d)}
            onNext={() => goNext('interior_data', data.interior_data)}
            onBack={goBack}
            inspectionId={inspectionId}
          />
        )}
        {currentStep === 'engine' && (
          <StepEngine
            data={data.engine_data}
            onChange={d => updateStepData('engine_data', d)}
            onNext={() => goNext('engine_data', data.engine_data)}
            onBack={goBack}
            inspectionId={inspectionId}
          />
        )}
        {currentStep === 'review' && (
          <StepReview
            inspectionId={inspectionId}
            inspectionData={buildAllData()}
            onComplete={handleComplete}
            onBack={goBack}
            onGoToStep={goToStep}
          />
        )}
      </div>

      {/* Cancel dialog */}
      {showCancelDialog && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(13,27,42,0.7)' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 340 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px' }}>Cancel Inspection?</h3>
            <p style={{ fontSize: 14, color: '#4A5568', margin: '0 0 24px' }}>
              This inspection will be cancelled. No report will be charged for cancelled inspections.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowCancelDialog(false)}
                style={{ flex: 1, height: 48, borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FFFFFF', color: '#4A5568', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
              >
                Keep Going
              </button>
              <button
                onClick={() => {
                  setShowCancelDialog(false)
                  abandonInspection(inspectionId).catch(err => console.error('[abandon]', err))
                  onCancel?.()
                }}
                style={{ flex: 1, height: 48, borderRadius: 12, border: 'none', background: '#EF4444', color: '#FFFFFF', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIN card */}
      {showVinCard && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 24px 24px', background: 'rgba(13,27,42,0.5)' }}
          onClick={() => setShowVinCard(false)}
        >
          <div style={{ background: '#FFFFFF', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Vehicle</p>
              <button onClick={() => setShowVinCard(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} color="#94A3B8" />
              </button>
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: '0 0 6px' }}>{vinDisplay}</p>
            {vin && <p style={{ fontSize: 13, color: '#94A3B8', fontFamily: 'monospace', margin: 0 }}>{vin}</p>}
            {!vin && <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>VIN not entered yet</p>}
          </div>
        </div>
      )}
    </div>
  )
}

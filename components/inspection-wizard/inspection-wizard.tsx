'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronLeft } from 'lucide-react'
import { updateInspectionOfflineAware } from '@/lib/offline-sync'
import { completeInspection } from '@/lib/usage-actions'
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

type StepId = 'vehicle-info' | 'bol' | 'keys' | 'function' | 'documentation' | 'exterior' | 'interior' | 'engine' | 'review'

const STEPS: { id: StepId; label: string }[] = [
  { id: 'vehicle-info', label: 'Vehicle Info' },
  { id: 'bol', label: 'BOL' },
  { id: 'keys', label: 'Keys' },
  { id: 'function', label: 'Function' },
  { id: 'documentation', label: 'Docs' },
  { id: 'exterior', label: 'Exterior' },
  { id: 'interior', label: 'Interior' },
  { id: 'engine', label: 'Engine' },
  { id: 'review', label: 'Review' },
]

interface Props {
  inspectionId: string
  initialData?: Record<string, any>
  inspectorId?: string
  onComplete: (inspectionData: Record<string, any>) => void
  initialStep?: StepId
  isRemote?: boolean
}

export default function InspectionWizard({ inspectionId, initialData, inspectorId, onComplete, initialStep }: Props) {
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

  useEffect(() => {
    captureGPS().then(gps => { if (gps) setGpsStart(gps) })
  }, [])

  const stepIndex = STEPS.findIndex(s => s.id === currentStep)

  const saveStep = useCallback(async (stepKey: string, stepData: Record<string, any>) => {
    const updates: Record<string, any> = { [stepKey]: stepData }
    if (stepKey === 'vehicleInfo') {
      Object.assign(updates, {
        vin: stepData.vin,
        make: stepData.make,
        model: stepData.model,
        year: stepData.year,
        asset_id: stepData.assetId,
        odometer: stepData.odometer,
        location: stepData.location,
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
      completeInspection(inspectionId),
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
    await generateInspectionPDF({ ...allData, inspectionId, timestamp: new Date().toISOString(), gpsStart }, scoreResult, signature)

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

  return (
    <div className="min-h-screen bg-white">
      {/* Progress Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="px-4 py-3 flex items-center gap-3">
          {stepIndex > 0 && (
            <button onClick={goBack} className="p-1 -ml-1">
              <ChevronLeft size={24} className="text-gray-600" />
            </button>
          )}
          <div className="flex-1">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>Step {stepIndex + 1} of {STEPS.length}</span>
              <span>{STEPS[stepIndex]?.label}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-[#1e3a5f] h-1.5 rounded-full transition-all"
                style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        {currentStep === 'vehicle-info' && (
          <StepVehicleInfo
            data={data.vehicleInfo}
            onChange={d => updateStepData('vehicleInfo', d)}
            onNext={() => goNext('vehicleInfo', data.vehicleInfo)}
          />
        )}
        {currentStep === 'bol' && (
          <StepBOL
            data={data.bol_data}
            onChange={d => updateStepData('bol_data', d)}
            onNext={() => goNext('bol_data', data.bol_data)}
            onBack={goBack}
          />
        )}
        {currentStep === 'keys' && (
          <StepKeys
            data={data.keys_data}
            onChange={d => updateStepData('keys_data', d)}
            onNext={() => goNext('keys_data', data.keys_data)}
            onBack={goBack}
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
          />
        )}
        {currentStep === 'exterior' && (
          <StepExterior
            data={data.exterior_data}
            onChange={d => updateStepData('exterior_data', d)}
            onNext={() => goNext('exterior_data', data.exterior_data)}
            onBack={goBack}
          />
        )}
        {currentStep === 'interior' && (
          <StepInterior
            data={data.interior_data}
            onChange={d => updateStepData('interior_data', d)}
            onNext={() => goNext('interior_data', data.interior_data)}
            onBack={goBack}
          />
        )}
        {currentStep === 'engine' && (
          <StepEngine
            data={data.engine_data}
            onChange={d => updateStepData('engine_data', d)}
            onNext={() => goNext('engine_data', data.engine_data)}
            onBack={goBack}
          />
        )}
        {currentStep === 'review' && (
          <StepReview
            inspectionData={buildAllData()}
            onComplete={handleComplete}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  )
}

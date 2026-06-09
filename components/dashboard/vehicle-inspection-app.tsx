'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import Dashboard from './dashboard'
import InspectionWizard from '@/components/inspection-wizard/inspection-wizard'
import UsageConfirmationModal from '@/components/ui/usage-confirmation-modal'
import { checkUsageState, initiateInspection } from '@/lib/usage-actions'
import type { UsageState } from '@/lib/usage-actions'

type AppStep = 'start' | 'inspecting' | 'completed' | 'view-report'

const SESSION_KEY = 'vcr_in_progress'

export default function VehicleInspectionApp() {
  const { user, userProfile, effectiveCompany, isOwnerUser } = useAuth()
  const [appStep, setAppStep] = useState<AppStep>('start')
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null)
  const [currentInspectionData, setCurrentInspectionData] = useState<Record<string, any>>({})
  const [usageState, setUsageState] = useState<UsageState | null>(null)
  const [showUsageModal, setShowUsageModal] = useState(false)
  const [startingInspection, setStartingInspection] = useState(false)
  const [pendingQueueItem, setPendingQueueItem] = useState<any>(null)

  // Restore in-progress session
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.inspectionId && parsed.step === 'inspecting') {
          setCurrentInspectionId(parsed.inspectionId)
          setCurrentInspectionData(parsed.data ?? {})
          // Don't auto-resume — let user click resume in dashboard
        }
      }
    } catch { /* ignore */ }
  }, [])

  const saveSession = useCallback((id: string, data: Record<string, any>) => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ inspectionId: id, step: 'inspecting', data }))
    } catch { /* ignore */ }
  }, [])

  const clearSession = useCallback(() => {
    try { sessionStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
  }, [])

  const checkUsageAndShowModal = useCallback(async () => {
    if (!effectiveCompany || isOwnerUser) return true // owners skip
    const state = await checkUsageState(effectiveCompany.id)
    setUsageState(state)
    setShowUsageModal(true)
    return false // will resume after modal confirmation
  }, [effectiveCompany, isOwnerUser])

  const handleStartInspection = useCallback(async (queueItem?: any) => {
    if (!effectiveCompany || !user) return
    if (isOwnerUser) {
      await doStartInspection(queueItem)
      return
    }
    setPendingQueueItem(queueItem ?? null)
    await checkUsageAndShowModal()
  }, [effectiveCompany, user, isOwnerUser, checkUsageAndShowModal])

  const doStartInspection = useCallback(async (queueItem?: any) => {
    if (!effectiveCompany || !user) return
    setStartingInspection(true)
    try {
      const initialData = queueItem ? {
        vehicleInfo: { vin: queueItem.vin, year: queueItem.year, make: queueItem.make, model: queueItem.model }
      } : {}

      const { inspectionId } = await initiateInspection({
        companyId: effectiveCompany.id,
        inspectorId: user.id,
        initialData: queueItem ? {
          vin: queueItem.vin, year: queueItem.year, make: queueItem.make, model: queueItem.model
        } : undefined,
      })

      setCurrentInspectionId(inspectionId)
      setCurrentInspectionData(initialData)
      saveSession(inspectionId, initialData)
      setAppStep('inspecting')
    } catch (e: any) {
      alert('Failed to start inspection: ' + e.message)
    } finally {
      setStartingInspection(false)
      setShowUsageModal(false)
    }
  }, [effectiveCompany, user, saveSession])

  const handleUsageConfirm = useCallback(async () => {
    await doStartInspection(pendingQueueItem)
  }, [pendingQueueItem, doStartInspection])

  const handleInspectionComplete = useCallback((completedData: Record<string, any>) => {
    clearSession()
    setCurrentInspectionData(completedData)
    setAppStep('completed')
  }, [clearSession])

  const handleViewReport = useCallback((inspectionData: Record<string, any>) => {
    setCurrentInspectionData(inspectionData)
    setAppStep('view-report')
  }, [])

  if (appStep === 'inspecting' && currentInspectionId) {
    return (
      <InspectionWizard
        inspectionId={currentInspectionId}
        initialData={currentInspectionData}
        inspectorId={user?.id}
        onComplete={handleInspectionComplete}
      />
    )
  }

  if (appStep === 'completed') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <span className="text-4xl">✓</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Inspection Complete</h2>
        <p className="text-gray-500 mb-8">Report generated and opened in new tab</p>
        {currentInspectionData.scoreResult && (
          <div className="bg-gray-50 rounded-2xl p-6 mb-8 w-full max-w-sm">
            <div className="text-4xl font-bold text-[#1e3a5f] mb-1">{currentInspectionData.scoreResult.grade}</div>
            <div className="text-lg text-gray-600">{currentInspectionData.scoreResult.score}/100</div>
            <div className="text-sm text-gray-500 mt-1">{currentInspectionData.scoreResult.description}</div>
          </div>
        )}
        <button
          onClick={() => { setAppStep('start'); setCurrentInspectionId(null); setCurrentInspectionData({}) }}
          className="w-full max-w-sm py-4 bg-[#1e3a5f] text-white rounded-2xl font-semibold"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <>
      <Dashboard
        onStartInspection={() => handleStartInspection()}
        onResumeInspection={data => {
          setCurrentInspectionId(data.id)
          setCurrentInspectionData(data)
          setAppStep('inspecting')
        }}
        onViewReport={handleViewReport}
      />

      {showUsageModal && usageState && (
        <UsageConfirmationModal
          usageState={usageState}
          onConfirm={handleUsageConfirm}
          onCancel={() => setShowUsageModal(false)}
          loading={startingInspection}
        />
      )}
    </>
  )
}

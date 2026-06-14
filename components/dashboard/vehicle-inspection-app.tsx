'use client'

import { useState, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Lock } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import BottomNav from '@/components/ui/bottom-nav'
import ActionSheet from '@/components/ui/action-sheet'
import HomeDashboard from '@/components/home/home-dashboard'
import QueuePage from '@/components/queue/queue-page'
import ProfilePage from '@/components/profile/profile-page'
import InspectionWizard from '@/components/inspection-wizard/inspection-wizard'
import UsageConfirmationModal from '@/components/ui/usage-confirmation-modal'
import DesktopSidebar from '@/components/layout/desktop-sidebar'
import DesktopTopBar from '@/components/layout/desktop-topbar'
import SendToInspectorSheet from '@/components/ui/send-to-inspector-sheet'
import { checkUsageState, initiateInspection } from '@/lib/usage-actions'
import { getDeviceId } from '@/lib/device-id'
import { checkAndAutoCompleteExpired } from '@/lib/auto-complete'
import type { UsageState } from '@/lib/usage-actions'

type AppStep = 'browse' | 'inspecting' | 'completed'
type NavTab = 'home' | 'queue' | 'history' | 'account'

const SESSION_KEY = 'vcr_in_progress'

const DESKTOP_PAGE_TITLES: Record<NavTab, string> = {
  home: 'Overview',
  queue: 'Inspection Queue',
  history: 'History & Reports',
  account: 'My Profile',
}

export default function VehicleInspectionApp() {
  const { user, effectiveCompany, isOwnerUser } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const searchParams = useSearchParams()
  const [navTab, setNavTab] = useState<NavTab>((searchParams.get('tab') as NavTab) ?? 'home')
  const [appStep, setAppStep] = useState<AppStep>('browse')
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null)
  const [currentInspectionData, setCurrentInspectionData] = useState<Record<string, any>>({})
  const [usageState, setUsageState] = useState<UsageState | null>(null)
  const [showUsageModal, setShowUsageModal] = useState(false)
  const [startingInspection, setStartingInspection] = useState(false)
  const [pendingQueueItem, setPendingQueueItem] = useState<any>(null)
  const [lockedInspection, setLockedInspection] = useState<any>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [showSendSheet, setShowSendSheet] = useState(false)

  useEffect(() => {
    if (effectiveCompany?.id) {
      checkAndAutoCompleteExpired(effectiveCompany.id).catch(() => {})
    }
  }, [effectiveCompany?.id])

  const saveSession = useCallback((id: string, data: Record<string, any>) => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ inspectionId: id, data })) } catch {}
  }, [])

  const clearSession = useCallback(() => {
    try { sessionStorage.removeItem(SESSION_KEY) } catch {}
  }, [])

  const doStartInspection = useCallback(async (queueItem?: any) => {
    if (!effectiveCompany || !user) return
    setStartingInspection(true)
    try {
      const initialData = queueItem
        ? { vehicleInfo: { vin: queueItem.vin, year: queueItem.year, make: queueItem.make, model: queueItem.model } }
        : {}
      const deviceId = getDeviceId()
      const { inspectionId } = await initiateInspection({
        companyId: effectiveCompany.id,
        inspectorId: user.id,
        initialData: queueItem
          ? { vin: queueItem.vin, year: queueItem.year, make: queueItem.make, model: queueItem.model }
          : undefined,
        deviceId,
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

  const handleStartInspection = useCallback(async (queueItem?: any) => {
    if (!effectiveCompany || !user) return
    setPendingQueueItem(queueItem ?? null)
    const state = await checkUsageState(effectiveCompany.id)
    setUsageState(state)
    setShowUsageModal(true)
  }, [effectiveCompany, user, doStartInspection])

  const handleResumeInspection = useCallback(async (data: any) => {
    if (data.locked_at) {
      setLockedInspection(data)
      return
    }
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      await supabase
        .from('vehicle_inspections')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', data.id)
    } catch {}
    setCurrentInspectionId(data.id)
    setCurrentInspectionData(data)
    setAppStep('inspecting')
  }, [])

  const handleInspectionComplete = useCallback((completedData: Record<string, any>) => {
    clearSession()
    setCurrentInspectionData(completedData)
    setAppStep('completed')
  }, [clearSession])

  const handleCancelInspection = useCallback(() => {
    clearSession()
    setAppStep('browse')
    setCurrentInspectionId(null)
    setCurrentInspectionData({})
  }, [clearSession])

  const handleViewReport = useCallback(async (item: any) => {
    if (!item?.id) return
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data } = await supabase
        .from('vehicle_inspections')
        .select('*')
        .eq('id', item.id)
        .single()
      if (!data) return
      const { calculateVehicleScore } = await import('@/lib/vehicle-score')
      const scoreResult = calculateVehicleScore(data)
      const { generateInspectionPDF } = await import('@/lib/pdf-generator')
      await generateInspectionPDF(data, scoreResult, data.signature_url ?? '')
    } catch (e: any) {
      alert('Could not generate report: ' + (e.message ?? 'Unknown error'))
    }
  }, [])

  const handleSendToInspector = useCallback(() => {
    setShowActionSheet(false)
    setShowSendSheet(true)
  }, [])

  // Shared modals rendered in every layout
  const sharedModals = (
    <>
      {showUsageModal && usageState && (
        <UsageConfirmationModal
          usageState={usageState}
          onConfirm={() => doStartInspection(pendingQueueItem)}
          onCancel={() => setShowUsageModal(false)}
          loading={startingInspection}
        />
      )}
      {lockedInspection && (
        <LockedInspectionModal
          inspection={lockedInspection}
          onClose={() => setLockedInspection(null)}
          onViewReport={() => { setLockedInspection(null); handleViewReport(lockedInspection) }}
        />
      )}
      <SendToInspectorSheet
        open={showSendSheet}
        onClose={() => setShowSendSheet(false)}
      />
    </>
  )

  const sidebarWidth = sidebarCollapsed ? 64 : 256

  // ── Inspection in progress ──────────────────────────────────────────────
  if (appStep === 'inspecting' && currentInspectionId) {
    if (isDesktop) {
      return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F4F8' }}>
          <DesktopSidebar
            activeTab={navTab}
            onTabChange={tab => setNavTab(tab as NavTab)}
            onStartInspection={() => handleStartInspection()}
            onSendToInspector={() => setShowSendSheet(true)}
            isInspecting
            collapsed={sidebarCollapsed}
            onCollapseChange={setSidebarCollapsed}
          />
          <div style={{ marginLeft: sidebarWidth, flex: 1, display: 'flex', flexDirection: 'column', transition: 'margin-left 200ms ease' }}>
            <DesktopTopBar pageTitle={`Inspection in Progress — Step ${wizardStep} of 9`} isInspecting sidebarWidth={sidebarWidth} />
            <div style={{ paddingTop: 64 }}>
              <InspectionWizard
                inspectionId={currentInspectionId}
                initialData={currentInspectionData}
                inspectorId={user?.id}
                onComplete={handleInspectionComplete}
                onCancel={handleCancelInspection}
                onStepChange={setWizardStep}
                sidebarWidth={sidebarWidth}
              />
            </div>
          </div>
          {sharedModals}
        </div>
      )
    }
    return (
      <>
        <InspectionWizard
          inspectionId={currentInspectionId}
          initialData={currentInspectionData}
          inspectorId={user?.id}
          onComplete={handleInspectionComplete}
          onCancel={handleCancelInspection}
          onStepChange={setWizardStep}
        />
        {sharedModals}
      </>
    )
  }

  // ── Inspection completed ─────────────────────────────────────────────────
  if (appStep === 'completed') {
    const score = currentInspectionData.scoreResult
    const completedContent = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 32, textAlign: 'center', background: '#F0F4F8' }}>
        <div style={{ width: 80, height: 80, borderRadius: 40, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0D1B2A', margin: '0 0 8px' }}>Inspection Complete</h2>
        <p style={{ color: '#94A3B8', margin: '0 0 32px' }}>Report generated successfully</p>
        {score && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: 24, marginBottom: 32, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: '#0D1B2A' }}>{score.grade}</div>
            <div style={{ fontSize: 20, color: '#94A3B8' }}>{score.score}/100</div>
            <div style={{ fontSize: 14, color: '#94A3B8', marginTop: 8 }}>{score.description}</div>
          </div>
        )}
        <button
          onClick={() => { setAppStep('browse'); setCurrentInspectionId(null); setCurrentInspectionData({}) }}
          style={{ background: '#0D1B2A', color: '#FFFFFF', padding: '14px 32px', borderRadius: 32, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', width: '100%', maxWidth: 360 }}
        >
          Back to Dashboard
        </button>
      </div>
    )

    if (isDesktop) {
      return (
        <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F4F8' }}>
          <DesktopSidebar
            activeTab={navTab}
            onTabChange={tab => setNavTab(tab as NavTab)}
            onStartInspection={() => handleStartInspection()}
            onSendToInspector={() => setShowSendSheet(true)}
            collapsed={sidebarCollapsed}
            onCollapseChange={setSidebarCollapsed}
          />
          <div style={{ marginLeft: sidebarWidth, flex: 1, display: 'flex', flexDirection: 'column', transition: 'margin-left 200ms ease' }}>
            <DesktopTopBar pageTitle="Inspection Complete" sidebarWidth={sidebarWidth} />
            <main style={{ paddingTop: 64, flex: 1 }}>{completedContent}</main>
          </div>
          {sharedModals}
        </div>
      )
    }
    return <>{completedContent}{sharedModals}</>
  }

  // ── Main tab content ─────────────────────────────────────────────────────
  const tabContent = (
    <>
      {navTab === 'home' && (
        <HomeDashboard
          onStartInspection={() => isDesktop ? handleStartInspection() : setShowActionSheet(true)}
          onResumeInspection={handleResumeInspection}
          onViewReport={handleViewReport}
          onGoToQueue={() => setNavTab('queue')}
        />
      )}
      {navTab === 'queue' && (
        <QueuePage
          key="queue"
          initialTab="queue"
          onStartInspection={handleStartInspection}
          onResumeInspection={handleResumeInspection}
          onViewReport={handleViewReport}
        />
      )}
      {navTab === 'history' && (
        <QueuePage
          key="history"
          initialTab="history"
          onStartInspection={handleStartInspection}
          onResumeInspection={handleResumeInspection}
          onViewReport={handleViewReport}
        />
      )}
      {navTab === 'account' && <ProfilePage />}
    </>
  )

  // ── Desktop layout ───────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: '#F0F4F8' }}>
        <DesktopSidebar
          activeTab={navTab}
          onTabChange={tab => setNavTab(tab as NavTab)}
          onStartInspection={() => handleStartInspection()}
          onSendToInspector={() => setShowSendSheet(true)}
          collapsed={sidebarCollapsed}
          onCollapseChange={setSidebarCollapsed}
        />
        <div style={{ marginLeft: sidebarWidth, flex: 1, display: 'flex', flexDirection: 'column', transition: 'margin-left 200ms ease' }}>
          <DesktopTopBar pageTitle={DESKTOP_PAGE_TITLES[navTab]} sidebarWidth={sidebarWidth} />
          <main style={{ paddingTop: 64, flex: 1 }}>
            {tabContent}
          </main>
        </div>
        <ActionSheet
          open={showActionSheet}
          onClose={() => setShowActionSheet(false)}
          onStartInspection={() => handleStartInspection()}
          onSendToInspector={handleSendToInspector}
        />
        {sharedModals}
      </div>
    )
  }

  // ── Mobile layout ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#F0F4F8' }}>
      {tabContent}
      <BottomNav />
      <ActionSheet
        open={showActionSheet}
        onClose={() => setShowActionSheet(false)}
        onStartInspection={() => handleStartInspection()}
        onSendToInspector={handleSendToInspector}
      />
      {sharedModals}
    </div>
  )
}

function LockedInspectionModal({ inspection, onClose, onViewReport }: { inspection: any; onClose: () => void; onViewReport: () => void }) {
  const title = [inspection.year, inspection.make, inspection.model].filter(Boolean).join(' ') || 'Unknown Vehicle'
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 60,
      background: 'rgba(13,27,42,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ background: '#FFFFFF', borderRadius: 20, width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 20px 60px rgba(13,27,42,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={28} color="#EF4444" />
          </div>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', textAlign: 'center', margin: '0 0 8px' }}>
          Inspection Auto-Completed
        </h2>
        <p style={{ fontSize: 14, color: '#4A5568', textAlign: 'center', margin: '0 0 6px', lineHeight: 1.5 }}>
          {title}
        </p>
        <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>
          This inspection was inactive for 24 hours and was automatically completed. You can view the generated report.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onViewReport}
            style={{
              height: 52, borderRadius: 12, border: 'none',
              background: '#F4A62A', color: '#0D1B2A', fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            View Report
          </button>
          <button
            onClick={onClose}
            style={{
              height: 48, borderRadius: 12, background: '#FFFFFF',
              border: '1.5px solid #E1E8F0', color: '#4A5568', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

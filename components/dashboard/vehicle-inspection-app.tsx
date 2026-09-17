'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Lock, ChevronRight, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { PRIMARY, PRIMARY_LIGHT, PRIMARY_PILL_TEXT, WHITE, DANGER, DANGER_LIGHT, SUCCESS_LIGHT, SUCCESS_DARK, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'
import { useMediaQuery } from '@/hooks/use-media-query'
import BottomNav from '@/components/ui/bottom-nav'
import ActionSheet from '@/components/ui/action-sheet'
import HomeDashboard from '@/components/home/home-dashboard'
import DesktopHomeDashboard from '@/components/home/desktop-home-dashboard'
import QueuePage from '@/components/queue/queue-page'
import ProfilePage from '@/components/profile/profile-page'
import InspectionWizard from '@/components/inspection-wizard/inspection-wizard'
import UsageConfirmationModal from '@/components/ui/usage-confirmation-modal'
import DesktopSidebar from '@/components/layout/desktop-sidebar'
import DesktopTopBar from '@/components/layout/desktop-topbar'
import SendLinkSheet from '@/components/dispatch/send-link-sheet'
import StartInspectionSheet, { type InspectionStartSelection } from '@/components/inspections/start-inspection-sheet'
import { takePendingInspectionStart } from '@/lib/pending-inspection-start'
import { checkUsageState, initiateInspection } from '@/lib/usage-actions'
import { getDeviceId } from '@/lib/device-id'
import type { UsageState } from '@/lib/usage-actions'
import { getPlan } from '@/lib/pricing'
import { INSPECTION_STATUSES } from '@/lib/unified-inspections'
import type { StatusFilter } from '@/components/queue/queue-page'

type AppStep = 'browse' | 'inspecting' | 'completed'
type NavTab = 'home' | 'queue' | 'history' | 'account'

const SESSION_KEY = 'vcr_in_progress'

const NAV_TABS: NavTab[] = ['home', 'queue', 'history', 'account']

const DESKTOP_PAGE_TITLES: Record<NavTab, string> = {
  home: 'Dashboard',
  queue: 'Inspection Queue',
  history: 'History & Reports',
  account: 'My Profile',
}

export default function VehicleInspectionApp() {
  const router = useRouter()
  const { user, effectiveCompany, isOwnerUser } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const searchParams = useSearchParams()
  // Pay Per Use has no lot dashboard: its home is the full inspections list.
  const usageBasedHome = !getPlan(effectiveCompany?.subscription_tier).hasPlatform
  const requestedTab = searchParams.get('tab') as NavTab | null
  const [navTab, setNavTab] = useState<NavTab>(requestedTab && NAV_TABS.includes(requestedTab) ? requestedTab : 'home')
  const homeTab: NavTab = usageBasedHome && navTab === 'home' ? 'queue' : navTab
  // Filters carried over from /inspections, which redirects here for Pay Per Use.
  const statusParam = searchParams.get('status')
  const homeFilter: StatusFilter = statusParam && (INSPECTION_STATUSES as string[]).includes(statusParam)
    ? statusParam as StatusFilter
    : 'all'
  const sendParam = searchParams.get('send')
  const [appStep, setAppStep] = useState<AppStep>('browse')
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [showVehiclePicker, setShowVehiclePicker] = useState(false)
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showStartSheet, setShowStartSheet] = useState(false)

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
      // The VIN is settled before the inspection opens (picked or entered on the
      // start sheet), so step 1 shows it locked.
      const initialData = queueItem
        ? { vehicleInfo: { vin: queueItem.vin, year: queueItem.year, make: queueItem.make, model: queueItem.model, _vinLocked: !!queueItem.vin } }
        : {}
      const deviceId = getDeviceId()
      const { inspectionId } = await initiateInspection({
        companyId: effectiveCompany.id,
        inspectorId: user.id,
        initialData: queueItem
          ? { vin: queueItem.vin, year: queueItem.year, make: queueItem.make, model: queueItem.model }
          : undefined,
        vehicleId: queueItem?.vehicleId,
        bodyClass: queueItem?.bodyClass ?? undefined,
        deviceId,
      })
      setCurrentInspectionId(inspectionId)
      setCurrentInspectionData(initialData)
      saveSession(inspectionId, initialData)
      setAppStep('inspecting')
    } catch (e: any) {
      setErrorMsg('Failed to start inspection: ' + e.message)
    } finally {
      setStartingInspection(false)
      setShowUsageModal(false)
    }
  }, [effectiveCompany, user, saveSession])

  // Every full inspection starts from a vehicle: without one, the start sheet
  // asks for it first (pick from inventory, or enter a VIN).
  const handleStartInspection = useCallback(async (queueItem?: any) => {
    if (!effectiveCompany || !user) return
    if (!queueItem?.vin) {
      setShowStartSheet(true)
      return
    }
    setPendingQueueItem(queueItem)
    const state = await checkUsageState(effectiveCompany.id)
    setUsageState(state)
    setShowUsageModal(true)
  }, [effectiveCompany, user, doStartInspection])

  // ?start=1 opens the start flow: from the Pay Per Use bottom nav (no lot screen
  // to add a vehicle from), or from the /inspections page after a vehicle was
  // chosen there, in which case the choice is waiting in session storage.
  const startParam = searchParams.get('start')
  const startHandled = useRef(false)
  useEffect(() => {
    if (startParam !== '1') { startHandled.current = false; return }
    if (startHandled.current || !effectiveCompany || !user) return
    startHandled.current = true
    router.replace('/')
    handleStartInspection(takePendingInspectionStart() ?? undefined)
  }, [startParam, effectiveCompany, user, router, handleStartInspection])

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
      setErrorMsg('Could not generate report: ' + (e.message ?? 'Unknown error'))
    }
  }, [])

  const handleSendToInspector = useCallback(() => {
    setShowActionSheet(false)
    setShowSendSheet(true)
  }, [])

  // Shared modals rendered in every layout
  const sharedModals = (
    <>
      {showVehiclePicker && (
        <VehiclePickerSheet
          companyId={effectiveCompany?.id ?? ''}
          onClose={() => setShowVehiclePicker(false)}
          onSelect={vehicleId => { setShowVehiclePicker(false); router.push(`/inventory/${vehicleId}`) }}
        />
      )}
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
      <SendLinkSheet
        isOpen={showSendSheet}
        onClose={() => setShowSendSheet(false)}
      />
      <StartInspectionSheet
        isOpen={showStartSheet}
        companyId={effectiveCompany?.id ?? ''}
        onClose={() => setShowStartSheet(false)}
        onSelect={(selection: InspectionStartSelection) => { setShowStartSheet(false); handleStartInspection(selection) }}
      />
      {errorMsg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setErrorMsg(null)} />
          <div style={{ position: 'relative', background: WHITE, borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: GRAY_900, margin: '0 0 12px' }}>Something went wrong</h3>
            <p style={{ fontSize: 14, color: GRAY_700, lineHeight: 1.6, margin: '0 0 24px' }}>{errorMsg}</p>
            <button onClick={() => setErrorMsg(null)} style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: GRAY_900, color: WHITE, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>OK</button>
          </div>
        </div>
      )}
    </>
  )

  const sidebarWidth = sidebarCollapsed ? 64 : 256

  // ── Inspection in progress ──────────────────────────────────────────────
  if (appStep === 'inspecting' && currentInspectionId) {
    if (isDesktop) {
      return (
        <div style={{ display: 'flex', minHeight: '100vh', background: GRAY_100 }}>
          <DesktopSidebar
            activeTab={homeTab}
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: 32, textAlign: 'center', background: GRAY_100 }}>
        <div style={{ width: 80, height: 80, borderRadius: 40, background: SUCCESS_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={SUCCESS_DARK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 900, color: GRAY_900, margin: '0 0 8px' }}>Inspection Complete</h2>
        <p style={{ color: GRAY_500, margin: '0 0 32px' }}>Report generated successfully</p>
        {score && (
          <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 16, padding: 24, marginBottom: 32, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: GRAY_900 }}>{score.grade}</div>
            <div style={{ fontSize: 20, color: GRAY_500 }}>{score.score}/100</div>
            <div style={{ fontSize: 14, color: GRAY_500, marginTop: 8 }}>{score.description}</div>
          </div>
        )}
        <button
          onClick={() => { setAppStep('browse'); setCurrentInspectionId(null); setCurrentInspectionData({}) }}
          style={{ background: GRAY_900, color: WHITE, padding: '14px 32px', borderRadius: 32, fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', width: '100%', maxWidth: 360 }}
        >
          {usageBasedHome ? 'Back to Inspections' : 'Back to Dashboard'}
        </button>
      </div>
    )

    if (isDesktop) {
      return (
        <div style={{ display: 'flex', minHeight: '100vh', background: GRAY_100 }}>
          <DesktopSidebar
            activeTab={homeTab}
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
      {homeTab === 'home' && (
        isDesktop ? (
          <DesktopHomeDashboard onStartInspection={() => setShowVehiclePicker(true)} />
        ) : (
          <HomeDashboard
            onStartInspection={() => setShowVehiclePicker(true)}
            onResumeInspection={handleResumeInspection}
            onViewReport={handleViewReport}
          />
        )
      )}
      {homeTab === 'queue' && (
        <QueuePage
          key="queue"
          initialFilter={usageBasedHome ? homeFilter : 'queued'}
          openSendSheet={usageBasedHome && sendParam !== null}
          sendVin={usageBasedHome && sendParam && sendParam.length === 17 ? sendParam : undefined}
          onStartInspection={handleStartInspection}
          onResumeInspection={handleResumeInspection}
          onViewReport={handleViewReport}
        />
      )}
      {homeTab === 'history' && (
        <QueuePage
          key="history"
          initialFilter="completed"
          onStartInspection={handleStartInspection}
          onResumeInspection={handleResumeInspection}
          onViewReport={handleViewReport}
        />
      )}
      {homeTab === 'account' && <ProfilePage />}
    </>
  )

  // ── Desktop layout ───────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: GRAY_100 }}>
        <DesktopSidebar
          activeTab={homeTab}
          onTabChange={tab => setNavTab(tab as NavTab)}
          onStartInspection={() => handleStartInspection()}
          onSendToInspector={() => setShowSendSheet(true)}
          collapsed={sidebarCollapsed}
          onCollapseChange={setSidebarCollapsed}
        />
        <div style={{ marginLeft: sidebarWidth, flex: 1, display: 'flex', flexDirection: 'column', transition: 'margin-left 200ms ease' }}>
          <DesktopTopBar pageTitle={usageBasedHome && homeTab === 'queue' ? 'Inspections' : DESKTOP_PAGE_TITLES[homeTab]} sidebarWidth={sidebarWidth} />
          <main style={{ paddingTop: 64, flex: 1 }}>
            {tabContent}
          </main>
        </div>
        <ActionSheet
          open={showActionSheet}
          onClose={() => setShowActionSheet(false)}
          onStartInspection={() => handleStartInspection()}
          onSendToInspector={handleSendToInspector}
          showDispatch
        />
        {sharedModals}
      </div>
    )
  }

  // ── Mobile layout ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: GRAY_100 }}>
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

function VehiclePickerSheet({ companyId, onClose, onSelect }: {
  companyId: string
  onClose: () => void
  onSelect: (vehicleId: string) => void
}) {
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyId) return
    setLoading(true)
    import('@/lib/supabase/client').then(({ createClient }) => {
      createClient()
        .from('storage_vehicles')
        .select('id, vin, year, make, model, work_order_status, checkin_inspection_id')
        .eq('company_id', companyId)
        .order('arrived_at', { ascending: false, nullsFirst: false })
        .then(({ data }) => {
          const active = (data ?? []).filter(v =>
            !['pending_release', 'ready_for_release', 'released'].includes(v.work_order_status)
          )
          setVehicles(active)
          setLoading(false)
        })
    })
  }, [companyId])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const getStatusLabel = (v: any) => {
    if (v.work_order_status === 'pending_arrival') return 'Pending Arrival'
    return 'On Lot'
  }

  const getStatusColors = (v: any) => {
    if (v.work_order_status === 'pending_arrival') return { bg: GRAY_100, color: GRAY_700 }
    return { bg: PRIMARY_LIGHT, color: PRIMARY_PILL_TEXT }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.65)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: WHITE,
        borderRadius: '28px 28px 0 0',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        maxHeight: '75vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ width: 40, height: 4, background: GRAY_300, borderRadius: 2, margin: '12px auto 0' }} />
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${GRAY_100}` }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: GRAY_900, margin: 0 }}>Select Vehicle</p>
          <p style={{ fontSize: 13, color: GRAY_500, margin: '2px 0 0' }}>On Lot · Pending Arrival</p>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}>
              <Loader2 size={24} color={GRAY_500} style={{ animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
          {!loading && vehicles.length === 0 && (
            <p style={{ padding: '32px 20px', textAlign: 'center', fontSize: 14, color: GRAY_500, margin: 0 }}>
              No vehicles on lot or pending arrival.
            </p>
          )}
          {!loading && vehicles.map(v => {
            const sc = getStatusColors(v)
            return (
              <button key={v.id} onClick={() => onSelect(v.id)}
                style={{ width: '100%', padding: '14px 20px', background: 'none', border: 'none', borderBottom: `1px solid ${GRAY_100}`, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: GRAY_900, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin}
                  </p>
                  {(v.make || v.model) && (
                    <p style={{ fontSize: 12, color: GRAY_500, margin: 0, fontFamily: 'monospace' }}>{v.vin}</p>
                  )}
                </div>
                <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {getStatusLabel(v)}
                </span>
                <ChevronRight size={16} color={GRAY_500} style={{ flexShrink: 0 }} />
              </button>
            )
          })}
        </div>
        <div style={{ padding: '12px 20px' }}>
          <button onClick={onClose}
            style={{ width: '100%', height: 52, borderRadius: 14, background: WHITE, border: `1.5px solid ${GRAY_300}`, color: GRAY_700, fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
        </div>
      </div>
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
      <div style={{ background: WHITE, borderRadius: 20, width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 20px 60px rgba(13,27,42,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: DANGER_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={28} color={DANGER} />
          </div>
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: GRAY_900, textAlign: 'center', margin: '0 0 8px' }}>
          Inspection Auto-Completed
        </h2>
        <p style={{ fontSize: 14, color: GRAY_700, textAlign: 'center', margin: '0 0 6px', lineHeight: 1.5 }}>
          {title}
        </p>
        <p style={{ fontSize: 13, color: GRAY_500, textAlign: 'center', margin: '0 0 20px', lineHeight: 1.5 }}>
          This inspection was inactive for 24 hours and was automatically completed. You can view the generated report.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={onViewReport}
            style={{
              height: 52, borderRadius: 12, border: 'none',
              background: PRIMARY, color: WHITE, fontWeight: 700, fontSize: 15, cursor: 'pointer',
            }}
          >
            View Report
          </button>
          <button
            onClick={onClose}
            style={{
              height: 48, borderRadius: 12, background: WHITE,
              border: `1.5px solid ${GRAY_300}`, color: GRAY_700, fontWeight: 600, fontSize: 15, cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

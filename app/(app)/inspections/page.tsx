'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import QueuePage, { type StatusFilter } from '@/components/queue/queue-page'
import { INSPECTION_STATUSES } from '@/lib/unified-inspections'

// Old ?tab= values from before Inspections and Dispatch merged. Kept so existing
// links and bookmarks still land on the right slice.
const LEGACY_TAB: Record<string, StatusFilter> = {
  queue: 'queued',
  in_progress: 'in_progress',
  history: 'completed',
}

function parseFilter(status: string | null, tab: string | null): StatusFilter {
  if (status && (INSPECTION_STATUSES as string[]).includes(status)) return status as StatusFilter
  if (tab && LEGACY_TAB[tab]) return LEGACY_TAB[tab]
  return 'all'
}
import BottomNav from '@/components/ui/bottom-nav'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import { createClient } from '@/lib/supabase/client'
import { fetchFullInspectionAction, getReportSignedUrlAction } from '@/lib/inspection-server-actions'
import { useAuth } from '@/contexts/auth-context'
import StartInspectionSheet, { type InspectionStartSelection } from '@/components/inspections/start-inspection-sheet'
import { setPendingInspectionStart } from '@/lib/pending-inspection-start'

function InspectionsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialFilter = parseFilter(searchParams.get('status'), searchParams.get('tab'))
  // ?send=1 opens the send-link sheet; ?send=<VIN> opens it prefilled.
  const send = searchParams.get('send')
  const openSendSheet = send !== null
  const sendVin = send && send.length === 17 ? send : undefined

  const { effectiveCompany } = useAuth()
  const [showStartSheet, setShowStartSheet] = useState(false)

  // Inspections run in the home shell, which owns the wizard. The chosen vehicle
  // is handed over through session storage rather than the URL.
  const beginInspection = (selection: InspectionStartSelection) => {
    setPendingInspectionStart(selection)
    router.push('/?start=1')
  }

  const handleStartInspection = (queueItem?: any) => {
    if (queueItem?.vin) {
      beginInspection({ vin: queueItem.vin, year: queueItem.year, make: queueItem.make, model: queueItem.model })
      return
    }
    setShowStartSheet(true)
  }

  const handleResumeInspection = async (item: any) => {
    if (!item?.vin) { router.push('/vehicles'); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('storage_vehicles')
      .select('id')
      .eq('vin', item.vin)
      .maybeSingle()
    router.push(data?.id ? `/inventory/${data.id}` : '/vehicles')
  }

  const handleViewReport = async (item: any) => {
    try {
      if (item.report_url) {
        const url = item.report_url.startsWith('http')
          ? item.report_url
          : await getReportSignedUrlAction(item.report_url)
        if (url) { window.open(url, '_blank'); return }
      }
      // The report is built on the server from the inspection id alone.
      const { generateReport } = await import('@/lib/pdf-generator')
      await generateReport(item.id)
    } catch (e) {
      console.error('[inspections] pdf error', e)
    }
  }

  return (
    <>
      <MobilePageHeader />
      <QueuePage
        initialFilter={initialFilter}
        openSendSheet={openSendSheet}
        sendVin={sendVin}
        hideHeader
        onStartInspection={handleStartInspection}
        onResumeInspection={handleResumeInspection}
        onViewReport={handleViewReport}
      />
      <BottomNav />
      <StartInspectionSheet
        isOpen={showStartSheet}
        companyId={effectiveCompany?.id ?? ''}
        onClose={() => setShowStartSheet(false)}
        onSelect={selection => { setShowStartSheet(false); beginInspection(selection) }}
      />
    </>
  )
}

export default function InspectionsPage() {
  return (
    <Suspense>
      <InspectionsContent />
    </Suspense>
  )
}

'use client'

import { Suspense } from 'react'
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

function InspectionsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialFilter = parseFilter(searchParams.get('status'), searchParams.get('tab'))
  // ?send=1 opens the send-link sheet; ?send=<VIN> opens it prefilled.
  const send = searchParams.get('send')
  const openSendSheet = send !== null
  const sendVin = send && send.length === 17 ? send : undefined

  const handleStartInspection = () => {
    router.push('/vehicles')
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
      const full = await fetchFullInspectionAction(item.id)
      if (!full) return
      const [{ calculateVehicleScore }, { generateInspectionPDF }] = await Promise.all([
        import('@/lib/vehicle-score'),
        import('@/lib/pdf-generator'),
      ])
      await generateInspectionPDF(full, calculateVehicleScore(full), full.signature_url ?? '')
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

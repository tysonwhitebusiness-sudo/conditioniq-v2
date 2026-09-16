'use client'

import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useMediaQuery } from '@/hooks/use-media-query'
import DamageComparisonView from '@/components/checkpoint/damage-comparison'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'

// Standalone page — intentionally not inserted into inventory/[vehicleId]/page.tsx's
// own layout (that page is getting redesigned in Phase 8). This route + the
// DamageComparisonView component are the whole feature; the vehicle detail page
// only links here, it doesn't render this content itself.
export default function VehicleComparisonPage() {
  const params = useParams<{ vehicleId: string }>()
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <div style={{ paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))' }}>
        <div style={{ padding: '16px 20px 0', maxWidth: 640, margin: '0 auto' }}>
          <button
            onClick={() => router.push(`/inventory/${params.vehicleId}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          >
            <ArrowLeft size={14} /> Back to Vehicle
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', margin: '12px 0 0' }}>Intake / Outtake Comparison</h1>
        </div>
        <DamageComparisonView vehicleId={params.vehicleId} />
      </div>
      {!isDesktop && <BottomNav />}
    </>
  )
}

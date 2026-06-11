'use client'

import StorageLotView from './storage-lot-view'
import FmcLotView from './fmc-lot-view'
import BottomNav from '@/components/ui/bottom-nav'
import MobilePageHeader from '@/components/layout/mobile-page-header'

interface Props {
  companyId: string
  isFMC: boolean
}

export default function LotPageClient({ companyId, isFMC }: Props) {
  return (
    <>
      <MobilePageHeader />
      {isFMC ? <FmcLotView companyId={companyId} /> : <StorageLotView companyId={companyId} />}
      <BottomNav />
    </>
  )
}

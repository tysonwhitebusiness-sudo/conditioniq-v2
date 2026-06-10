'use client'

import StorageLotView from './storage-lot-view'
import FmcLotView from './fmc-lot-view'

interface Props {
  companyId: string
  isFMC: boolean
}

export default function LotPageClient({ companyId, isFMC }: Props) {
  if (isFMC) return <FmcLotView companyId={companyId} />
  return <StorageLotView companyId={companyId} />
}

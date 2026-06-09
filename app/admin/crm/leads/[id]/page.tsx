'use client'

import { useParams } from 'next/navigation'
import LeadDetail from '@/components/crm/lead-detail'

export default function LeadDetailPage() {
  const params = useParams()
  return <LeadDetail leadId={params.id as string} />
}

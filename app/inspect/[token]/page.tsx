import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SharedInspectionView from '@/components/shared-inspection-view'

interface Props {
  params: { token: string }
}

export default async function SharedInspectionPage({ params }: Props) {
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_inspection_by_share_token', { p_token: params.token })

  if (error || !data) return notFound()

  return <SharedInspectionView inspection={data} />
}

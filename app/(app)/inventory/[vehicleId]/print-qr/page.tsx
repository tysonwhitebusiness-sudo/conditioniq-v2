import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateQrToken } from '@/lib/qr-actions'
import PrintQrClient from '@/components/scan/print-qr-client'

interface Props {
  params: { vehicleId: string }
}

export default async function PrintQrPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/inventory/${params.vehicleId}/print-qr`)}`)

  const { data: vehicle } = await supabase
    .from('storage_vehicles')
    .select('id, vin, year, make, model')
    .eq('id', params.vehicleId)
    .single()
  if (!vehicle) redirect(`/inventory/${params.vehicleId}`)

  const token = await getOrCreateQrToken(vehicle.id)

  return <PrintQrClient vehicle={vehicle} token={token} />
}

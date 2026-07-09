import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFeatureFlags } from '@/lib/feature-flags'
import LotPageClient from '@/components/lot/lot-page-client'
import LockedFeatureNotice from '@/components/ui/locked-feature-notice'

export default async function LotPage() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (!profile?.company_id) redirect('/login')

  const { data: company } = await supabase
    .from('companies')
    .select('id, account_type')
    .eq('id', profile.company_id)
    .single()

  if (!company) redirect('/login')

  const flags = await getFeatureFlags(company.id)

  if (!flags.lot_map?.enabled) {
    return <LockedFeatureNotice featureName="Lot Map" description="Visualize your lot layout, track spot occupancy, and see accrual in real time." />
  }

  return (
    <LotPageClient
      companyId={company.id}
      isFMC={company.account_type === 'fmc'}
    />
  )
}

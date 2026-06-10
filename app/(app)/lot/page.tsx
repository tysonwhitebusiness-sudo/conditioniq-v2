import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getFeatureFlags } from '@/lib/feature-flags'
import LotPageClient from '@/components/lot/lot-page-client'
import { Lock } from 'lucide-react'

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
    return (
      <div style={{
        minHeight: '80vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: 32,
          background: '#F0F4F8', display: 'flex', alignItems: 'center',
          justifyContent: 'center', marginBottom: 16,
        }}>
          <Lock size={28} color="#94A3B8" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px', textAlign: 'center' }}>
          Lot Map is not enabled for your account.
        </h2>
        <p style={{ fontSize: 14, color: '#94A3B8', margin: 0, textAlign: 'center' }}>
          Contact us to get access.
        </p>
      </div>
    )
  }

  return (
    <LotPageClient
      companyId={company.id}
      isFMC={company.account_type === 'fmc'}
    />
  )
}

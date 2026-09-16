import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { lookupVehicleByQrToken, getScanVerificationState } from '@/lib/qr-actions'
import SetupPinForm from '@/components/scan/setup-pin-form'
import VerifyPinForm from '@/components/scan/verify-pin-form'
import ClosedRecordView from '@/components/scan/closed-record-view'
import ScanLandingView from '@/components/scan/scan-landing-view'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

interface Props {
  params: { token: string }
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Scan', robots: { index: false, follow: false } }
}

const MIDNIGHT = '#0D1B2A'

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#F0F4F8', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: 380, width: '100%', background: '#FFFFFF', borderRadius: 20,
        border: '1px solid #E1E8F0', padding: 28, textAlign: 'center',
        boxShadow: '0 4px 24px rgba(13,27,42,0.08)',
      }}>
        {children}
      </div>
    </div>
  )
}

export default async function ScanPage({ params }: Props) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Auth first, before the token lookup — the lookup runs on the authenticated,
  // RLS-scoped client, so an anonymous request would never resolve a token
  // (right or wrong) and would incorrectly look like an invalid QR code instead
  // of prompting login.
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/scan/${params.token}`)}`)
  }

  const vehicle = await lookupVehicleByQrToken(params.token)
  if (!vehicle) {
    return (
      <CenteredMessage>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: MIDNIGHT, margin: '0 0 8px' }}>QR code not recognized</h1>
        <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>
          This code doesn't match a work order you have access to.
        </p>
      </CenteredMessage>
    )
  }

  if (vehicle.work_order_status === 'released') {
    return <ClosedRecordView vehicle={vehicle} />
  }

  const verification = await getScanVerificationState()
  if (verification === 'needs_pin_setup') {
    return <SetupPinForm />
  }
  if (verification === 'needs_pin_verify') {
    return <VerifyPinForm />
  }

  return <ScanLandingView vehicle={vehicle} userId={user.id} />
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import { getCompanyAiEnabled, setCompanyAiEnabled } from '@/lib/ai/settings-actions'
import { PRIMARY, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100, DANGER_TEXT } from '@/lib/design-tokens'

// A · The account's AI switch. On by default for every plan.

const USES = [
  'Reading a VIN or plate when the barcode and on-device reader cannot',
  'Flagging a blurry, dark or misplaced photo before you keep it',
  'Suggesting damage for you to confirm, edit or reject',
  'Writing the report summary and grouping recommendations, from what you recorded',
]

export default function AiSettingsPage() {
  const { user, loading, isOwnerUser, companyRole, company } = useAuth()
  const router = useRouter()
  const isAdmin = isOwnerUser || companyRole === 'admin'
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
    if (!loading && user && companyRole !== null && !isAdmin) router.replace('/settings')
  }, [user, loading, companyRole, isAdmin, router])

  useEffect(() => {
    if (company?.id) getCompanyAiEnabled(company.id).then(setEnabled)
  }, [company?.id])

  const toggle = async () => {
    if (!company?.id || enabled === null) return
    const next = !enabled
    setSaving(true); setError(null)
    const result = await setCompanyAiEnabled(company.id, next)
    setSaving(false)
    if (result.ok) setEnabled(next)
    else setError(result.error ?? 'Could not save')
  }

  if (loading || !user) return null

  return (
    <>
      <MobilePageHeader />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 96px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: GRAY_900, margin: '0 0 6px' }}>AI assistance</h1>
        <p style={{ fontSize: 14, color: GRAY_700, margin: '0 0 20px', lineHeight: 1.5 }}>
          AI helps your inspectors work faster. It never records anything on its own and never stops an inspection: every suggestion is confirmed by a person.
        </p>

        <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: GRAY_900, margin: 0 }}>Use AI assistance</p>
            <p style={{ fontSize: 13, color: GRAY_500, margin: '2px 0 0' }}>
              {enabled === null ? 'Loading…' : enabled ? 'On for everyone on this account' : 'Off for everyone on this account'}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={!!enabled}
            aria-label="Use AI assistance"
            disabled={enabled === null || saving}
            onClick={toggle}
            style={{ width: 52, height: 30, borderRadius: 15, border: 'none', padding: 3, background: enabled ? PRIMARY : GRAY_300, cursor: enabled === null || saving ? 'default' : 'pointer', flexShrink: 0, transition: 'background 0.15s' }}
          >
            <span style={{ display: 'block', width: 24, height: 24, borderRadius: 12, background: WHITE, transform: enabled ? 'translateX(22px)' : 'none', transition: 'transform 0.15s' }} />
          </button>
        </div>
        {error ? <p style={{ fontSize: 13, color: DANGER_TEXT, margin: '8px 0 0' }}>{error}</p> : null}

        <div style={{ background: GRAY_100, borderRadius: 12, padding: 16, marginTop: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: GRAY_900, margin: '0 0 8px' }}>What it is used for</p>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {USES.map(u => <li key={u} style={{ fontSize: 13, color: GRAY_700, lineHeight: 1.45 }}>{u}</li>)}
          </ul>
          <p style={{ fontSize: 13, color: GRAY_700, margin: '12px 0 0', lineHeight: 1.5 }}>
            Photos and inspection answers are sent to Anthropic, our AI provider, only to produce these results, and are not used to train its models.
            AI use is included in your plan. See the <Link href="/privacy" style={{ color: PRIMARY }}>privacy policy</Link> and <Link href="/terms" style={{ color: PRIMARY }}>terms</Link>.
          </p>
        </div>
      </main>
      <BottomNav />
    </>
  )
}

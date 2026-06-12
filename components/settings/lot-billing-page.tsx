'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { createClient } from '@/lib/supabase/client'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import { ArrowLeft, DollarSign, Check } from 'lucide-react'

type BillingType = 'daily' | 'monthly'

export default function LotBillingPage() {
  const { effectiveCompany } = useAuth()
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [defaultDailyRate, setDefaultDailyRate] = useState('')
  const [defaultMonthlyRate, setDefaultMonthlyRate] = useState('')
  const [defaultBillingType, setDefaultBillingType] = useState<BillingType>('daily')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!effectiveCompany?.id) return
    createClient()
      .from('companies')
      .select('default_daily_rate, default_monthly_rate, default_billing_type')
      .eq('id', effectiveCompany.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setDefaultDailyRate(data.default_daily_rate != null ? String(data.default_daily_rate) : '')
          setDefaultMonthlyRate(data.default_monthly_rate != null ? String(data.default_monthly_rate) : '')
          setDefaultBillingType((data.default_billing_type as BillingType) ?? 'daily')
        }
        setLoading(false)
      })
  }, [effectiveCompany?.id])

  const handleSave = async () => {
    if (!effectiveCompany?.id) return
    setSaving(true)
    await createClient()
      .from('companies')
      .update({
        default_daily_rate: defaultDailyRate ? parseFloat(defaultDailyRate) : null,
        default_monthly_rate: defaultMonthlyRate ? parseFloat(defaultMonthlyRate) : null,
        default_billing_type: defaultBillingType,
      })
      .eq('id', effectiveCompany.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: '#4A5568',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'block', marginBottom: 6,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 44, border: '1px solid #E1E8F0',
    borderRadius: 10, padding: '0 12px 0 32px',
    fontSize: 15, outline: 'none', fontFamily: 'inherit',
    background: '#FAFAFA', color: '#0D1B2A', boxSizing: 'border-box',
  }

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <div style={{
        padding: isDesktop ? '24px 28px' : '16px',
        paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))',
        maxWidth: 640, margin: '0 auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <ArrowLeft size={16} color="#0D1B2A" />
          </button>
          <div>
            <h1 style={{ fontSize: isDesktop ? 22 : 18, fontWeight: 900, color: '#0D1B2A', margin: 0 }}>Lot Billing Defaults</h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Applied when a vehicle has no rate override</p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94A3B8', fontSize: 14 }}>Loading…</div>
        ) : (
          <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, padding: '20px' }}>

            {/* Billing Type Toggle */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Default Billing Type</label>
              <div style={{ display: 'flex', gap: 0, background: '#F0F4F8', borderRadius: 10, padding: 3 }}>
                {(['daily', 'monthly'] as BillingType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => setDefaultBillingType(type)}
                    style={{
                      flex: 1, height: 38, borderRadius: 8, border: 'none',
                      background: defaultBillingType === type ? '#0D1B2A' : 'transparent',
                      color: defaultBillingType === type ? '#FFF' : '#4A5568',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      textTransform: 'capitalize', transition: 'background 150ms ease, color 150ms ease',
                    }}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Daily Rate */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Default Daily Rate</label>
              <div style={{ position: 'relative' }}>
                <DollarSign size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 25.00"
                  value={defaultDailyRate}
                  onChange={e => setDefaultDailyRate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '5px 0 0' }}>Per vehicle, per day on lot</p>
            </div>

            {/* Monthly Rate */}
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Default Monthly Rate</label>
              <div style={{ position: 'relative' }}>
                <DollarSign size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 500.00"
                  value={defaultMonthlyRate}
                  onChange={e => setDefaultMonthlyRate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: '5px 0 0' }}>Per vehicle, per 30 days on lot</p>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%', height: 46, borderRadius: 12, border: 'none',
                background: saved ? '#10B981' : '#0D1B2A',
                color: '#FFF', fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: saving ? 0.7 : 1, transition: 'background 300ms ease',
              }}>
              {saved ? <><Check size={16} />Saved</> : saving ? 'Saving…' : 'Save Defaults'}
            </button>
          </div>
        )}

        <BottomNav />
      </div>
    </>
  )
}

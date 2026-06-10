'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createFakeAuthContext, AuthContext } from '@/contexts/auth-context'
import { initiateInspectionRequest } from '@/lib/usage-actions'
import InspectionWizard from '@/components/inspection-wizard/inspection-wizard'
import SharedInspectionView from '@/components/shared-inspection-view'
import { XCircle, Clock, CheckCircle, Car } from 'lucide-react'

type PageStatus =
  | 'loading'
  | 'intake'       // inspection_requests token — show intake form
  | 'starting'     // creating inspection row
  | 'inspecting'   // wizard active
  | 'done'         // inspector finished
  | 'expired'
  | 'used'
  | 'share'        // completed-report share link
  | 'invalid'

interface InspectionRequest {
  id: string
  company_id: string
  vin?: string | null
  notes?: string | null
  token: string
  expires_at: string
  used_at?: string | null
}

export default function InspectTokenPage() {
  const params = useParams()
  const token = params.token as string
  const supabase = createClient()

  const [status, setStatus] = useState<PageStatus>('loading')
  const [request, setRequest] = useState<InspectionRequest | null>(null)
  const [sharedData, setSharedData] = useState<Record<string, unknown> | null>(null)
  const [inspectorName, setInspectorName] = useState('')
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [startError, setStartError] = useState('')

  useEffect(() => {
    async function validate() {
      // 1. Check inspection_requests table first
      const { data: req } = await supabase
        .from('inspection_requests')
        .select('id, company_id, vin, notes, token, expires_at, used_at')
        .eq('token', token)
        .single()

      if (req) {
        if (req.used_at) { setStatus('used'); return }
        if (new Date(req.expires_at) < new Date()) { setStatus('expired'); return }
        setRequest(req)
        setStatus('intake')
        return
      }

      // 2. Fall back to completed-report share token
      const { data: shared, error } = await supabase.rpc('get_inspection_by_share_token', { p_token: token })
      if (!error && shared) {
        setSharedData(shared)
        setStatus('share')
        return
      }

      setStatus('invalid')
    }
    validate()
  }, [token])

  async function handleStart() {
    if (!request || !inspectorName.trim()) return
    setStatus('starting')
    setStartError('')
    try {
      const { error: anonErr } = await supabase.auth.signInAnonymously()
      if (anonErr) throw anonErr

      const { inspectionId: id } = await initiateInspectionRequest({
        requestId: request.id,
        companyId: request.company_id,
        vin: request.vin ?? undefined,
      })
      setInspectionId(id)
      setStatus('inspecting')
    } catch (e: any) {
      setStartError(e.message ?? 'Failed to start inspection')
      setStatus('intake')
    }
  }

  async function handleComplete() {
    await supabase.auth.signOut()
    setStatus('done')
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (status === 'loading' || status === 'starting') {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid #E1E8F0', borderTopColor: '#00B4D8',
            borderRadius: 20, margin: '0 auto 12px',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 14, color: '#94A3B8' }}>
            {status === 'starting' ? 'Starting inspection…' : 'Validating link…'}
          </p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Expired ──────────────────────────────────────────────────────────────
  if (status === 'expired') {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Clock size={32} color="#F59E0B" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px' }}>Link Expired</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>
            This inspection link expired after 48 hours. Ask the company to send a new one.
          </p>
        </div>
      </div>
    )
  }

  // ── Already used ─────────────────────────────────────────────────────────
  if (status === 'used') {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CheckCircle size={32} color="#10B981" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px' }}>Already Used</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>
            This inspection link has already been used. Each link is single-use only.
          </p>
        </div>
      </div>
    )
  }

  // ── Invalid ──────────────────────────────────────────────────────────────
  if (status === 'invalid') {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <XCircle size={32} color="#EF4444" />
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px' }}>Invalid Link</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>
            This link is not valid. Contact the company that sent it.
          </p>
        </div>
      </div>
    )
  }

  // ── Inspection complete ──────────────────────────────────────────────────
  if (status === 'done') {
    return (
      <div style={{ minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ width: 80, height: 80, borderRadius: 40, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0D1B2A', margin: '0 0 8px' }}>Inspection Complete</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>
            The report has been submitted. You can close this window.
          </p>
        </div>
      </div>
    )
  }

  // ── Existing shared report ───────────────────────────────────────────────
  if (status === 'share' && sharedData) {
    return <SharedInspectionView inspection={sharedData} />
  }

  // ── Active inspection wizard ─────────────────────────────────────────────
  if (status === 'inspecting' && inspectionId && request) {
    const fakeContext = createFakeAuthContext({
      inspectorName,
      companyId: request.company_id,
    })
    return (
      <AuthContext.Provider value={fakeContext}>
        <InspectionWizard
          inspectionId={inspectionId}
          onComplete={handleComplete}
          isRemote
        />
      </AuthContext.Provider>
    )
  }

  // ── Intake form (status === 'intake') ────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Car size={26} color="#00B4D8" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D1B2A', margin: '0 0 6px' }}>Vehicle Inspection</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>You've been sent an inspection link</p>
        </div>

        {/* Request details */}
        {request && (request.vin || request.notes) && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            {request.vin && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: request.notes ? 10 : 0 }}>
                <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500 }}>VIN</span>
                <span style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: '#0D1B2A' }}>{request.vin}</span>
              </div>
            )}
            {request.notes && (
              <div style={{ borderTop: request.vin ? '1px solid #F0F4F8' : 'none', paddingTop: request.vin ? 10 : 0 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Notes</p>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, margin: 0 }}>{request.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Inspector name */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
            Your Name
          </label>
          <input
            type="text"
            value={inspectorName}
            onChange={e => setInspectorName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && inspectorName.trim() && handleStart()}
            placeholder="Enter your full name"
            style={{
              width: '100%', height: 46, background: '#F5F8FA',
              border: '1px solid #E1E8F0', borderRadius: 10,
              padding: '0 14px', fontSize: 15, color: '#0D1B2A',
              outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
        </div>

        {startError && (
          <p style={{ fontSize: 13, color: '#EF4444', textAlign: 'center', margin: '0 0 12px' }}>{startError}</p>
        )}

        <button
          onClick={handleStart}
          disabled={!inspectorName.trim()}
          style={{
            width: '100%', height: 52, borderRadius: 12, border: 'none',
            background: inspectorName.trim() ? '#F4A62A' : '#E1E8F0',
            color: inspectorName.trim() ? '#0D1B2A' : '#94A3B8',
            fontWeight: 700, fontSize: 16, cursor: inspectorName.trim() ? 'pointer' : 'default',
            transition: 'background 150ms ease, color 150ms ease',
            fontFamily: 'inherit',
          }}
        >
          Start Inspection
        </button>

        <p style={{ fontSize: 12, color: '#CBD5E1', textAlign: 'center', marginTop: 12 }}>
          This link expires 48 hours after it was sent
        </p>
      </div>
    </div>
  )
}

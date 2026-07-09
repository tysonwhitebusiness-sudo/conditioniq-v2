'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createFakeAuthContext, AuthContext } from '@/contexts/auth-context'
import { initiateInspectionRequest, checkUsageState, checkExistingInspection, type UsageState } from '@/lib/usage-actions'
import InspectionWizard, { type StepId } from '@/components/inspection-wizard/inspection-wizard'
import { loadInspectionForResume } from '@/lib/inspection-server-actions'
import SharedInspectionView from '@/components/shared-inspection-view'
import UsageConfirmationModal from '@/components/ui/usage-confirmation-modal'
import { getInspectionRequestByToken } from '@/lib/inspection-server-actions'
import { XCircle, Clock, CheckCircle, Car } from 'lucide-react'

type PageStatus =
  | 'loading'
  | 'intake'       // inspection_requests token — show intake form
  | 'confirm'      // usage confirmation modal
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

const RESUME_STEP_ORDER: Array<{ dataKey: string; nextStep: StepId }> = [
  { dataKey: 'engine_data',           nextStep: 'review' },
  { dataKey: 'interior_data',         nextStep: 'engine' },
  { dataKey: 'exterior_data',         nextStep: 'interior' },
  { dataKey: 'documentation_data',    nextStep: 'exterior' },
  { dataKey: 'vehicle_function_data', nextStep: 'documentation' },
  { dataKey: 'keys_data',             nextStep: 'function' },
  { dataKey: 'bol_data',              nextStep: 'keys' },
  { dataKey: 'vehicleInfo',           nextStep: 'bol' },
]

function inferDispatchResumeStep(row: Record<string, any>): StepId {
  for (const { dataKey, nextStep } of RESUME_STEP_ORDER) {
    const val = row[dataKey]
    if (val && typeof val === 'object' && Object.keys(val).length > 0) return nextStep
  }
  return 'vehicle-info'
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
  const [usageState, setUsageState] = useState<UsageState | null>(null)
  const [existingInspection, setExistingInspection] = useState<{ inspectionId: string; startedAt: string } | null>(null)
  const [resumedData, setResumedData] = useState<Record<string, any> | null>(null)
  const [resumedStep, setResumedStep] = useState<StepId | undefined>(undefined)
  const anonSessionCreated = useRef(false)

  useEffect(() => {
    async function validate() {
      // 1. Check inspection_requests via server action (admin client bypasses RLS on the table)
      const req = await getInspectionRequestByToken(token)

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

  async function ensureAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      const { error: anonErr } = await supabase.auth.signInAnonymously()
      if (anonErr) throw anonErr
      anonSessionCreated.current = true
    }
  }

  async function doInitiate() {
    if (!request) return
    const result = await initiateInspectionRequest({
      requestId: request.id,
      companyId: request.company_id,
      vin: request.vin ?? undefined,
    })
    if (result.error) {
      setStartError(result.error)
      setStatus('intake')
      return
    }
    setInspectionId(result.inspectionId)
    setStatus('inspecting')
  }

  async function handleStart() {
    if (!request || !inspectorName.trim()) return
    setStatus('starting')
    setStartError('')
    try {
      // Skip anonymous sign-in if already authenticated (prevents overwriting an admin session
      // when they open their own inspect link in the same browser to test it)
      await ensureAuth()

      // Check for an existing in-progress inspection for this VIN
      if (request.vin) {
        const existing = await checkExistingInspection(request.company_id, request.vin)
        if (existing) {
          setExistingInspection(existing)
          setStatus('intake')
          return
        }
      }

      // Show usage confirmation before creating the row
      const usage = await checkUsageState(request.company_id)
      setUsageState(usage)
      setStatus('confirm')
    } catch (e: any) {
      setStartError(e.message ?? 'Failed to start inspection')
      setStatus('intake')
    }
  }

  async function handleConfirmStart() {
    if (!request) return
    setStatus('starting')
    try {
      await doInitiate()
    } catch (e: any) {
      setStartError(e.message ?? 'Failed to start inspection')
      setStatus('intake')
    }
  }

  async function handleResumeExisting() {
    if (!existingInspection || !request) return
    setStatus('starting')
    const row = await loadInspectionForResume(existingInspection.inspectionId)
    const initialData = row ? {
      vehicleInfo: { ...(row.vehicleInfo ?? {}), _vinLocked: !!request.vin },
      bol_data: row.bol_data ?? {},
      keys_data: row.keys_data ?? {},
      vehicle_function_data: row.vehicle_function_data ?? {},
      documentation_data: row.documentation_data ?? {},
      exterior_data: row.exterior_data ?? {},
      interior_data: row.interior_data ?? {},
      engine_data: row.engine_data ?? {},
    } : (request.vin ? { vehicleInfo: { vin: request.vin, _vinLocked: true } } : undefined)
    setResumedData(initialData ?? null)
    setResumedStep(row ? inferDispatchResumeStep(row) : undefined)
    setInspectionId(existingInspection.inspectionId)
    setExistingInspection(null)
    setStatus('inspecting')
  }

  async function handleStartFreshDispatch() {
    if (!existingInspection || !request) return
    setStatus('starting')
    try {
      const { abandonInspection } = await import('@/lib/usage-actions')
      await abandonInspection(existingInspection.inspectionId)
      setExistingInspection(null)
      const usage = await checkUsageState(request.company_id)
      setUsageState(usage)
      setStatus('confirm')
    } catch (e: any) {
      setStartError(e.message ?? 'Failed to start inspection')
      setStatus('intake')
    }
  }

  async function handleComplete() {
    if (anonSessionCreated.current) await supabase.auth.signOut()
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

  // ── Usage confirmation ───────────────────────────────────────────────────
  if (status === 'confirm' && usageState) {
    return (
      <UsageConfirmationModal
        usageState={usageState}
        onConfirm={handleConfirmStart}
        onCancel={() => setStatus('intake')}
      />
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
          initialData={resumedData ?? (request.vin ? { vehicleInfo: { vin: request.vin, _vinLocked: true } } : undefined)}
          initialStep={resumedStep}
          onComplete={handleComplete}
          isRemote
        />
      </AuthContext.Provider>
    )
  }

  // ── Intake form (status === 'intake') ────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      {existingInspection && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(13,27,42,0.65)', backdropFilter: 'blur(4px)' }}>
          <div style={{ background: '#FFFFFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 360, boxShadow: '0 20px 60px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px' }}>Inspection In Progress</h3>
            <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>
              An inspection for this vehicle is already in progress{existingInspection ? ` (started ${new Date(existingInspection.startedAt).toLocaleDateString()})` : ''}. Resume to continue where you left off, or start fresh.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={handleResumeExisting}
                style={{ height: 48, borderRadius: 12, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Resume Inspection
              </button>
              <button
                onClick={handleStartFreshDispatch}
                style={{ height: 48, borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Start Fresh
              </button>
            </div>
          </div>
        </div>
      )}
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
            background: inspectorName.trim() ? '#00B4D8' : '#E1E8F0',
            color: inspectorName.trim() ? '#FFFFFF' : '#94A3B8',
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

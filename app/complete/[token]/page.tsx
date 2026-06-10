'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createFakeAuthContext, AuthContext } from '@/contexts/auth-context'
import { Link2, Clock, CheckCircle, XCircle } from 'lucide-react'
import InspectionWizard from '@/components/inspection-wizard/inspection-wizard'

type RequestStatus = 'loading' | 'invalid' | 'expired' | 'used' | 'ready'

interface InspectionRequest {
  id: string
  inspection_id: string
  token: string
  expires_at: string
  used_at?: string
  company_id: string
  notes?: string
  inspections?: {
    vin: string
    year: number
    make: string
    model: string
    asset_id?: string
    location?: string
  }
}

export default function RemoteInspectionPage() {
  const params = useParams()
  const token = params.token as string
  const supabase = createClient()

  const [status, setStatus] = useState<RequestStatus>('loading')
  const [request, setRequest] = useState<InspectionRequest | null>(null)
  const [inspectorName, setInspectorName] = useState('')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    async function validate() {
      const { data, error } = await supabase
        .from('inspection_requests')
        .select('*, inspections(vin, year, make, model, asset_id, location)')
        .eq('token', token)
        .single()

      if (error || !data) { setStatus('invalid'); return }
      if (data.used_at) { setStatus('used'); return }
      if (new Date(data.expires_at) < new Date()) { setStatus('expired'); return }

      setRequest(data)
      setStatus('ready')
    }
    validate()
  }, [token])

  async function handleStart() {
    if (!request || !inspectorName.trim()) return

    // Sign in anonymously so the wizard can function
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      console.error('Anonymous sign in failed:', error)
      return
    }

    setStarted(true)
  }

  async function handleComplete() {
    if (!request) return
    // Mark token as used
    await supabase
      .from('inspection_requests')
      .update({ used_at: new Date().toISOString() })
      .eq('id', request.id)

    // Sign out the anonymous user
    await supabase.auth.signOut()
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1e3a5f] mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Validating link…</p>
        </div>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <XCircle size={48} className="mx-auto mb-4 text-red-400" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid Link</h1>
          <p className="text-gray-500 text-sm">This inspection link is not valid. Please contact the company that sent it.</p>
        </div>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <Clock size={48} className="mx-auto mb-4 text-gray-400" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Link Expired</h1>
          <p className="text-gray-500 text-sm">This inspection link has expired (24-hour limit). Please request a new link from the company.</p>
        </div>
      </div>
    )
  }

  if (status === 'used') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Already Completed</h1>
          <p className="text-gray-500 text-sm">This inspection link has already been used. Each link is single-use only.</p>
        </div>
      </div>
    )
  }

  if (!started && request) {
    const insp = request.inspections
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1e3a5f] mb-4">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-900">Remote Inspection</h1>
            <p className="text-gray-500 text-sm mt-1">You have been invited to complete a vehicle inspection</p>
          </div>

          {insp && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">Vehicle</p>
              <p className="font-semibold text-gray-900">{insp.year} {insp.make} {insp.model}</p>
              {insp.vin && <p className="text-sm text-gray-600">VIN: {insp.vin}</p>}
              {insp.location && <p className="text-sm text-gray-600">Location: {insp.location}</p>}
            </div>
          )}

          {request.notes && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-4">
              <p className="text-xs text-blue-700 font-medium mb-1">Notes from the company</p>
              <p className="text-sm text-blue-900">{request.notes}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Your name</label>
            <input
              type="text"
              value={inspectorName}
              onChange={e => setInspectorName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent text-sm"
            />
          </div>

          <button
            onClick={handleStart}
            disabled={!inspectorName.trim()}
            className="w-full bg-[#1e3a5f] hover:bg-[#162d4a] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Start Inspection
          </button>
        </div>
      </div>
    )
  }

  if (started && request) {
    const fakeContext = createFakeAuthContext({
      inspectorName,
      companyId: request.company_id,
    })

    return (
      <AuthContext.Provider value={fakeContext}>
        <InspectionWizard
          inspectionId={request.inspection_id}
          onComplete={handleComplete}
          isRemote
        />
      </AuthContext.Provider>
    )
  }

  return null
}

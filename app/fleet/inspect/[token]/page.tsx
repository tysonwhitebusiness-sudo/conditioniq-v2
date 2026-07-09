'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getFMCRequestByToken, trackFMCLinkOpened, initiateFMCInspection, completeFMCInspection, checkUsageState, type UsageState } from '@/lib/usage-actions'
import { XCircle, Clock, CheckCircle, PartyPopper } from 'lucide-react'
import { createFakeAuthContext, AuthContext } from '@/contexts/auth-context'
import InspectionWizard from '@/components/inspection-wizard/inspection-wizard'
import UsageConfirmationModal from '@/components/ui/usage-confirmation-modal'

type PageStatus = 'loading' | 'invalid' | 'expired' | 'used' | 'ready' | 'confirm' | 'inspecting' | 'done'

interface FMCRequest {
  id: string
  fmc_account_id: string
  vin?: string
  location_id?: string
  link_token: string
  notes?: string
  link_expires_at?: string
  link_opened_at?: string
  completed_at?: string
  status?: string
  fmc_locations?: { name: string; city?: string; state?: string }
}

export default function FMCInspectPage() {
  const params = useParams()
  const token = params.token as string
  const supabase = createClient()

  const [status, setStatus] = useState<PageStatus>('loading')
  const [request, setRequest] = useState<FMCRequest | null>(null)
  const [inspectorName, setInspectorName] = useState('')
  const [inspectionId, setInspectionId] = useState<string | null>(null)
  const [usageState, setUsageState] = useState<UsageState | null>(null)

  useEffect(() => {
    async function validate() {
      const result = await getFMCRequestByToken(token)
      if (!result) { setStatus('invalid'); return }

      const req = result as FMCRequest
      if (req.status === 'completed' || req.completed_at) { setStatus('used'); return }

      await trackFMCLinkOpened(token)
      setRequest(req)

      // Load usage state for the modal
      const usage = await checkUsageState(req.fmc_account_id)
      setUsageState(usage)

      setStatus('ready')
    }
    validate()
  }, [token])

  async function handleStartInspection() {
    if (!request || !inspectorName.trim()) return
    setStatus('confirm')
  }

  async function handleConfirmUsage() {
    if (!request) return

    const { error } = await supabase.auth.signInAnonymously()
    if (error) { console.error('Anonymous sign in failed', error); return }

    const result = await initiateFMCInspection({
      token,
      companyId: request.fmc_account_id,
      requestId: request.id,
      vin: request.vin ?? '',
    })

    if (!result?.inspectionId) return
    setInspectionId(result.inspectionId)
    setStatus('inspecting')
  }

  async function handleComplete() {
    if (!request || !inspectionId) return
    await completeFMCInspection({
      inspectionId,
      requestId: request.id,
      fmcAccountId: request.fmc_account_id,
      vin: request.vin ?? '',
    })
    await supabase.auth.signOut()
    setStatus('done')
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1e3a5f] mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Validating dispatch link…</p>
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
          <p className="text-gray-500 text-sm">This dispatch link is not valid. Contact your fleet manager.</p>
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
          <p className="text-gray-500 text-sm">This dispatch link has expired. Request a new one from your fleet manager.</p>
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
          <p className="text-gray-500 text-sm">This vehicle inspection has already been completed.</p>
        </div>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <CheckCircle size={48} className="mx-auto mb-4 text-green-500" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Inspection Complete</h1>
          <p className="text-gray-500 text-sm">The vehicle condition report has been submitted to your fleet manager.</p>
        </div>
      </div>
    )
  }

  if (status === 'confirm' && usageState) {
    return (
      <UsageConfirmationModal
        usageState={usageState}
        onConfirm={handleConfirmUsage}
        onCancel={() => setStatus('ready')}
      />
    )
  }

  if (status === 'inspecting' && inspectionId && request) {
    const fakeContext = createFakeAuthContext({
      inspectorName,
      companyId: request.fmc_account_id,
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

  // status === 'ready'
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#1e3a5f] mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Fleet Inspection</h1>
          <p className="text-gray-500 text-sm mt-1">Dispatch request from your fleet manager</p>
        </div>

        {request && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 space-y-2 text-sm">
            {request.vin && (
              <div className="flex justify-between">
                <span className="text-gray-500">VIN</span>
                <span className="font-medium font-mono">{request.vin}</span>
              </div>
            )}
            {request.fmc_locations && (
              <div className="flex justify-between">
                <span className="text-gray-500">Location</span>
                <span className="font-medium">{request.fmc_locations.name}</span>
              </div>
            )}
            {request.notes && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-gray-500 text-xs mb-1">Notes</p>
                <p className="text-gray-700">{request.notes}</p>
              </div>
            )}
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
          onClick={handleStartInspection}
          disabled={!inspectorName.trim()}
          className="w-full bg-[#1e3a5f] hover:bg-[#162d4a] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Begin Inspection
        </button>
      </div>
    </div>
  )
}

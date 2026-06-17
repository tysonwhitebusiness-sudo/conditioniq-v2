'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import { Car, Send, ChevronRight, Loader2, ArrowLeft } from 'lucide-react'

type Step = 'menu' | 'start'

interface Props {
  open: boolean
  onClose: () => void
}

export default function StartInspectionSheet({ open, onClose }: Props) {
  const router = useRouter()
  const { effectiveCompany, user } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const dispatchEnabled = useFeatureFlag('dispatch')

  const [step, setStep] = useState<Step>('menu')
  const [vin, setVin] = useState('')
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [decoding, setDecoding] = useState(false)
  const [starting, setStarting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [resumeData, setResumeData] = useState<{ inspectionId: string; startedAt: string } | null>(null)
  const [pendingStart, setPendingStart] = useState<{ vin: string; year: string; make: string; model: string } | null>(null)

  const cleanVin = vin.trim().toUpperCase()

  const decode = async (v: string) => {
    setDecoding(true)
    try {
      const { decodeVINAction } = await import('@/lib/vin-actions')
      const r = await decodeVINAction(v)
      if (r) { setYear(r.year ?? ''); setMake(r.make ?? ''); setModel(r.model ?? '') }
    } finally { setDecoding(false) }
  }

  useEffect(() => {
    if (cleanVin.length === 17) decode(cleanVin)
    else { setYear(''); setMake(''); setModel('') }
  }, [cleanVin])

  // When dispatch is disabled skip the menu and show VIN form directly
  const showMenu = !!dispatchEnabled && step === 'menu'
  const showVinForm = !dispatchEnabled || step === 'start'

  const reset = () => {
    setStep('menu')
    setVin(''); setYear(''); setMake(''); setModel('')
    setResumeData(null)
    setPendingStart(null)
  }

  const close = () => { reset(); onClose() }

  const proceedWithStart = async (vd?: { vin: string; year?: string; make?: string; model?: string }) => {
    if (!effectiveCompany || !user) return
    const { initiateInspection } = await import('@/lib/usage-actions')
    const { getDeviceId } = await import('@/lib/device-id')

    if (vd?.vin) {
      const { addVehicleToSystem } = await import('@/lib/storage-actions')
      await addVehicleToSystem(effectiveCompany.id, {
        vin: vd.vin, year: vd.year, make: vd.make, model: vd.model,
        lifecycleStatus: 'on_lot',
      }).catch(() => {})
    }

    const { inspectionId } = await initiateInspection({
      companyId: effectiveCompany.id,
      inspectorId: user.id,
      initialData: vd?.vin ? { vin: vd.vin, year: vd.year, make: vd.make, model: vd.model } : undefined,
      deviceId: getDeviceId(),
    })

    try { sessionStorage.setItem('pending_inspection_id', inspectionId) } catch {}
    close()
    router.push('/vehicles')
  }

  const startInspection = async () => {
    if (!effectiveCompany || !user) return
    setStarting(true)
    try {
      const vd = cleanVin ? { vin: cleanVin, year, make, model } : undefined

      if (vd?.vin) {
        const { checkExistingInspection } = await import('@/lib/usage-actions')
        const existing = await checkExistingInspection(effectiveCompany.id, vd.vin)
        if (existing) {
          setResumeData(existing)
          setPendingStart(vd)
          setStarting(false)
          return
        }
      }

      await proceedWithStart(vd)
    } catch (e: any) {
      setErrorMsg('Failed to start: ' + e.message)
    } finally { setStarting(false) }
  }

  const handleResume = () => {
    if (!resumeData) return
    try { sessionStorage.setItem('pending_inspection_id', resumeData.inspectionId) } catch {}
    setResumeData(null)
    setPendingStart(null)
    close()
    router.push('/vehicles')
  }

  const handleStartFresh = async () => {
    if (!resumeData || !pendingStart) return
    setStarting(true)
    try {
      const { abandonInspection } = await import('@/lib/usage-actions')
      await abandonInspection(resumeData.inspectionId)
      const vd = pendingStart
      setResumeData(null)
      setPendingStart(null)
      await proceedWithStart(vd)
    } catch (e: any) {
      setErrorMsg('Failed to start: ' + e.message)
    } finally { setStarting(false) }
  }

  const handleDispatch = () => {
    close()
    router.push('/storage/dispatch')
  }

  if (!open) return null

  const canStart = !starting && cleanVin.length === 17

  const sheetStyle: React.CSSProperties = isDesktop
    ? {
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 201, background: '#FFFFFF', borderRadius: 20,
        width: 420, maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(13,27,42,0.2)',
      }
    : {
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: '#FFFFFF', borderRadius: '28px 28px 0 0',
        paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 -8px 40px rgba(13,27,42,0.2)',
      }

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(13,27,42,0.6)' }} />
      <div style={sheetStyle}>
        {!isDesktop && (
          <div style={{ width: 40, height: 4, background: '#E1E8F0', borderRadius: 2, margin: '12px auto 0' }} />
        )}

        <div style={{ padding: '20px 20px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            {showVinForm && !!dispatchEnabled ? (
              <button onClick={() => setStep('menu')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00B4D8', fontSize: 13, fontFamily: 'inherit', fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeft size={14} /> Back
              </button>
            ) : <div />}
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>New Inspection</h2>
            <div style={{ width: 48 }} />
          </div>

          {/* Two-option menu — Growth+ only */}
          {showMenu && (
            <>
              <button onClick={() => setStep('start')}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 14px', borderRadius: 14, border: '1.5px solid #E1E8F0', background: '#FFFFFF', cursor: 'pointer', marginBottom: 10, textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: '#F4A62A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Car size={20} color="#FFFFFF" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Start Inspection</p>
                  <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Run an inspection yourself</p>
                </div>
                <ChevronRight size={18} color="#CBD5E1" />
              </button>

              <button onClick={handleDispatch}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 14px', borderRadius: 14, border: '1.5px solid #E1E8F0', background: '#FFFFFF', cursor: 'pointer', marginBottom: 10, textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Send size={20} color="#FFFFFF" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Dispatch</p>
                  <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Send to a remote inspector</p>
                </div>
                <ChevronRight size={18} color="#CBD5E1" />
              </button>
            </>
          )}

          {/* VIN entry form */}
          {showVinForm && (
            <div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>VIN *</label>
                <div style={{ position: 'relative' }}>
                  <input
                    value={vin}
                    onChange={e => setVin(e.target.value.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase().slice(0, 17))}
                    placeholder="17-character VIN"
                    maxLength={17}
                    style={{ width: '100%', height: 44, border: '1.5px solid #E1E8F0', borderRadius: 10, padding: '0 40px 0 12px', fontSize: 14, fontFamily: 'monospace', outline: 'none', background: '#FAFAFA', boxSizing: 'border-box' }}
                  />
                  {decoding && (
                    <Loader2 size={15} color="#00B4D8" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', animation: 'spin 0.8s linear infinite' }} />
                  )}
                </div>
              </div>

              {(year || make || model) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {([['Year', year, setYear], ['Make', make, setMake], ['Model', model, setModel]] as const).map(([lbl, val, setter]) => (
                    <div key={lbl as string}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{lbl as string}</label>
                      <input value={val as string} onChange={e => (setter as any)(e.target.value)}
                        style={{ width: '100%', height: 40, border: '1.5px solid #E1E8F0', borderRadius: 8, padding: '0 8px', fontSize: 13, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={startInspection}
                disabled={!canStart}
                style={{
                  width: '100%', height: 52, borderRadius: 14, border: 'none',
                  background: canStart ? '#F4A62A' : '#E1E8F0',
                  color: canStart ? '#0D1B2A' : '#94A3B8',
                  fontWeight: 700, fontSize: 16, cursor: canStart ? 'pointer' : 'default',
                  fontFamily: 'inherit', marginBottom: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {starting
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Starting…</>
                  : 'Start Inspection'}
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: '4px 20px 16px' }}>
          <button onClick={close}
            style={{ width: '100%', height: 48, borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FFFFFF', color: '#4A5568', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
        </div>
      </div>

      {resumeData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => { setResumeData(null); setPendingStart(null) }} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px' }}>Inspection In Progress</h3>
            <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>
              An inspection for this vehicle is already in progress{resumeData ? ` (started ${new Date(resumeData.startedAt).toLocaleDateString()})` : ''}. Resume to continue where you left off, or start fresh.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={handleResume} disabled={starting}
                style={{ height: 48, borderRadius: 12, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: starting ? 0.6 : 1 }}>
                Resume Inspection
              </button>
              <button onClick={handleStartFresh} disabled={starting}
                style={{ height: 48, borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: starting ? 0.6 : 1 }}>
                {starting ? 'Starting…' : 'Start Fresh'}
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setErrorMsg(null)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 12px' }}>Something went wrong</h3>
            <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>{errorMsg}</p>
            <button onClick={() => setErrorMsg(null)} style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>OK</button>
          </div>
        </div>
      )}
    </>
  )
}

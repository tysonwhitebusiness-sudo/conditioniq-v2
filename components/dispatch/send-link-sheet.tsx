'use client'

import { useState, useEffect } from 'react'
import { X, Copy, Check, Mail, Send, Loader2, CheckCircle } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { getStorageLocations } from '@/lib/storage-actions'
import { createDispatchAction } from '@/lib/dispatch-actions'

export interface SendLinkSheetProps {
  isOpen: boolean
  onClose: () => void
  prefilledVin?: string
  prefilledYear?: string
  prefilledMake?: string
  prefilledModel?: string
}

type Phase = 'form' | 'generated'

export default function SendLinkSheet({
  isOpen, onClose,
  prefilledVin, prefilledYear, prefilledMake, prefilledModel,
}: SendLinkSheetProps) {
  const { effectiveCompany } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isFMC = effectiveCompany?.account_type === 'fmc'

  const [vin, setVin] = useState('')
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [notes, setNotes] = useState('')
  const [locationId, setLocationId] = useState('')
  const [locations, setLocations] = useState<any[]>([])

  const [decoding, setDecoding] = useState(false)
  const [decodeOk, setDecodeOk] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [vinError, setVinError] = useState('')
  const [genError, setGenError] = useState('')

  const [phase, setPhase] = useState<Phase>('form')
  const [generatedLink, setGeneratedLink] = useState('')
  const [generatedVin, setGeneratedVin] = useState('')
  const [copied, setCopied] = useState(false)

  const cleanVin = vin.trim().toUpperCase()
  const vinValid = cleanVin.length === 17

  // Reset on open
  useEffect(() => {
    if (!isOpen) return
    setVin(prefilledVin ?? '')
    setYear(prefilledYear ?? '')
    setMake(prefilledMake ?? '')
    setModel(prefilledModel ?? '')
    setNotes('')
    setLocationId('')
    setDecoding(false); setDecodeOk(!!(prefilledYear || prefilledMake))
    setGenerating(false); setVinError(''); setGenError('')
    setPhase('form'); setGeneratedLink(''); setCopied(false)
  }, [isOpen])

  // Lock scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Load FMC locations
  useEffect(() => {
    if (!isOpen || !isFMC || !effectiveCompany?.id) return
    getStorageLocations(effectiveCompany.id).then(setLocations).catch(() => {})
  }, [isOpen, isFMC, effectiveCompany?.id])

  // Auto-decode when VIN hits 17
  useEffect(() => {
    if (cleanVin.length !== 17) { setDecodeOk(false); return }
    autoDecode(cleanVin)
  }, [cleanVin])

  const autoDecode = async (v: string) => {
    setDecoding(true)
    setDecodeOk(false)
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${v}?format=json`)
      const data = await res.json()
      const r = data.Results?.[0]
      if (r) {
        setYear(r.ModelYear || '')
        setMake(r.Make || '')
        setModel(r.Model || '')
        setDecodeOk(true)
      }
    } catch {}
    finally { setDecoding(false) }
  }

  const handleVinChange = (raw: string) => {
    const cleaned = raw.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase().slice(0, 17)
    setVin(cleaned)
    setVinError('')
    if (cleaned.length < 17) { setYear(''); setMake(''); setModel(''); setDecodeOk(false) }
  }

  const handleGenerate = async () => {
    if (!effectiveCompany) return
    if (!vinValid) { setVinError('Please enter a valid 17-character VIN'); return }
    setGenerating(true); setGenError('')
    try {
      const { token, error } = await createDispatchAction({
        companyId: effectiveCompany.id,
        vin: cleanVin,
        year: year || null,
        make: make || null,
        model: model || null,
        notes: notes.trim() || null,
        locationId: locationId || null,
      })
      if (error) throw new Error(error)
      const link = `${window.location.origin}/inspect/${token}`
      setGeneratedLink(link)
      setGeneratedVin(cleanVin)
      setPhase('generated')
    } catch (e: any) {
      setGenError(e.message ?? 'Failed to generate link')
    } finally { setGenerating(false) }
  }

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(generatedLink); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }

  const handleEmail = () => {
    const body = `Please complete the vehicle inspection for VIN: ${generatedVin}\n\nInspection Link: ${generatedLink}\n\nThis link expires in 48 hours.`
    window.open(`mailto:?subject=${encodeURIComponent('Vehicle Inspection Request')}&body=${encodeURIComponent(body)}`, '_blank')
  }

  const handleSendAnother = () => {
    setVin(''); setYear(''); setMake(''); setModel(''); setNotes(''); setLocationId('')
    setDecodeOk(false); setVinError(''); setGenError('')
    setPhase('form'); setGeneratedLink('')
  }

  if (!isOpen) return null

  const backdropStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(13,27,42,0.6)',
  }

  const sheetStyle: React.CSSProperties = isDesktop ? {
    position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 201,
    width: 480, background: '#FFFFFF',
    borderRadius: '16px 0 0 16px',
    boxShadow: '-8px 0 40px rgba(13,27,42,0.15)',
    display: 'flex', flexDirection: 'column', overflowY: 'auto',
  } : {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
    background: '#FFFFFF',
    borderRadius: '28px 28px 0 0',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 -8px 40px rgba(13,27,42,0.15)',
  }

  const inputBase: React.CSSProperties = {
    width: '100%', background: '#F5F8FA', border: '1px solid #E1E8F0',
    borderRadius: 10, padding: '0 14px', fontSize: 15, color: '#0D1B2A',
    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
    transition: 'border-color 150ms, box-shadow 150ms',
  }

  const vinBorderColor = vinValid ? '#10B981' : '#E1E8F0'
  const vinBoxShadow = vinValid ? '0 0 0 3px rgba(16,185,129,0.12)' : undefined

  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 6 }

  return (
    <>
      <div style={backdropStyle} onClick={onClose} />
      <div style={sheetStyle}>
        {/* Handle bar — mobile only */}
        {!isDesktop && (
          <div style={{ width: 40, height: 4, background: '#E1E8F0', borderRadius: 2, margin: '14px auto 0', flexShrink: 0 }} />
        )}

        {/* Header */}
        <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Send Inspection Link</h2>
            <button onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, background: '#F5F8FA', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#94A3B8" />
            </button>
          </div>
        </div>

        <div style={{ padding: '0 20px', flex: 1, overflowY: 'auto' }}>
          {phase === 'form' ? (
            <>
              {/* VIN */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={labelStyle}>VIN <span style={{ color: '#EF4444' }}>*</span></label>
                  <span style={{ fontSize: 12, color: vinValid ? '#10B981' : '#94A3B8', fontWeight: 600 }}>{cleanVin.length}/17</span>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    value={vin}
                    onChange={e => handleVinChange(e.target.value)}
                    placeholder="Enter 17-character VIN"
                    maxLength={17}
                    style={{
                      ...inputBase, height: 48,
                      fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase',
                      paddingRight: 40,
                      border: `1px solid ${vinBorderColor}`,
                      boxShadow: vinBoxShadow,
                    }}
                  />
                  {/* Decode status icon */}
                  <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
                    {decoding && <Loader2 size={16} color="#00B4D8" style={{ animation: 'spin 0.8s linear infinite' }} />}
                    {!decoding && decodeOk && <Check size={16} color="#10B981" />}
                  </div>
                </div>
                {vinError && <p style={{ fontSize: 12, color: '#EF4444', margin: '4px 0 0' }}>{vinError}</p>}
              </div>

              {/* Year / Make / Model */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                {([['Year', year, setYear], ['Make', make, setMake], ['Model', model, setModel]] as const).map(([lbl, val, setter]) => (
                  <div key={lbl as string}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>{lbl as string}</label>
                    <input
                      value={val as string}
                      onChange={e => (setter as any)(e.target.value)}
                      placeholder={lbl as string}
                      style={{
                        ...inputBase, height: 44, fontSize: 14, padding: '0 10px',
                        background: decodeOk && val ? '#F0F4F8' : '#F5F8FA',
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Location (FMC only) */}
              {isFMC && locations.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Location</label>
                  <select
                    value={locationId}
                    onChange={e => setLocationId(e.target.value)}
                    style={{ ...inputBase, height: 48, appearance: 'none', cursor: 'pointer' }}>
                    <option value="">Select location…</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={labelStyle}>Notes</label>
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>Optional</span>
                </div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Instructions for the inspector..."
                  rows={3}
                  style={{ ...inputBase, minHeight: 80, padding: '12px 14px', resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              {/* Warning text */}
              {!vinValid && (
                <p style={{ fontSize: 12, color: '#F4A62A', fontWeight: 600, textAlign: 'center', margin: '0 0 8px' }}>
                  Enter a valid 17-character VIN to continue
                </p>
              )}

              {genError && <p style={{ fontSize: 12, color: '#EF4444', textAlign: 'center', margin: '0 0 8px' }}>{genError}</p>}

              {/* Generate button */}
              <button
                onClick={handleGenerate}
                disabled={!vinValid || generating}
                style={{
                  width: '100%', height: 52, borderRadius: 12, border: 'none',
                  background: vinValid && !generating ? '#00B4D8' : '#E1E8F0',
                  color: vinValid && !generating ? '#FFFFFF' : '#94A3B8',
                  fontWeight: 700, fontSize: 15, cursor: vinValid && !generating ? 'pointer' : 'not-allowed',
                  fontFamily: 'inherit',
                  boxShadow: vinValid ? '0 4px 12px rgba(0,180,216,0.3)' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  marginBottom: 16,
                }}>
                {generating
                  ? <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} />Generating…</>
                  : <><Send size={15} />Generate Link</>}
              </button>
            </>
          ) : (
            /* ── Generated state ──────────────────────────────────────── */
            <>
              {/* Success icon */}
              <div style={{ textAlign: 'center', margin: '16px 0 20px' }}>
                <div style={{ width: 56, height: 56, borderRadius: 28, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <CheckCircle size={28} color="#065F46" />
                </div>
                <p style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: '0 0 4px' }}>Link Generated!</p>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
                  {generatedVin}{(make || model || year) ? ` · ${[year, make, model].filter(Boolean).join(' ')}` : ''}
                </p>
              </div>

              {/* Copy link */}
              <div style={{ background: '#F5F8FA', border: '1px solid #E1E8F0', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <p style={{ flex: 1, fontSize: 12, fontFamily: 'monospace', color: '#0D1B2A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {generatedLink}
                </p>
                <button onClick={handleCopy}
                  style={{
                    flexShrink: 0, height: 34, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: copied ? '#D1FAE5' : '#E0F7FC',
                    color: copied ? '#065F46' : '#00B4D8',
                    fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  }}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Send via Email */}
              <button onClick={handleEmail}
                style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                <Mail size={16} />Send via Email
              </button>

              {/* Send Another */}
              <button onClick={handleSendAnother}
                style={{ width: '100%', height: 44, borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>
                Send Another
              </button>

              {/* Done */}
              <button onClick={onClose}
                style={{ width: '100%', height: 48, borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 16 }}>
                Done
              </button>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}

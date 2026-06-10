'use client'

import { useState, useEffect } from 'react'
import { X, Copy, Check, Mail } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'

interface Props {
  open: boolean
  onClose: () => void
}

type Phase = 'form' | 'link'

export default function SendToInspectorSheet({ open, onClose }: Props) {
  const { effectiveCompany } = useAuth()
  const [vin, setVin] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>('form')
  const [generatedLink, setGeneratedLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [vinFocused, setVinFocused] = useState(false)
  const [notesFocused, setNotesFocused] = useState(false)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Reset state when sheet opens
  useEffect(() => {
    if (open) {
      setVin('')
      setNotes('')
      setLoading(false)
      setPhase('form')
      setGeneratedLink('')
      setCopied(false)
      setError('')
    }
  }, [open])

  const handleGenerate = async () => {
    if (!effectiveCompany) return
    setLoading(true)
    setError('')
    try {
      const token = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      const supabase = createClient()
      const { error: dbErr } = await supabase
        .from('inspection_requests')
        .insert({
          company_id: effectiveCompany.id,
          vin: vin.trim() || null,
          notes: notes.trim() || null,
          token,
          expires_at: expiresAt,
        })
      if (dbErr) throw dbErr
      const link = `${window.location.origin}/inspect/${token}`
      setGeneratedLink(link)
      setPhase('link')
    } catch (e: any) {
      setError(e.message ?? 'Failed to generate link')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generatedLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const handleEmail = () => {
    const subject = encodeURIComponent('Vehicle Inspection Link')
    const body = encodeURIComponent(
      `Hi,\n\nHere is a link to complete a vehicle inspection:\n\n${generatedLink}\n\nThis link expires in 48 hours.\n\nThank you.`
    )
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank')
  }

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: '100%',
    background: '#F5F8FA',
    border: `1px solid ${focused ? '#00B4D8' : '#E1E8F0'}`,
    borderRadius: 10,
    padding: '0 14px',
    fontSize: 15,
    color: '#0D1B2A',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 150ms ease',
    fontFamily: 'inherit',
  })

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    color: '#374151',
    display: 'block',
    marginBottom: 6,
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.65)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'relative',
        background: '#FFFFFF',
        borderRadius: '28px 28px 0 0',
        padding: '12px 20px',
        paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Handle */}
        <div style={{ width: 40, height: 4, background: '#E1E8F0', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, position: 'relative' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>
            Send Inspection Link
          </h2>
          <button
            onClick={onClose}
            style={{
              position: 'absolute', right: 0,
              width: 32, height: 32, borderRadius: 16,
              background: '#F5F8FA', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} color="#94A3B8" />
          </button>
        </div>

        {phase === 'form' ? (
          <>
            {/* VIN field */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>VIN</label>
              <input
                type="text"
                value={vin}
                onChange={e => setVin(e.target.value.toUpperCase())}
                onFocus={() => setVinFocused(true)}
                onBlur={() => setVinFocused(false)}
                placeholder="Enter VIN (optional)"
                maxLength={17}
                style={{ ...inputStyle(vinFocused), height: 48 }}
              />
            </div>

            {/* Notes field */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onFocus={() => setNotesFocused(true)}
                onBlur={() => setNotesFocused(false)}
                placeholder="Any instructions for the inspector (optional)"
                rows={3}
                style={{
                  ...inputStyle(notesFocused),
                  minHeight: 80,
                  padding: '12px 14px',
                  resize: 'vertical',
                  lineHeight: 1.5,
                }}
              />
            </div>

            {error && (
              <p style={{ fontSize: 13, color: '#EF4444', margin: '0 0 12px', textAlign: 'center' }}>{error}</p>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={loading}
              style={{
                width: '100%', height: 52, borderRadius: 12, border: 'none', cursor: loading ? 'default' : 'pointer',
                background: loading ? '#E1E8F0' : '#F4A62A',
                color: loading ? '#94A3B8' : '#0D1B2A',
                fontWeight: 700, fontSize: 15,
                marginTop: 16,
                transition: 'background 150ms ease',
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'Generating…' : 'Generate Link'}
            </button>
          </>
        ) : (
          <>
            {/* Success state */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8, margin: '0 0 8px' }}>
                Shareable Link
              </p>
              {/* Link row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: '#F5F8FA', border: '1px solid #E1E8F0',
                borderRadius: 10, padding: '12px 14px',
              }}>
                <p style={{
                  flex: 1, fontSize: 13, fontFamily: 'monospace', color: '#0D1B2A',
                  margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {generatedLink}
                </p>
                <button
                  onClick={handleCopy}
                  style={{
                    flexShrink: 0,
                    display: 'flex', alignItems: 'center', gap: 5,
                    height: 34, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: copied ? '#D1FAE5' : '#E0F7FC',
                    color: copied ? '#065F46' : '#00B4D8',
                    fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                    transition: 'background 150ms ease, color 150ms ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>

              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 8, margin: '8px 0 0' }}>
                This link expires in 48 hours.
              </p>
            </div>

            {/* Email button */}
            <button
              onClick={handleEmail}
              style={{
                width: '100%', height: 48, borderRadius: 12, cursor: 'pointer',
                background: '#FFFFFF', border: '1.5px solid #E1E8F0',
                color: '#0D1B2A', fontWeight: 600, fontSize: 15,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: 'inherit',
              }}
            >
              <Mail size={18} color="#00B4D8" />
              Send via Email
            </button>

            {/* Done button */}
            <button
              onClick={onClose}
              style={{
                width: '100%', height: 52, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: '#F4A62A', color: '#0D1B2A',
                fontWeight: 700, fontSize: 15, marginTop: 12,
                fontFamily: 'inherit',
              }}
            >
              Done
            </button>
          </>
        )}
      </div>
    </div>
  )
}

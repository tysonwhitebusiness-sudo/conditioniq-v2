'use client'

import { useState, useEffect, useCallback } from 'react'
import { markEmailSent } from '@/lib/crm-actions'
import { sendEmail } from '@/lib/send-email'
import { Wand2, RefreshCw, Mail, Check, X } from 'lucide-react'

const STORAGE_SYSTEM_PROMPT = `You write short cold outreach emails for Condition IQ, a vehicle condition reporting SaaS.

THE CORE PROBLEM (lead with this):
Storage facilities are sending informal phone photos to document vehicle condition instead of professional reports. This creates liability exposure and leaves money on the table — facilities can charge tenants $25-45 per report as a professional service.

THE SECONDARY BENEFIT (mention after):
Transparent subscription pricing starting at $99/mo. No enterprise contracts, no setup fees.

Write a short personalized cold email using the prospect name, company, and job title provided.

Rules:
- Under 75 words including subject line
- Do not start with I
- No em dashes anywhere in the email
- No bullet points in body
- Casual and direct, not salesy
- Open with something relevant to their role
- One value prop
- End with a yes or no question
- Subject line 5 words or less
- No signature

Format:
Subject: [subject line]

[email body]`

const TOW_SYSTEM_PROMPT = `You write short cold outreach emails for Condition IQ, a vehicle condition reporting SaaS.

THE CORE PROBLEM (lead with this):
Tow and impound operators face damage claim disputes with no documentation to back them up. Pre-tow condition reports with timestamped photos and inspector certification protect against false claims and give operators a defensible paper trail.

THE SECONDARY BENEFIT (mention after):
Transparent subscription pricing starting at $99/mo. Runs on any phone or tablet, averages 11 minutes per inspection.

Write a short personalized cold email using the prospect name, company, and job title provided.

Rules:
- Under 75 words including subject line
- Do not start with I
- No em dashes anywhere in the email
- No bullet points in body
- Casual and direct, not salesy
- Open with something relevant to their role
- One value prop
- End with a yes or no question
- Subject line 5 words or less
- No signature

Format:
Subject: [subject line]

[email body]`

const TOUCH_LABELS = ['Initial Outreach', 'Day 5 Follow-up', 'Day 12 Final']

interface Props {
  lead: any
  initialTouchNumber?: number
  onSent?: () => void
  onClose?: () => void
}

export default function EmailGenerator({ lead, initialTouchNumber = 1, onSent, onClose }: Props) {
  const [companyType, setCompanyType] = useState<'storage' | 'tow'>(lead.company_type === 'tow_impound' ? 'tow' : 'storage')
  const [touchNumber, setTouchNumber] = useState(initialTouchNumber)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [prevBody, setPrevBody] = useState('')
  const [generating, setGenerating] = useState(false)
  const [marking, setMarking] = useState(false)
  const [marked, setMarked] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generateEmail = useCallback(async () => {
    setGenerating(true)
    setError(null)
    setPrevBody(body)
    try {
      const systemPrompt = companyType === 'storage' ? STORAGE_SYSTEM_PROMPT : TOW_SYSTEM_PROMPT
      const userMessage = `Write a ${TOUCH_LABELS[touchNumber - 1]} email for:\nName: ${lead.first_name} ${lead.last_name}\nCompany: ${lead.company}\nJob Title: ${lead.job_title ?? 'N/A'}\nTouch: ${TOUCH_LABELS[touchNumber - 1]}`

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 256,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
        }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)
      const data = await res.json()
      const text: string = data.content?.[0]?.text ?? ''
      const lines = text.split('\n')
      const subjectLine = lines.find((l: string) => l.startsWith('Subject:'))?.replace('Subject:', '').trim() ?? ''
      const bodyText = lines.slice(lines.findIndex((l: string) => l.startsWith('Subject:')) + 2).join('\n').trim()
      setSubject(subjectLine)
      setBody(bodyText)
    } catch (e: any) {
      setError(e.message ?? 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }, [companyType, touchNumber, lead, body])

  const handleOpenMail = useCallback(() => {
    sendEmail({ to: lead.email, subject, body })
  }, [lead.email, subject, body])

  const handleMarkSent = useCallback(async () => {
    if (!subject || !body) return
    setMarking(true)
    try {
      await markEmailSent({ leadId: lead.id, touchNumber, subject, body })
      setMarked(true)
      onSent?.()
    } catch {
      setError('Failed to mark as sent')
    } finally {
      setMarking(false)
    }
  }, [lead.id, touchNumber, subject, body, onSent])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') generateEmail()
      if ((e.key === 'm' || e.key === 'M') && subject) handleOpenMail()
      if ((e.key === 's' || e.key === 'S') && subject) handleMarkSent()
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [generateEmail, handleOpenMail, handleMarkSent, onClose, subject])

  if (marked) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-3">
        <div className="w-12 h-12 rounded-full bg-green-900 flex items-center justify-center">
          <Check size={24} className="text-green-400" />
        </div>
        <p className="text-white font-medium">Marked as sent!</p>
        <button onClick={onClose} className="text-gray-400 text-sm">Close</button>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white font-medium">{lead.first_name} {lead.last_name}</p>
          <p className="text-xs text-gray-400">{lead.company} · {lead.email}</p>
        </div>
        {onClose && <button onClick={onClose}><X size={18} className="text-gray-400" /></button>}
      </div>

      {/* Company type tabs */}
      <div className="flex gap-1 bg-gray-700 rounded-xl p-1">
        <button onClick={() => setCompanyType('storage')} className={`flex-1 py-2 rounded-lg text-xs font-medium ${companyType === 'storage' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>
          Storage Facility
        </button>
        <button onClick={() => setCompanyType('tow')} className={`flex-1 py-2 rounded-lg text-xs font-medium ${companyType === 'tow' ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>
          Tow & Impound
        </button>
      </div>

      {/* Touch number */}
      <div className="flex gap-2">
        {TOUCH_LABELS.map((label, i) => (
          <button
            key={i}
            onClick={() => setTouchNumber(i + 1)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium ${touchNumber === i + 1 ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}
          >
            {i === 0 ? 'Initial' : i === 1 ? 'Day 5' : 'Day 12'}
          </button>
        ))}
      </div>

      {/* Generate button */}
      <button
        onClick={generateEmail}
        disabled={generating}
        className="w-full flex items-center justify-center gap-2 py-3 bg-[#dc5010] text-white rounded-xl font-medium text-sm disabled:opacity-50"
      >
        {generating ? <RefreshCw size={16} className="animate-spin" /> : <Wand2 size={16} />}
        {generating ? 'Generating...' : 'Generate Email (G)'}
      </button>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Email editor */}
      {subject && (
        <>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={6} className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none" />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleOpenMail}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-600 text-gray-300 rounded-xl text-sm"
            >
              <Mail size={15} /> Open in Mail (M)
            </button>
            <button
              onClick={handleMarkSent}
              disabled={marking}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-700 text-white rounded-xl text-sm disabled:opacity-50"
            >
              <Check size={15} /> Mark Sent (S)
            </button>
          </div>

          {prevBody && (
            <button
              onClick={() => { setBody(prevBody); setPrevBody('') }}
              className="text-xs text-gray-500 underline"
            >
              Restore previous version
            </button>
          )}
        </>
      )}
    </div>
  )
}

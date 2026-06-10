'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getQueueLeads, updateLeadPin, markEmailSent, getTodayGoals, incrementDailyGoal, addCRMNote, logLinkedInRequest } from '@/lib/crm-actions'
import { sendEmail } from '@/lib/send-email'
import { Pin, SkipForward, Mail, Check, X, Wand2, RefreshCw, ChevronDown, Linkedin, Filter, Zap } from 'lucide-react'

const PRIORITY_CFG: Record<string, { label: string; bg: string; color: string }> = {
  P0: { label: 'P0', bg: '#FEE2E2', color: '#DC2626' },
  P1: { label: 'P1', bg: '#FEF3C7', color: '#D97706' },
  P2: { label: 'P2', bg: '#F0F4F8', color: '#4A5568' },
}
const CT_LABELS: Record<string, string> = { storage_facility: 'Storage', tow_impound: 'Tow/Impound', fleet: 'Fleet', fmc: 'FMC', other: 'Other' }

const STORAGE_PROMPT = `You write short cold outreach emails for Condition IQ, a vehicle condition reporting SaaS.

THE CORE PROBLEM:
Storage facilities are sending informal phone photos to document vehicle condition instead of professional reports. This creates liability exposure and leaves money on the table — facilities can charge tenants $25-45 per report as a professional service.

THE SECONDARY BENEFIT:
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

const TOW_PROMPT = `You write short cold outreach emails for Condition IQ, a vehicle condition reporting SaaS.

THE CORE PROBLEM:
Tow and impound operators face damage claim disputes with no documentation to back them up. Pre-tow condition reports with timestamped photos and inspector certification protect against false claims and give operators a defensible paper trail.

THE SECONDARY BENEFIT:
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

function PriorityBadge({ p }: { p: string }) {
  const cfg = PRIORITY_CFG[p] ?? PRIORITY_CFG.P2
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
}

interface QueueLead {
  id: string; first_name: string; last_name: string; email: string; company: string
  job_title: string; company_type: string; priority: string; pinned: boolean
  status: string; created_at: string; updated_at: string
  crm_email_touches: { id: string; touch_number: number; sent_at: string; replied: boolean }[]
}

function categorize(leads: QueueLead[]) {
  const now = Date.now()
  const smart: QueueLead[] = []
  const day5: QueueLead[] = []
  const day12: QueueLead[] = []

  for (const l of leads) {
    const touches = l.crm_email_touches ?? []
    const t1 = touches.find(t => t.touch_number === 1)
    const t2 = touches.find(t => t.touch_number === 2)
    const hasReply = touches.some(t => t.replied)
    if (hasReply) continue

    if (touches.length === 0) { smart.push(l); continue }
    if (t1 && !t2) {
      const daysSince = (now - new Date(t1.sent_at).getTime()) / 86400000
      if (daysSince >= 5) { day5.push(l); continue }
    }
    if (t2 && touches.length < 3) {
      const daysSince = (now - new Date(t2.sent_at).getTime()) / 86400000
      if (daysSince >= 7) { day12.push(l); continue }
    }
    smart.push(l)
  }

  const sortPriority = (a: QueueLead, b: QueueLead) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const order: Record<string, number> = { P0: 0, P1: 1, P2: 2 }
    return (order[a.priority] ?? 2) - (order[b.priority] ?? 2)
  }
  return { smart: smart.sort(sortPriority), day5: day5.sort(sortPriority), day12: day12.sort(sortPriority) }
}

function QuickSendPanel({ lead, onClose, onSent }: { lead: QueueLead; onClose: () => void; onSent: () => void }) {
  const [template, setTemplate] = useState<'storage' | 'tow'>(lead.company_type === 'tow_impound' ? 'tow' : 'storage')
  const touches = lead.crm_email_touches ?? []
  const nextTouch = Math.min(3, touches.length + 1)
  const [touchNum, setTouchNum] = useState(nextTouch)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [prevBody, setPrevBody] = useState('')
  const [generating, setGenerating] = useState(false)
  const [mailOpened, setMailOpened] = useState(false)
  const [marking, setMarking] = useState(false)
  const [marked, setMarked] = useState(false)
  const [error, setError] = useState('')
  const [dmText, setDmText] = useState('')
  const [dmOpen, setDmOpen] = useState(false)
  const [genDm, setGenDm] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const generate = useCallback(async () => {
    setGenerating(true); setError('')
    setPrevBody(body)
    const system = template === 'storage' ? STORAGE_PROMPT : TOW_PROMPT
    const userMsg = `Write a ${TOUCH_LABELS[touchNum - 1]} email for:\nName: ${lead.first_name} ${lead.last_name}\nCompany: ${lead.company}\nJob Title: ${lead.job_title ?? 'N/A'}\nCompany Type: ${CT_LABELS[lead.company_type] ?? lead.company_type}`
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 256, system, messages: [{ role: 'user', content: userMsg }] }),
      })
      if (!res.ok) throw new Error(`API ${res.status}`)
      const data = await res.json()
      const text: string = data.content?.[0]?.text ?? ''
      const lines = text.split('\n')
      const subjLine = lines.find((l: string) => l.startsWith('Subject:'))?.replace('Subject:', '').trim() ?? ''
      const bodyStart = lines.findIndex((l: string) => l.startsWith('Subject:'))
      setSubject(subjLine)
      setBody(lines.slice(bodyStart + 2).join('\n').trim())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally { setGenerating(false) }
  }, [template, touchNum, lead, body])

  const generateDm = useCallback(async () => {
    setGenDm(true)
    const system = template === 'storage' ? STORAGE_PROMPT : TOW_PROMPT
    const userMsg = `Write a short LinkedIn DM (under 50 words) for ${lead.first_name} ${lead.last_name} at ${lead.company}. No subject line needed. Reference their role: ${lead.job_title ?? 'N/A'}.`
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 128, system, messages: [{ role: 'user', content: userMsg }] }),
      })
      const data = await res.json()
      setDmText(data.content?.[0]?.text ?? '')
    } finally { setGenDm(false) }
  }, [template, lead])

  const handleOpenMail = useCallback(() => {
    sendEmail({ to: lead.email, subject, body })
    setMailOpened(true)
  }, [lead.email, subject, body])

  const handleMarkSent = useCallback(async () => {
    if (!subject || !body) return
    setMarking(true)
    try {
      await markEmailSent({ leadId: lead.id, touchNumber: touchNum, subject, body })
      setMarked(true)
      onSent()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setMarking(false) }
  }, [lead.id, touchNum, subject, body, onSent])

  const handleLogLi = useCallback(async () => {
    await logLinkedInRequest(lead.id)
  }, [lead.id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') generate()
      if ((e.key === 'm' || e.key === 'M') && subject) handleOpenMail()
      if ((e.key === 's' || e.key === 'S') && mailOpened && subject) handleMarkSent()
      if (e.key === 'r' || e.key === 'R') generate()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [generate, handleOpenMail, handleMarkSent, onClose, subject, mailOpened])

  if (marked) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: 12 }}>
      <div style={{ width: 56, height: 56, borderRadius: 28, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Check size={28} color="#10B981" />
      </div>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Marked as sent!</p>
      <button onClick={onClose} style={{ fontSize: 13, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>Close</button>
    </div>
  )

  return (
    <div style={{ padding: 20, height: '100%', overflowY: 'auto', position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>{lead.first_name} {lead.last_name}</p>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>{lead.company} · {lead.email}</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <PriorityBadge p={lead.priority} />
          </div>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 14, background: '#F0F4F8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={14} color="#4A5568" />
        </button>
      </div>

      {/* Template tabs */}
      <div style={{ display: 'flex', background: '#F0F4F8', borderRadius: 10, padding: 3, marginBottom: 12 }}>
        {[{ k: 'storage', l: 'Storage Facility' }, { k: 'tow', l: 'Tow/Impound' }].map(({ k, l }) => (
          <button key={k} onClick={() => setTemplate(k as 'storage' | 'tow')}
            style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: template === k ? '#FFF' : 'transparent', color: template === k ? '#0D1B2A' : '#94A3B8', boxShadow: template === k ? '0 1px 3px rgba(13,27,42,0.1)' : 'none' }}>
            {l}
          </button>
        ))}
      </div>

      {/* Touch selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {TOUCH_LABELS.map((label, i) => (
          <button key={i} onClick={() => setTouchNum(i + 1)}
            style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: touchNum === i + 1 ? 'none' : '1px solid #E1E8F0', fontFamily: 'inherit', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: touchNum === i + 1 ? '#00B4D8' : '#FFF', color: touchNum === i + 1 ? '#FFF' : '#4A5568' }}>
            {i === 0 ? 'Initial' : `Day ${i === 1 ? 5 : 12}`}
          </button>
        ))}
      </div>

      {/* Generate */}
      <button onClick={generate} disabled={generating}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 0', borderRadius: 10, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontWeight: 700, fontSize: 14, cursor: generating ? 'default' : 'pointer', fontFamily: 'inherit', marginBottom: 12, opacity: generating ? 0.7 : 1 }}>
        {generating ? <RefreshCw size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Wand2 size={15} />}
        {generating ? 'Generating...' : 'Generate Email (G)'}
      </button>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {error && <p style={{ fontSize: 12, color: '#EF4444', margin: '0 0 10px' }}>{error}</p>}

      {/* Email fields */}
      {(subject || body) && (
        <>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#F5F8FA', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={7}
              style={{ width: '100%', border: '1px solid #E1E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#F5F8FA', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>
          {prevBody && (
            <button onClick={() => { setBody(prevBody); setPrevBody('') }}
              style={{ fontSize: 12, color: '#94A3B8', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 10px', fontFamily: 'inherit' }}>
              Restore previous version
            </button>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button onClick={handleOpenMail}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#0D1B2A', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Mail size={14} /> Open in Mail (M)
            </button>
            {mailOpened && (
              <button onClick={handleMarkSent} disabled={marking}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, border: 'none', background: '#10B981', color: '#FFF', fontSize: 13, fontWeight: 600, cursor: marking ? 'default' : 'pointer', fontFamily: 'inherit', opacity: marking ? 0.7 : 1 }}>
                <Check size={14} /> Mark Sent (S)
              </button>
            )}
          </div>
        </>
      )}

      {/* LinkedIn DM */}
      <div style={{ borderTop: '1px solid #F0F4F8', paddingTop: 12 }}>
        <button onClick={() => setDmOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#0D1B2A', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          <Linkedin size={14} color="#0077B5" /> LinkedIn DM <ChevronDown size={13} color="#94A3B8" style={{ transform: dmOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }} />
        </button>
        {dmOpen && (
          <div style={{ marginTop: 10 }}>
            <button onClick={generateDm} disabled={genDm}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#0077B5', color: '#FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8, opacity: genDm ? 0.7 : 1 }}>
              {genDm ? <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Wand2 size={13} />}
              Generate DM
            </button>
            {dmText && (
              <>
                <textarea value={dmText} onChange={e => setDmText(e.target.value)} rows={4}
                  style={{ width: '100%', border: '1px solid #E1E8F0', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit', background: '#F5F8FA', resize: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => navigator.clipboard.writeText(dmText)}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid #E1E8F0', background: '#FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Copy
                  </button>
                  <button onClick={handleLogLi}
                    style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: '#0077B5', color: '#FFF', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Log Request
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Shortcuts legend */}
      <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
        <button onClick={() => setShortcutsOpen(o => !o)}
          style={{ fontSize: 10, color: '#94A3B8', background: '#F0F4F8', border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
          Shortcuts
        </button>
        {shortcutsOpen && (
          <div style={{ position: 'absolute', bottom: 28, right: 0, background: '#0D1B2A', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: 'rgba(255,255,255,0.8)', width: 160, lineHeight: 1.8 }}>
            <div>G — Generate</div>
            <div>M — Open in Mail</div>
            <div>S — Mark Sent</div>
            <div>R — Regenerate</div>
            <div>ESC — Close</div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function OutreachQueue() {
  const [allLeads, setAllLeads] = useState<QueueLead[]>([])
  const [tab, setTab] = useState<'smart' | 'day5' | 'day12'>('smart')
  const [openLead, setOpenLead] = useState<QueueLead | null>(null)
  const [goals, setGoals] = useState<Record<string, unknown>>({ emails_sent: 0, email_goal: 25, linkedin_requests: 0, linkedin_goal: 15 })
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchGenerating, setBatchGenerating] = useState(false)

  const load = useCallback(async () => {
    const [leads, g] = await Promise.all([getQueueLeads(), getTodayGoals()])
    setAllLeads(leads as QueueLead[])
    setGoals(g as Record<string, unknown>)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const { smart, day5, day12 } = categorize(allLeads)
  const currentList = tab === 'smart' ? smart : tab === 'day5' ? day5 : day12

  const handlePin = async (lead: QueueLead, e: React.MouseEvent) => {
    e.stopPropagation()
    await updateLeadPin(lead.id, !lead.pinned)
    setAllLeads(prev => prev.map(l => l.id === lead.id ? { ...l, pinned: !l.pinned } : l))
  }

  const handleSkip = (lead: QueueLead, e: React.MouseEvent) => {
    e.stopPropagation()
    setAllLeads(prev => prev.filter(l => l.id !== lead.id))
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const emailPct = Math.min(100, ((goals.emails_sent as number ?? 0) / (goals.email_goal as number ?? 25)) * 100)
  const liPct = Math.min(100, ((goals.linkedin_requests as number ?? 0) / (goals.linkedin_goal as number ?? 15)) * 100)

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>Outreach Queue</h1>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>{smart.length + day5.length + day12.length} leads ready</p>
        </div>
        <div style={{ flex: 1 }} />
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#0D1B2A', fontFamily: 'inherit' }}>
          <Filter size={14} /> Filters
        </button>
        <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Zap size={14} /> Quick Send Mode
        </button>
      </div>

      {/* Daily goal strip */}
      <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0D1B2A' }}>Emails {goals.emails_sent as number}/{goals.email_goal as number}</span>
          </div>
          <div style={{ height: 6, background: '#F0F4F8', borderRadius: 3 }}>
            <div style={{ height: 6, width: `${emailPct}%`, background: emailPct >= 100 ? '#10B981' : '#00B4D8', borderRadius: 3 }} />
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#0D1B2A' }}>LinkedIn {goals.linkedin_requests as number}/{goals.linkedin_goal as number}</span>
          </div>
          <div style={{ height: 6, background: '#F0F4F8', borderRadius: 3 }}>
            <div style={{ height: 6, width: `${liPct}%`, background: liPct >= 100 ? '#10B981' : '#0077B5', borderRadius: 3 }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        {/* Lead list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#F0F4F8', padding: 4, borderRadius: 12 }}>
            {([['smart', 'Smart Queue', smart.length], ['day5', 'Day 5', day5.length], ['day12', 'Day 12', day12.length]] as const).map(([k, l, cnt]) => (
              <button key={k} onClick={() => setTab(k)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', background: tab === k ? '#FFF' : 'transparent', color: tab === k ? '#0D1B2A' : '#94A3B8', boxShadow: tab === k ? '0 1px 3px rgba(13,27,42,0.1)' : 'none' }}>
                {l}
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: tab === k ? (k === 'day5' ? '#FEF3C7' : k === 'day12' ? '#FEE2E2' : '#E0F7FC') : '#E2E8F0', color: tab === k ? (k === 'day5' ? '#D97706' : k === 'day12' ? '#DC2626' : '#0097B2') : '#94A3B8' }}>{cnt}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} style={{ height: 80, background: '#E2E8F0', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))}
              <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
            </div>
          ) : currentList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', background: '#FFF', borderRadius: 16, border: '1px solid #E1E8F0' }}>
              <Check size={32} color="#10B981" style={{ display: 'block', margin: '0 auto 12px' }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 4px' }}>All caught up!</p>
              <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>No leads in this queue right now</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {currentList.map(lead => {
                const touchCount = (lead.crm_email_touches ?? []).length
                const touchBadge = touchCount === 0 ? null : touchCount === 1 ? { label: 'Day 5', bg: '#FEF3C7', color: '#D97706' } : { label: 'Day 12', bg: '#FEE2E2', color: '#DC2626' }
                const isOpen = openLead?.id === lead.id
                return (
                  <div key={lead.id}
                    style={{ background: '#FFF', border: `1px solid ${isOpen ? '#00B4D8' : '#E1E8F0'}`, borderRadius: 12, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 150ms' }}
                    onClick={() => setOpenLead(isOpen ? null : lead)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelect(lead.id)}
                        onClick={e => e.stopPropagation()} style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: '#00B4D8' }} />
                      <PriorityBadge p={lead.priority} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lead.first_name} {lead.last_name}
                          </span>
                          {touchBadge && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: touchBadge.bg, color: touchBadge.color, flexShrink: 0 }}>{touchBadge.label}</span>
                          )}
                        </div>
                        <p style={{ fontSize: 12, color: '#4A5568', margin: 0 }}>{lead.job_title} · {lead.company}</p>
                        <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{lead.email}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button onClick={e => handlePin(lead, e)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Pin size={14} color={lead.pinned ? '#F4A62A' : '#94A3B8'} fill={lead.pinned ? '#F4A62A' : 'none'} />
                        </button>
                        <button onClick={e => handleSkip(lead, e)}
                          style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <SkipForward size={14} color="#94A3B8" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setOpenLead(lead) }}
                          style={{ padding: '6px 14px', borderRadius: 20, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick Send Panel */}
        {openLead && (
          <div style={{ width: 420, flexShrink: 0, background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, position: 'sticky', top: 88, maxHeight: 'calc(100vh - 112px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <QuickSendPanel lead={openLead} onClose={() => setOpenLead(null)} onSent={() => { load(); setOpenLead(null) }} />
          </div>
        )}
      </div>

      {/* Batch bar */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#0D1B2A', borderRadius: 14, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 8px 32px rgba(13,27,42,0.3)', zIndex: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#FFF' }}>{selected.size} selected</span>
          <button
            onClick={async () => {
              setBatchGenerating(true)
              // batch generation logic would go here
              setBatchGenerating(false)
            }}
            disabled={batchGenerating}
            style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            {batchGenerating ? 'Generating...' : `Generate Selected (${selected.size})`}
          </button>
          <button onClick={() => setSelected(new Set())}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

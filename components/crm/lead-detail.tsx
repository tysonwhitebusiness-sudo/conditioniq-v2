'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  getCRMLead, addCRMNote, updateLeadStatus, updateLeadField,
  logLinkedInRequest, deleteCRMNote,
} from '@/lib/crm-actions'
import { ArrowLeft, Mail, Phone, Link2, MapPin, Building, Briefcase, Calendar, Edit2, Check, X, Trash2, Plus } from 'lucide-react'

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  new:            { label: 'New',            bg: '#F0F4F8', color: '#4A5568' },
  contacted:      { label: 'Contacted',      bg: '#E0F7FC', color: '#0097B2' },
  demo_sent:      { label: 'Demo Sent',      bg: '#EFF6FF', color: '#1D4ED8' },
  trial_active:   { label: 'Trial Active',   bg: '#EDE9FE', color: '#5B21B6' },
  proposal:       { label: 'Proposal',       bg: '#FEF3C7', color: '#D97706' },
  converted:      { label: 'Converted',      bg: '#D1FAE5', color: '#065F46' },
  not_interested: { label: 'Not Interested', bg: '#F0F4F8', color: '#94A3B8' },
}

const PRIORITY_CFG: Record<string, { label: string; bg: string; color: string }> = {
  P0: { label: 'P0', bg: '#FEE2E2', color: '#DC2626' },
  P1: { label: 'P1', bg: '#FEF3C7', color: '#D97706' },
  P2: { label: 'P2', bg: '#F0F4F8', color: '#4A5568' },
}

const CT_CFG: Record<string, string> = {
  storage_facility: 'Storage Facility', tow_impound: 'Tow/Impound', fleet: 'Fleet', fmc: 'FMC', other: 'Other',
}

const TOUCH_LABELS = ['Touch 1 (Day 1)', 'Touch 2 (Day 5)', 'Touch 3 (Day 12)']

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 16, boxShadow: '0 1px 3px rgba(13,27,42,0.06)', padding: 20, ...style }}>{children}</div>
}
function SH({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>{children}</p>
}

function InlineEdit({ value, onSave, style }: { value: string; onSave: (v: string) => void; style?: React.CSSProperties }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  if (editing) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input autoFocus value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
        style={{ fontSize: 14, border: '1px solid #00B4D8', borderRadius: 6, padding: '4px 8px', outline: 'none', fontFamily: 'inherit', ...style }} />
      <button onClick={() => { onSave(val); setEditing(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><Check size={14} color="#10B981" /></button>
      <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={14} color="#94A3B8" /></button>
    </div>
  )
  return (
    <span style={{ ...style, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={() => setEditing(true)}>
      {value || '—'}
      <Edit2 size={11} color="#94A3B8" />
    </span>
  )
}

export default function LeadDetail({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [lead, setLead] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [statusSaving, setStatusSaving] = useState(false)
  const [showGenerator, setShowGenerator] = useState(false)
  const [genTouch, setGenTouch] = useState(1)

  const load = useCallback(async () => {
    const data = await getCRMLead(leadId)
    setLead(data as Record<string, unknown>)
    setLoading(false)
  }, [leadId])

  useEffect(() => { load() }, [load])

  const handleStatusChange = async (status: string) => {
    setStatusSaving(true)
    await updateLeadStatus(leadId, status)
    setLead(l => l ? { ...l, status } : l)
    setStatusSaving(false)
  }

  const handleField = async (field: string, value: string) => {
    await updateLeadField(leadId, field, value)
    setLead(l => l ? { ...l, [field]: value } : l)
  }

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setAddingNote(true)
    await addCRMNote(leadId, newNote)
    setNewNote('')
    await load()
    setAddingNote(false)
  }

  const handleDeleteNote = async (noteId: string) => {
    await deleteCRMNote(noteId)
    setLead(l => {
      if (!l) return l
      const notes = (l.crm_notes as Record<string, unknown>[]) ?? []
      return { ...l, crm_notes: notes.filter(n => n.id !== noteId) }
    })
  }

  const handleLinkedIn = async () => {
    await logLinkedInRequest(leadId)
    setLead(l => l ? { ...l, linkedin_status: 'requested' } : l)
  }

  if (loading) return (
    <div style={{ padding: 24 }}>
      <div style={{ height: 32, width: 200, background: '#E2E8F0', borderRadius: 8, marginBottom: 24, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  )
  if (!lead) return <div style={{ padding: 24, color: '#94A3B8' }}>Lead not found</div>

  const status = (lead.status as string) ?? 'new'
  const priority = (lead.priority as string) ?? 'P2'
  const pc = PRIORITY_CFG[priority] ?? PRIORITY_CFG.P2
  const touches = (lead.crm_email_touches as Record<string, unknown>[]) ?? []
  const notes = (lead.crm_notes as Record<string, unknown>[]) ?? []
  const activity = (lead.crm_activity_log as Record<string, unknown>[]) ?? []

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.push('/admin/crm/leads')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4A5568', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
          <ArrowLeft size={16} /> Back
        </button>
        <div style={{ width: 1, height: 24, background: '#E1E8F0' }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>
          {lead.first_name as string} {lead.last_name as string}
        </h1>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: pc.bg, color: pc.color }}>{pc.label}</span>
        <div style={{ flex: 1 }} />
        {statusSaving && <span style={{ fontSize: 12, color: '#94A3B8' }}>Saving…</span>}
        <select value={status} onChange={e => handleStatusChange(e.target.value)}
          style={{ height: 36, padding: '0 12px', border: '1px solid #E1E8F0', borderRadius: 10, fontSize: 13, fontWeight: 700, background: STATUS_CFG[status]?.bg ?? '#F0F4F8', color: STATUS_CFG[status]?.color ?? '#4A5568', outline: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Contact Info */}
          <Card>
            <SH>Contact Information</SH>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { icon: Building, label: 'Company', field: 'company' },
                { icon: Briefcase, label: 'Job Title', field: 'job_title' },
                { icon: Mail, label: 'Email', field: 'email' },
                { icon: Phone, label: 'Phone', field: 'phone' },
                { icon: MapPin, label: 'Location', field: 'location' },
              ].map(({ icon: Icon, label, field }) => (
                <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Icon size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#94A3B8', width: 70, flexShrink: 0 }}>{label}</span>
                  <InlineEdit value={(lead[field] as string) ?? ''} onSave={v => handleField(field, v)} style={{ fontSize: 13, fontWeight: 500, color: '#0D1B2A' }} />
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Building size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#94A3B8', width: 70, flexShrink: 0 }}>Type</span>
                <select value={(lead.company_type as string) ?? 'other'} onChange={e => handleField('company_type', e.target.value)}
                  style={{ fontSize: 13, border: '1px solid #E1E8F0', borderRadius: 6, padding: '4px 8px', background: '#FFF', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                  {Object.entries(CT_CFG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
          </Card>

          {/* Email Touches */}
          <Card>
            <SH>Email Touches</SH>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1, 2, 3].map(num => {
                const touch = touches.find(t => t.touch_number === num)
                return (
                  <div key={num} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 10, background: touch ? '#F0FDF4' : '#F8FAFC', border: `1px solid ${touch ? '#A7F3D0' : '#E1E8F0'}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: touch ? '#10B981' : '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {touch ? <Check size={13} color="#FFF" /> : <span style={{ fontSize: 12, fontWeight: 700, color: '#FFF' }}>{num}</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0D1B2A' }}>{TOUCH_LABELS[num - 1]}</p>
                      {touch ? (
                        <p style={{ margin: 0, fontSize: 11, color: '#94A3B8' }}>
                          Sent {new Date(touch.sent_at as string).toLocaleDateString()}
                          {Boolean(touch.replied) && <span style={{ color: '#10B981', fontWeight: 700 }}> · Replied!</span>}
                        </p>
                      ) : (
                        <p style={{ margin: 0, fontSize: 11, color: '#94A3B8' }}>Not sent yet</p>
                      )}
                    </div>
                    {!touch && (
                      <button onClick={() => { setGenTouch(num); setShowGenerator(true) }}
                        style={{ fontSize: 11, fontWeight: 700, color: '#00B4D8', background: 'none', border: '1px solid #00B4D8', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Generate
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>

          {/* LinkedIn */}
          <Card>
            <SH>LinkedIn</SH>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: '#E8F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Link2 size={18} color="#0077B5" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#0D1B2A' }}>LinkedIn DM</p>
                <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>
                  {lead.linkedin_status === 'requested' ? 'Connection requested' : lead.linkedin_status === 'connected' ? 'Connected' : 'Not yet contacted'}
                </p>
              </div>
              {lead.linkedin_url ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={lead.linkedin_url as string} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, fontWeight: 700, color: '#0077B5', border: '1px solid #0077B5', borderRadius: 8, padding: '6px 12px', textDecoration: 'none' }}>
                    View Profile
                  </a>
                  {lead.linkedin_status !== 'requested' && (
                    <button onClick={handleLinkedIn}
                      style={{ fontSize: 11, fontWeight: 700, color: '#FFF', background: '#0077B5', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Log Request
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input placeholder="LinkedIn URL" onKeyDown={e => { if (e.key === 'Enter') { handleField('linkedin_url', (e.target as HTMLInputElement).value) } }}
                    style={{ fontSize: 12, border: '1px solid #E1E8F0', borderRadius: 8, padding: '6px 10px', outline: 'none', fontFamily: 'inherit', width: 180 }} />
                  <button onClick={handleLinkedIn}
                    style={{ fontSize: 11, fontWeight: 700, color: '#FFF', background: '#0077B5', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Log Request
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Notes */}
          <Card>
            <SH>Notes</SH>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              {notes.length === 0 && <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No notes yet</p>}
              {notes.map(note => (
                <div key={note.id as string} style={{ padding: 12, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#92400E', fontWeight: 600 }}>
                      {note.created_by_name as string} · {new Date(note.created_at as string).toLocaleDateString()}
                    </span>
                    <button onClick={() => handleDeleteNote(note.id as string)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      <Trash2 size={11} color="#94A3B8" />
                    </button>
                  </div>
                  <p style={{ fontSize: 13, color: '#0D1B2A', margin: 0, lineHeight: 1.5 }}>{note.content as string}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note…" rows={2}
                style={{ flex: 1, padding: '8px 10px', border: '1px solid #E1E8F0', borderRadius: 10, fontSize: 13, resize: 'none', outline: 'none', fontFamily: 'inherit' }} />
              <button onClick={handleAddNote} disabled={!newNote.trim() || addingNote}
                style={{ display: 'flex', alignItems: 'center', padding: '8px 14px', background: newNote.trim() ? '#F4A62A' : '#E1E8F0', border: 'none', borderRadius: 10, cursor: newNote.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                <Plus size={14} color={newNote.trim() ? '#0D1B2A' : '#94A3B8'} />
              </button>
            </div>
          </Card>

          {/* Activity Timeline */}
          <Card style={{ flex: 1 }}>
            <SH>Activity Timeline</SH>
            {activity.length === 0 ? (
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No activity yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {activity.map((ev, idx) => (
                  <div key={ev.id as string} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: '#00B4D8', marginTop: 4, flexShrink: 0 }} />
                      {idx < activity.length - 1 && <div style={{ flex: 1, width: 1, background: '#E1E8F0', margin: '4px 0' }} />}
                    </div>
                    <div style={{ paddingBottom: idx < activity.length - 1 ? 16 : 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#0D1B2A', margin: 0 }}>{ev.description as string}</p>
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                        <Calendar size={10} style={{ display: 'inline', marginRight: 3 }} />
                        {new Date(ev.created_at as string).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Email Generator */}
      <Card style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showGenerator ? 16 : 0 }}>
          <SH>Email Generator</SH>
          <button onClick={() => setShowGenerator(o => !o)}
            style={{ fontSize: 12, fontWeight: 700, color: '#00B4D8', background: 'none', border: '1px solid #00B4D8', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>
            {showGenerator ? 'Hide' : 'Generate Email'}
          </button>
        </div>
        {showGenerator && <EmailGeneratorInline lead={lead} touchNumber={genTouch} onSent={load} />}
      </Card>
    </div>
  )
}

function EmailGeneratorInline({ lead, touchNumber, onSent }: { lead: Record<string, unknown>; touchNumber: number; onSent: () => void }) {
  const [touch, setTouch] = useState(touchNumber)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const systemPrompts: Record<string, string> = {
    storage_facility: `You are a sales development rep for Condition IQ, a vehicle inspection SaaS for storage facilities. Write concise, personalized cold outreach emails. Tone: professional but conversational. No fluff. Focus on: reducing disputes, protecting revenue, streamlining move-in/move-out inspections. Keep under 150 words.`,
    tow_impound: `You are a sales development rep for Condition IQ, a vehicle inspection SaaS for tow and impound yards. Write concise, personalized cold outreach emails. Tone: direct and practical. No fluff. Focus on: protecting against false damage claims, liability reduction, faster release documentation. Keep under 150 words.`,
  }

  const generateEmail = async () => {
    setGenerating(true)
    setError('')
    const ct = (lead.company_type as string) ?? 'storage_facility'
    const sysPt = systemPrompts[ct] ?? systemPrompts.storage_facility
    const touchDesc = touch === 1 ? 'initial cold outreach (never contacted before)' : touch === 2 ? 'follow-up (sent first email 5 days ago, no response)' : 'third touch (sent 2 emails over 12 days, last chance)'
    const userPrompt = `Write a ${touchDesc} email to ${lead.first_name} ${lead.last_name} who is the ${lead.job_title ?? 'manager'} at ${lead.company ?? 'their company'}. Return JSON: { "subject": "...", "body": "..." }`
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? '',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          system: sysPt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      const data = await res.json()
      const text = data.content?.[0]?.text ?? ''
      const match = text.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        setSubject(parsed.subject ?? '')
        setBody(parsed.body ?? '')
      } else {
        setBody(text)
      }
    } catch {
      setError('Generation failed. Check your API key.')
    } finally { setGenerating(false) }
  }

  const openMail = () => {
    const href = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = href
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[1, 2, 3].map(n => (
          <button key={n} onClick={() => setTouch(n)}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: touch === n ? '#0D1B2A' : '#F0F4F8', color: touch === n ? '#FFF' : '#4A5568', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Touch {n}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={generateEmail} disabled={generating}
          style={{ padding: '6px 16px', borderRadius: 8, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          {generating ? 'Generating…' : '⚡ Generate'}
        </button>
      </div>
      {error && <p style={{ color: '#EF4444', fontSize: 12, marginBottom: 8 }}>{error}</p>}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Subject</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject…"
          style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: '#94A3B8', display: 'block', marginBottom: 4 }}>Body</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder="Generated email will appear here…"
          style={{ width: '100%', border: '1px solid #E1E8F0', borderRadius: 8, padding: 10, fontSize: 13, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={openMail} disabled={!body}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: body ? '#00B4D8' : '#E1E8F0', border: 'none', borderRadius: 10, color: body ? '#FFF' : '#94A3B8', fontWeight: 700, fontSize: 13, cursor: body ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          <Mail size={14} /> Open in Mail
        </button>
        <button onClick={async () => { const { logEmailTouch } = await import('@/lib/crm-actions'); await logEmailTouch(lead.id as string, touch); onSent() }} disabled={!body}
          style={{ padding: '9px 18px', background: body ? '#F4A62A' : '#E1E8F0', border: 'none', borderRadius: 10, color: body ? '#0D1B2A' : '#94A3B8', fontWeight: 700, fontSize: 13, cursor: body ? 'pointer' : 'default', fontFamily: 'inherit' }}>
          Mark Sent
        </button>
      </div>
    </div>
  )
}

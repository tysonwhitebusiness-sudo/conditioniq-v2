'use client'

import { useState, useEffect } from 'react'
import { getCRMLead, addCRMNote, updateLeadStatus, updateLinkedInStatus } from '@/lib/crm-actions'
import EmailGenerator from './email-generator'
import { Mail, Link2, Plus, ChevronLeft } from 'lucide-react'
import Link from 'next/link'

interface Props { leadId: string }

export default function LeadDetail({ leadId }: Props) {
  const [lead, setLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [activeTab, setActiveTab] = useState<'email' | 'linkedin' | 'activity'>('email')
  const [liStatus, setLiStatus] = useState('')
  const [liDm, setLiDm] = useState('')
  const [generatingDm, setGeneratingDm] = useState(false)

  const load = async () => {
    const data = await getCRMLead(leadId)
    setLead(data)
    setLiStatus(data?.li_connection_status ?? 'not_sent')
    setLoading(false)
  }

  useEffect(() => { load() }, [leadId])

  const handleAddNote = async () => {
    if (!newNote.trim()) return
    await addCRMNote(leadId, newNote.trim())
    setNewNote('')
    load()
  }

  const handleLiStatusChange = async (status: string) => {
    setLiStatus(status)
    await updateLinkedInStatus(leadId, status)
  }

  const generateLinkedInDm = async () => {
    if (!lead) return
    setGeneratingDm(true)
    try {
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
          max_tokens: 120,
          system: `You write short LinkedIn connection request messages and DMs for Condition IQ, a vehicle condition reporting SaaS for storage facilities and tow/impound operators.\n\nWrite a brief, personalized LinkedIn message using the prospect's name, company, and job title.\n\nRules:\n- Under 40 words\n- Casual and direct\n- One sentence about their role or business\n- One sentence about Condition IQ's value\n- End with a soft ask (open to connecting / worth a quick chat?)\n- No formal greetings like "Dear" or "Hello there"\n- No signature`,
          messages: [{ role: 'user', content: `Write a LinkedIn DM for:\nName: ${lead.first_name} ${lead.last_name}\nCompany: ${lead.company}\nJob Title: ${lead.job_title ?? 'N/A'}` }],
        }),
      })
      const data = await res.json()
      setLiDm(data.content?.[0]?.text ?? '')
    } finally {
      setGeneratingDm(false)
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>
  if (!lead) return <div className="p-8 text-center text-gray-400">Lead not found</div>

  const touches = lead.crm_email_touches ?? []
  const notes = lead.crm_notes ?? []
  const activity = lead.crm_activity_log ?? []

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/crm/leads" className="text-gray-400 hover:text-white">
          <ChevronLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">{lead.first_name} {lead.last_name}</h1>
          <p className="text-gray-400">{lead.company} · {lead.job_title}</p>
        </div>
      </div>

      {/* Contact Info */}
      <div className="bg-gray-800 rounded-2xl p-5 grid grid-cols-2 gap-4 text-sm">
        {[
          ['Email', lead.email],
          ['Phone', lead.phone],
          ['LinkedIn', lead.linkedin_url ? <a href={lead.linkedin_url} target="_blank" className="text-blue-400 underline text-xs">{lead.linkedin_url}</a> : null],
          ['Type', lead.company_type?.replace('_', ' ')],
          ['Status', lead.status],
          ['Email Status', lead.email_status],
        ].filter(([, v]) => v).map(([k, v]) => (
          <div key={String(k)}>
            <p className="text-gray-500 text-xs mb-0.5">{k}</p>
            <p className="text-white">{v as any}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-700 rounded-xl p-1">
        {(['email', 'linkedin', 'activity'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)} className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${activeTab === t ? 'bg-gray-600 text-white' : 'text-gray-400'}`}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'email' && (
        <div className="space-y-4">
          <EmailGenerator lead={lead} onSent={load} />
          {touches.length > 0 && (
            <div className="bg-gray-800 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-gray-700 text-sm font-semibold text-gray-300">Touch History</div>
              {touches.sort((a: any, b: any) => a.touch_number - b.touch_number).map((t: any) => (
                <div key={t.id} className="p-4 border-b border-gray-700 last:border-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white font-medium">Touch {t.touch_number}: {t.subject}</span>
                    {t.replied && <span className="text-xs bg-green-900 text-green-300 px-2 py-0.5 rounded-full">Replied</span>}
                  </div>
                  <p className="text-xs text-gray-400">{new Date(t.sent_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'linkedin' && (
        <div className="space-y-4">
          <div className="bg-gray-800 rounded-2xl p-5 space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-2 block">Connection Status</label>
              <div className="flex gap-2 flex-wrap">
                {['not_sent', 'requested', 'connected', 'declined'].map(s => (
                  <button key={s} onClick={() => handleLiStatusChange(s)} className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${liStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={generateLinkedInDm} disabled={generatingDm} className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
              <Link2 size={15} /> {generatingDm ? 'Generating...' : 'Generate DM'}
            </button>
            {liDm && (
              <div className="space-y-2">
                <textarea value={liDm} onChange={e => setLiDm(e.target.value)} rows={4} className="w-full bg-gray-700 border border-gray-600 rounded-xl px-4 py-3 text-white text-sm resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => navigator.clipboard.writeText(liDm)} className="px-4 py-2 bg-gray-700 text-white rounded-xl text-sm">Copy</button>
                  {lead.linkedin_url && <a href={lead.linkedin_url} target="_blank" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm">Open LinkedIn</a>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div className="space-y-3">
          {/* Add note */}
          <div className="flex gap-2">
            <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white text-sm" onKeyDown={e => e.key === 'Enter' && handleAddNote()} />
            <button onClick={handleAddNote} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium">Add</button>
          </div>

          {/* Notes */}
          {notes.map((n: any) => (
            <div key={n.id} className="bg-gray-800 rounded-xl p-4">
              <p className="text-sm text-gray-200">{n.note}</p>
              <p className="text-xs text-gray-500 mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
            </div>
          ))}

          {/* Activity */}
          {activity.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((a: any) => (
            <div key={a.id} className="flex items-start gap-3 py-2 border-b border-gray-700">
              <div className="w-2 h-2 rounded-full bg-gray-500 mt-2 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-300">{a.description}</p>
                <p className="text-xs text-gray-500">{a.activity_type} · {new Date(a.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

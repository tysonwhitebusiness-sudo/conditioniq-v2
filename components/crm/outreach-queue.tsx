'use client'

import { useState, useEffect } from 'react'
import { getCRMLeads, getTodayGoals } from '@/lib/crm-actions'
import { useQueueFilters, getNextTouchNumber } from '@/hooks/use-quick-send-filters'
import EmailGenerator from './email-generator'
import { Pin, SkipForward, Mail, Target } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-gray-700 text-gray-300',
  contacted: 'bg-blue-900 text-blue-300',
  demo_sent: 'bg-purple-900 text-purple-300',
  trial_active: 'bg-green-900 text-green-300',
  converted: 'bg-emerald-900 text-emerald-300',
  not_interested: 'bg-red-900 text-red-300',
}

export default function OutreachQueue() {
  const supabase = createClient()
  const [allLeads, setAllLeads] = useState<any[]>([])
  const [goals, setGoals] = useState<any>(null)
  const [selectedLead, setSelectedLead] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [{ leads }, g] = await Promise.all([
      getCRMLeads({ limit: 200 }),
      getTodayGoals(),
    ])
    // Attach touches (already nested from getCRMLeads if we join)
    setAllLeads(leads)
    setGoals(g)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const { filtered, stages } = useQueueFilters(allLeads)

  const handlePin = async (leadId: string, pinned: boolean) => {
    await supabase.from('crm_leads').update({ pinned: !pinned }).eq('id', leadId)
    setAllLeads(prev => prev.map(l => l.id === leadId ? { ...l, pinned: !pinned } : l))
  }

  const handleSkip = async (leadId: string) => {
    await supabase.from('crm_leads').update({ skip_count: supabase.rpc('skip_count_incr') }).eq('id', leadId)
    // Move to bottom
    setAllLeads(prev => {
      const lead = prev.find(l => l.id === leadId)
      if (!lead) return prev
      return [...prev.filter(l => l.id !== leadId), { ...lead, skip_count: (lead.skip_count ?? 0) + 1 }]
    })
  }

  const stageSummary = [
    { label: 'New', count: stages.new.length, color: 'text-gray-300' },
    { label: 'Day 5 Due', count: stages.day5Due.length, color: 'text-yellow-400' },
    { label: 'Day 12 Due', count: stages.day12Due.length, color: 'text-orange-400' },
    { label: 'Awaiting Reply', count: stages.awaitingReply.length, color: 'text-blue-400' },
    { label: 'Demo Sent', count: stages.demoSent.length, color: 'text-purple-400' },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Outreach Queue</h1>
        <p className="text-sm text-gray-400">{filtered.length} leads</p>
      </div>

      {/* Goals */}
      {goals && (
        <div className="bg-gray-800 rounded-2xl p-4 flex gap-6">
          {[
            { label: 'Emails', done: goals.emails_sent, goal: goals.email_goal, icon: Mail },
            { label: 'Calls', done: goals.calls_made, goal: goals.call_goal, icon: Target },
          ].map(g => (
            <div key={g.label} className="flex items-center gap-3">
              <g.icon size={18} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">{g.label} Today</p>
                <p className="text-lg font-bold text-white">{g.done}<span className="text-gray-500 font-normal text-sm">/{g.goal}</span></p>
              </div>
              <div className="w-20 bg-gray-700 rounded-full h-2 ml-2">
                <div className="h-2 rounded-full bg-[#dc5010]" style={{ width: `${Math.min(100, (g.done / g.goal) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stage Overview */}
      <div className="grid grid-cols-5 gap-3">
        {stageSummary.map(s => (
          <div key={s.label} className="bg-gray-800 rounded-xl p-3 text-center">
            <p className={`text-xl font-bold ${s.color}`}>{s.count}</p>
            <p className="text-xs text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Queue */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : filtered.slice(0, 50).map(lead => {
          const nextTouch = getNextTouchNumber(lead)
          return (
            <div key={lead.id} className="bg-gray-800 rounded-2xl p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {lead.pinned && <Pin size={12} className="text-yellow-400" />}
                    <span className="text-white font-medium">{lead.first_name} {lead.last_name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[lead.status] ?? 'bg-gray-700 text-gray-300'}`}>
                      {lead.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{lead.company}</p>
                  {lead.job_title && <p className="text-xs text-gray-500">{lead.job_title}</p>}
                </div>
                <div className="flex gap-2 ml-3">
                  <button onClick={() => handlePin(lead.id, lead.pinned)} className={`p-2 rounded-lg ${lead.pinned ? 'text-yellow-400 bg-yellow-900/30' : 'text-gray-500 hover:text-gray-300'}`}>
                    <Pin size={14} />
                  </button>
                  <button onClick={() => handleSkip(lead.id)} className="p-2 rounded-lg text-gray-500 hover:text-gray-300">
                    <SkipForward size={14} />
                  </button>
                  <button
                    onClick={() => setSelectedLead(selectedLead?.id === lead.id ? null : lead)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#dc5010] text-white rounded-lg text-xs font-medium"
                  >
                    <Mail size={13} /> {nextTouch ? `Touch ${nextTouch}` : 'Write'}
                  </button>
                </div>
              </div>

              {selectedLead?.id === lead.id && (
                <div className="mt-4">
                  <EmailGenerator
                    lead={lead}
                    initialTouchNumber={nextTouch ?? 1}
                    onSent={() => { setSelectedLead(null); load() }}
                    onClose={() => setSelectedLead(null)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

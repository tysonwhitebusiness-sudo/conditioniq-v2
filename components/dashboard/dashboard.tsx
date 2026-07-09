'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { Share2, Send, Play, Plus, Upload, Search, AlertTriangle } from 'lucide-react'
import { checkUsageState, createShareToken, createInspectionRequest } from '@/lib/usage-actions'

type Tab = 'queue' | 'in-progress' | 'history' | 'team'

interface DashboardProps {
  onStartInspection: () => void
  onResumeInspection: (data: Record<string, any>) => void
  onViewReport: (data: Record<string, any>) => void
}

export default function Dashboard({ onStartInspection, onResumeInspection, onViewReport }: DashboardProps) {
  const { user, userProfile, effectiveCompany, isOwnerUser } = useAuth()
  const [tab, setTab] = useState<Tab>('queue')
  const [queue, setQueue] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [usageState, setUsageState] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [shareSuccess, setShareSuccess] = useState<string | null>(null)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)

  const supabase = createClient()

  const load = useCallback(async () => {
    if (!effectiveCompany) return
    setLoading(true)
    try {
      const [qRes, hRes, tRes, uRes] = await Promise.all([
        supabase.from('inspection_queue').select('*').eq('company_id', effectiveCompany.id).eq('status', 'queued').order('created_at', { ascending: false }),
        supabase.from('vehicle_inspections').select('*').eq('company_id', effectiveCompany.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(50),
        supabase.from('user_profiles').select('*').eq('company_id', effectiveCompany.id),
        checkUsageState(effectiveCompany.id),
      ])
      setQueue(qRes.data ?? [])
      setHistory(hRes.data ?? [])
      setTeam(tRes.data ?? [])
      setUsageState(uRes)
    } finally {
      setLoading(false)
    }
  }, [effectiveCompany])

  useEffect(() => { load() }, [load])

  const handleShare = async (inspectionId: string) => {
    try {
      const token = await createShareToken(inspectionId)
      const link = `${window.location.origin}/inspect/${token}`
      await navigator.clipboard.writeText(link)
      setShareSuccess(inspectionId)
      setTimeout(() => setShareSuccess(null), 3000)
    } catch { /* ignore */ }
  }

  const handleSendLink = async (vin: string, year: string, make: string, model: string) => {
    if (!effectiveCompany) return
    try {
      const token = await createInspectionRequest(effectiveCompany.id, { vin, year, make, model }, 24)
      const link = `${window.location.origin}/complete/${token}`
      await navigator.clipboard.writeText(link)
      setInfoMsg('Link copied! Share it with the remote inspector.')
    } catch { /* ignore */ }
  }

  const filteredHistory = history.filter(i =>
    !search || i.vin?.toLowerCase().includes(search.toLowerCase()) ||
    i.make?.toLowerCase().includes(search.toLowerCase()) ||
    i.model?.toLowerCase().includes(search.toLowerCase())
  )

  const tabs: { id: Tab; label: string }[] = [
    { id: 'queue', label: 'Queue' },
    { id: 'in-progress', label: 'In Progress' },
    { id: 'history', label: 'History' },
    { id: 'team', label: 'Team' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white px-4 pt-6 pb-16">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h1 className="text-xl font-bold">Condition IQ</h1>
            <p className="text-blue-200 text-sm">{effectiveCompany?.name ?? 'Loading...'}</p>
          </div>
          <button
            onClick={onStartInspection}
            className="flex items-center gap-2 bg-[#dc5010] px-4 py-2.5 rounded-xl font-semibold text-sm"
          >
            <Plus size={18} /> New Inspection
          </button>
        </div>
      </div>

      {/* Usage Banner */}
      {usageState?.isNearLimit && !isOwnerUser && (
        <div className="mx-4 -mt-8 bg-orange-500 text-white rounded-2xl p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={16} />
            <span className="font-semibold text-sm">
              {usageState.isOverage ? 'Over usage limit' : 'Approaching usage limit'}
            </span>
          </div>
          <p className="text-xs text-orange-100">
            {usageState.used} of {usageState.included} reports used this cycle
          </p>
        </div>
      )}

      {/* Content area */}
      <div className="px-4 mt-4">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-200 rounded-2xl p-1 mb-4">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Queue tab */}
        {tab === 'queue' && (
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : queue.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="font-medium">Queue is empty</p>
                <p className="text-sm mt-1">Add vehicles to inspect</p>
              </div>
            ) : (
              queue.map(item => (
                <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900 font-mono">{item.vin}</p>
                      <p className="text-sm text-gray-500">{[item.year, item.make, item.model].filter(Boolean).join(' ')}</p>
                    </div>
                    <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full font-medium">Queued</span>
                  </div>
                  {item.notes && <p className="text-xs text-gray-400 mb-3">{item.notes}</p>}
                  <button
                    onClick={() => onStartInspection()}
                    className="w-full py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <Play size={16} /> Start Inspection
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* In Progress tab */}
        {tab === 'in-progress' && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 text-center py-8">
              No in-progress inspections on this device.
            </p>
          </div>
        )}

        {/* History tab */}
        {tab === 'history' && (
          <div className="space-y-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by VIN, make, model..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm"
              />
            </div>

            {loading ? (
              <div className="text-center py-12 text-gray-400">Loading...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-gray-400">No inspections found</div>
            ) : (
              filteredHistory.map(item => (
                <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 font-mono text-sm">{item.vin}</p>
                      <p className="text-sm text-gray-600">{[item.year, item.make, item.model].filter(Boolean).join(' ')}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(item.created_at).toLocaleDateString()}</p>
                    </div>
                    {item.vehicle_score && (
                      <div className="bg-gray-50 rounded-xl px-3 py-2 text-center">
                        <div className="text-lg font-bold text-[#1e3a5f]">{item.vehicle_score}</div>
                        <div className="text-xs text-gray-400">score</div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => onViewReport(item)}
                      className="flex-1 py-2 bg-[#1e3a5f] text-white rounded-xl text-xs font-medium"
                    >
                      View Report
                    </button>
                    <button
                      onClick={() => handleShare(item.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-medium border ${shareSuccess === item.id ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-600'}`}
                    >
                      <Share2 size={14} />
                    </button>
                    <button
                      onClick={() => handleSendLink(item.vin, item.year, item.make, item.model)}
                      className="px-3 py-2 rounded-xl text-xs font-medium border bg-white border-gray-200 text-gray-600"
                    >
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Team tab */}
        {tab === 'team' && (
          <div className="space-y-3">
            {team.map(member => (
              <div key={member.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-sm">
                  {(member.full_name ?? 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900">{member.full_name ?? 'Unknown'}</p>
                  <p className="text-xs text-gray-500 capitalize">{member.role}</p>
                </div>
              </div>
            ))}
            {team.length === 0 && !loading && (
              <p className="text-center py-12 text-gray-400">No team members found</p>
            )}
          </div>
        )}
      </div>

      {infoMsg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setInfoMsg(null)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 12px' }}>Link Copied</h3>
            <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>{infoMsg}</p>
            <button onClick={() => setInfoMsg(null)} style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>OK</button>
          </div>
        </div>
      )}
    </div>
  )
}

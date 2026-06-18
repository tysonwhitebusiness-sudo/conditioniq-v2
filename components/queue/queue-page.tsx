'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { useMediaQuery } from '@/hooks/use-media-query'
import StatusBadge, { ScoreBadge } from '@/components/ui/status-badge'
import { Search, Trash2, Play, Plus, List, Clock, Share2, Send, Bot, X, Loader2, Check } from 'lucide-react'
import { createShareToken, createInspectionRequest } from '@/lib/usage-actions'

type SubTab = 'queue' | 'in_progress' | 'history'

interface Props {
  initialTab?: SubTab
  onStartInspection: (queueItem?: any) => void
  onResumeInspection: (data: any) => void
  onViewReport: (data: any) => void
  hideHeader?: boolean
}

function Skeleton() {
  return (
    <div style={{ borderRadius: 12, padding: '14px 16px', background: '#FFFFFF', border: '1px solid #E1E8F0' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ height: 14, width: 144, background: '#E1E8F0', borderRadius: 4 }} />
          <div style={{ height: 11, width: 112, background: '#F0F4F8', borderRadius: 4 }} />
          <div style={{ height: 11, width: 80, background: '#F0F4F8', borderRadius: 4 }} />
        </div>
        <div style={{ height: 24, width: 80, background: '#F0F4F8', borderRadius: 12 }} />
      </div>
    </div>
  )
}

function EmptyState({ icon, title, message, action }: { icon: React.ReactNode; title: string; message: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>{icon}</div>
      <p style={{ fontWeight: 600, color: '#94A3B8', margin: '0 0 4px' }}>{title}</p>
      <p style={{ fontSize: 14, color: '#CBD5E1', margin: '0 0 24px' }}>{message}</p>
      {action}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function vehicleTitle(item: any): { name: string; isVin: boolean } {
  const name = [item.year, item.make, item.model].filter(Boolean).join(' ')
  if (name) return { name, isVin: false }
  if (item.vin) return { name: item.vin, isVin: true }
  return { name: 'Inspection', isVin: false }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function NameRow({ item }: { item: any }) {
  const { name, isVin } = vehicleTitle(item)
  return (
    <p style={{
      fontWeight: 700, fontSize: isVin ? 13 : 14, color: '#0D1B2A', margin: 0,
      fontFamily: isVin ? 'monospace' : 'inherit',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>{name}</p>
  )
}

function VinRow({ item }: { item: any }) {
  const { isVin } = vehicleTitle(item)
  if (isVin || !item.vin) return null
  return <p style={{ fontSize: 11, color: '#94A3B8', fontFamily: 'monospace', margin: '2px 0 0' }}>{item.vin}</p>
}

// ── Card components ────────────────────────────────────────────────────────

function QueueCard({ item, isDesktop, onStart, onDelete }: { item: any; isDesktop: boolean; onStart: () => void; onDelete: () => void }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderLeft: '4px solid #94A3B8', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 16 : 12, padding: isDesktop ? '12px 20px' : '12px 16px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <NameRow item={item} />
          <VinRow item={item} />
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{formatDate(item.created_at)}</p>
          {item.notes && <p style={{ fontSize: 11, color: '#4A5568', fontStyle: 'italic', margin: '4px 0 0' }}>{item.notes}</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <StatusBadge status="queued" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={onStart}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                height: isDesktop ? 32 : 28, padding: isDesktop ? '0 14px' : '0 12px',
                borderRadius: 8, border: 'none', cursor: 'pointer',
                background: '#F4A62A', color: '#0D1B2A',
                fontSize: isDesktop ? 13 : 12, fontWeight: 600,
              }}
            >
              <Play size={11} fill="#0D1B2A" /> Start
            </button>
            <button
              onClick={onDelete}
              style={{
                width: 32, height: 32, borderRadius: 8, border: '1px solid #E1E8F0',
                background: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8',
                flexShrink: 0,
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function useExpiryCountdown(lastActiveAt: string | undefined) {
  const getMs = () => {
    if (!lastActiveAt) return 24 * 60 * 60 * 1000
    return Math.max(0, new Date(lastActiveAt).getTime() + 24 * 60 * 60 * 1000 - Date.now())
  }
  const [ms, setMs] = useState(getMs)
  useEffect(() => {
    const id = setInterval(() => setMs(getMs()), 60_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastActiveAt])
  return ms
}

function InProgressCard({ item, isDesktop, onResume }: { item: any; isDesktop: boolean; onResume: () => void }) {
  const remainingMs = useExpiryCountdown(item.last_active_at)
  const totalMs     = 24 * 60 * 60 * 1000
  const pctElapsed  = Math.min(100, ((totalMs - remainingMs) / totalMs) * 100)
  const hours       = Math.floor(remainingMs / (60 * 60 * 1000))
  const minutes     = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000))
  const timeLabel   = remainingMs <= 0 ? 'Completing soon…' : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  const urgent      = remainingMs < 60 * 60 * 1000
  const warning     = remainingMs < 4 * 60 * 60 * 1000
  const accentColor = urgent ? '#EF4444' : warning ? '#F59E0B' : '#F59E0B'
  const barColor    = urgent ? '#EF4444' : warning ? '#F59E0B' : '#00B4D8'

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderLeft: `4px solid ${accentColor}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 16 : 12, padding: isDesktop ? '12px 20px' : '12px 16px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <NameRow item={item} />
          <VinRow item={item} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Clock size={11} style={{ color: accentColor, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: accentColor }}>{timeLabel} remaining</span>
          </div>
          <div style={{ height: 3, background: '#F0F4F8', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
            <div style={{ height: 3, width: `${pctElapsed}%`, background: barColor, borderRadius: 2, transition: 'width 1s linear' }} />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
          <StatusBadge status="in_progress" />
          <button
            onClick={onResume}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              height: isDesktop ? 32 : 28, padding: isDesktop ? '0 14px' : '0 12px',
              borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#00B4D8', color: '#FFFFFF',
              fontSize: isDesktop ? 13 : 12, fontWeight: 600,
            }}
          >
            <Play size={11} fill="white" /> Resume
          </button>
        </div>
      </div>
    </div>
  )
}

function HistoryCard({ item, isDesktop, onView, onShare, onSend, shareSuccess }: {
  item: any; isDesktop: boolean; onView: () => void; onShare: () => void; onSend: () => void; shareSuccess: boolean
}) {
  const usage: string = item.usage_status ?? ''
  const typeLabel = usage === 'checkin' ? 'Check-In' : usage === 'checkout' ? 'Check-Out' : 'Standard'
  const typeColor = usage === 'checkin' ? '#0369A1' : usage === 'checkout' ? '#065F46' : '#4A5568'
  const typeBg   = usage === 'checkin' ? '#DBEAFE' : usage === 'checkout' ? '#D1FAE5' : '#F0F4F8'

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderLeft: '4px solid #10B981', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isDesktop ? 16 : 12, padding: isDesktop ? '12px 20px' : '12px 16px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 6, background: typeBg, color: typeColor, flexShrink: 0 }}>
              {typeLabel}
            </span>
            {item.auto_completed && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8,
                background: '#FEF3C7', color: '#D97706', flexShrink: 0,
              }}>
                <Bot size={9} /> Auto
              </span>
            )}
          </div>
          <NameRow item={item} />
          <VinRow item={item} />
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{formatDate(item.created_at)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {item.vehicle_score != null && <ScoreBadge score={item.vehicle_score} />}
          {isDesktop ? (
            <button
              onClick={onView}
              style={{
                height: 32, padding: '0 14px', borderRadius: 8, whiteSpace: 'nowrap',
                background: '#FFFFFF', border: '1px solid #E1E8F0', color: '#00B4D8',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Download PDF
            </button>
          ) : (
            <button
              onClick={onView}
              style={{
                height: 28, padding: '0 12px', borderRadius: 8,
                background: '#00B4D8', color: '#FFFFFF',
                border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              PDF
            </button>
          )}
          <button
            onClick={onShare}
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: shareSuccess ? '1px solid #A7F3D0' : '1px solid #E1E8F0',
              background: shareSuccess ? '#D1FAE5' : 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: shareSuccess ? '#065F46' : '#94A3B8',
            }}
          >
            <Share2 size={14} />
          </button>
          <button
            onClick={onSend}
            style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid #E1E8F0',
              background: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8',
            }}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add-to-Queue picker ────────────────────────────────────────────────────

function AddToQueueSheet({ companyId, existingQueueVins, onClose, onAdded }: {
  companyId: string
  existingQueueVins: Set<string>
  onClose: () => void
  onAdded: (items: any[]) => void
}) {
  const supabase = createClient()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from('storage_vehicles')
        .select('id, vin, year, make, model, lifecycle_status')
        .eq('company_id', companyId)
        .in('lifecycle_status', ['on_lot', 'pending_arrival'])
        .order('arrived_at', { ascending: false })
      setVehicles((data ?? []).filter(v => v.vin && !existingQueueVins.has(v.vin)))
      setLoading(false)
    }
    fetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const confirm = async () => {
    const toAdd = vehicles.filter(v => selected.has(v.id))
    if (!toAdd.length) return
    setAdding(true)
    try {
      await supabase.from('inspection_queue').insert(
        toAdd.map(v => ({ company_id: companyId, vin: v.vin, year: v.year ?? '', make: v.make ?? '', model: v.model ?? '', status: 'queued' }))
      )
      onAdded(toAdd)
    } finally { setAdding(false) }
  }

  const filtered = search
    ? vehicles.filter(v => v.vin?.toLowerCase().includes(search.toLowerCase()) || [v.year, v.make, v.model].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase()))
    : vehicles

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: isDesktop ? 'center' : 'flex-end', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.5)' }} />
      <div style={{ position: 'relative', background: '#FFF', borderRadius: isDesktop ? 20 : '20px 20px 0 0', width: '100%', maxWidth: isDesktop ? 480 : undefined, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #E1E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Add Vehicles to Queue</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}><X size={18} color="#94A3B8" /></button>
        </div>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #F0F4F8', flexShrink: 0 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search VIN or vehicle..." style={{ width: '100%', height: 40, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
              <Loader2 size={24} color="#94A3B8" className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p style={{ fontSize: 14, color: '#94A3B8', textAlign: 'center', padding: '40px 20px', margin: 0 }}>
              {search ? 'No matches' : 'All vehicles are already in the queue'}
            </p>
          ) : filtered.map(v => {
            const title = [v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin
            const sel = selected.has(v.id)
            const onLot = v.lifecycle_status === 'on_lot'
            return (
              <button key={v.id} onClick={() => toggle(v.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 20px', background: sel ? '#F0FDFF' : 'none', border: 'none', borderBottom: '1px solid #F0F4F8', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${sel ? '#00B4D8' : '#CBD5E1'}`, background: sel ? '#00B4D8' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 120ms ease' }}>
                  {sel && <Check size={12} color="#fff" strokeWidth={3} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
                  <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#94A3B8', margin: '1px 0 0' }}>{v.vin}</p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px', flexShrink: 0, background: onLot ? '#D1FAE5' : '#F0F4F8', color: onLot ? '#059669' : '#4A5568' }}>
                  {onLot ? 'On Lot' : 'Pending'}
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E1E8F0', display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={onClose} style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E1E8F0', background: 'none', color: '#4A5568', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={confirm} disabled={selected.size === 0 || adding}
            style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: selected.size > 0 ? '#F4A62A' : '#E1E8F0', color: selected.size > 0 ? '#0D1B2A' : '#94A3B8', fontWeight: 700, fontSize: 14, cursor: selected.size > 0 ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {adding ? 'Adding…' : selected.size > 0 ? `Add ${selected.size} Vehicle${selected.size !== 1 ? 's' : ''}` : 'Select vehicles'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function QueuePage({ initialTab = 'queue', onStartInspection, onResumeInspection, onViewReport, hideHeader = false }: Props) {
  const { effectiveCompany } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [tab, setTab] = useState<SubTab>(initialTab)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState<any[]>([])
  const [inProgress, setInProgress] = useState<any[]>([])
  const [history, setHistory] = useState<any[]>([])
  const [shareSuccessId, setShareSuccessId] = useState<string | null>(null)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)
  const [showAddToQueue, setShowAddToQueue] = useState(false)

  const supabase = createClient()

  const load = useCallback(async () => {
    if (!effectiveCompany) return
    setLoading(true)
    try {
      const [qRes, ipRes, hRes] = await Promise.all([
        supabase.from('inspection_queue').select('*').eq('company_id', effectiveCompany.id).eq('status', 'queued').order('created_at', { ascending: false }),
        supabase.from('vehicle_inspections').select('*').eq('company_id', effectiveCompany.id).eq('status', 'in_progress').order('created_at', { ascending: false }),
        supabase.from('vehicle_inspections').select('*').eq('company_id', effectiveCompany.id).eq('status', 'completed').order('created_at', { ascending: false }).limit(50),
      ])
      setQueue(qRes.data ?? [])
      setInProgress(ipRes.data ?? [])
      setHistory(hRes.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [effectiveCompany])

  useEffect(() => { load() }, [load])

  const deleteQueueItem = async (id: string) => {
    await supabase.from('inspection_queue').delete().eq('id', id)
    setQueue(prev => prev.filter(q => q.id !== id))
  }

  const handleShare = async (inspectionId: string) => {
    try {
      const token = await createShareToken(inspectionId)
      const link = `${window.location.origin}/inspect/${token}`
      await navigator.clipboard.writeText(link)
      setShareSuccessId(inspectionId)
      setTimeout(() => setShareSuccessId(null), 2500)
    } catch {}
  }

  const handleSendLink = async (item: any) => {
    if (!effectiveCompany) return
    try {
      const token = await createInspectionRequest(effectiveCompany.id, { vin: item.vin, year: item.year, make: item.make, model: item.model }, 24)
      const link = `${window.location.origin}/complete/${token}`
      await navigator.clipboard.writeText(link)
      setInfoMsg('Link copied! Share it with the remote inspector.')
    } catch {}
  }

  const filter = (items: any[]) =>
    !search
      ? items
      : items.filter(i =>
          i.vin?.toLowerCase().includes(search.toLowerCase()) ||
          i.make?.toLowerCase().includes(search.toLowerCase()) ||
          i.model?.toLowerCase().includes(search.toLowerCase())
        )

  const counts = { queue: queue.length, in_progress: inProgress.length, history: history.length }

  const TABS = [
    { id: 'queue' as SubTab, label: 'Queue' },
    { id: 'in_progress' as SubTab, label: 'In Progress' },
    { id: 'history' as SubTab, label: 'History' },
  ]

  const tabButtons = (
    <div style={{ display: 'flex', gap: 8 }}>
      {TABS.map(t => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 12px',
            height: isDesktop ? 34 : 30,
            borderRadius: 20,
            fontSize: isDesktop ? 13 : 12, fontWeight: 700, cursor: 'pointer',
            background: tab === t.id
              ? '#00B4D8'
              : isDesktop ? '#F0F4F8' : 'rgba(255,255,255,0.1)',
            color: tab === t.id
              ? '#0D1B2A'
              : isDesktop ? '#4A5568' : 'rgba(255,255,255,0.6)',
            border: isDesktop && tab !== t.id ? '1px solid #E1E8F0' : 'none',
          }}
        >
          {t.label}
          {counts[t.id] > 0 && (
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 10, fontWeight: 700,
              background: tab === t.id
                ? '#0D1B2A'
                : isDesktop ? '#E1E8F0' : 'rgba(255,255,255,0.2)',
              color: tab === t.id ? '#FFFFFF' : isDesktop ? '#4A5568' : '#FFFFFF',
            }}>
              {counts[t.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  )

  const cardList = loading ? (
    <><Skeleton /><Skeleton /><Skeleton /></>
  ) : tab === 'queue' ? (
    filter(queue).length === 0 ? (
      <EmptyState
        icon={<List size={40} style={{ color: '#E1E8F0' }} />}
        title="Queue is empty"
        message="Add vehicles to inspect or check one in"
        action={
          <button
            onClick={() => onStartInspection()}
            style={{ padding: '12px 24px', borderRadius: 20, fontWeight: 700, fontSize: 14, background: '#F4A62A', color: '#0D1B2A', border: 'none', cursor: 'pointer' }}
          >
            Start Inspection
          </button>
        }
      />
    ) : filter(queue).map(item => (
      <QueueCard key={item.id} item={item} isDesktop={isDesktop} onStart={() => onStartInspection(item)} onDelete={() => deleteQueueItem(item.id)} />
    ))
  ) : tab === 'in_progress' ? (
    filter(inProgress).length === 0 ? (
      <EmptyState
        icon={<Clock size={40} style={{ color: '#E1E8F0' }} />}
        title="Nothing in progress"
        message="Start an inspection to see it here"
      />
    ) : filter(inProgress).map(item => (
      <InProgressCard key={item.id} item={item} isDesktop={isDesktop} onResume={() => onResumeInspection(item)} />
    ))
  ) : (
    filter(history).length === 0 ? (
      <EmptyState
        icon={<Clock size={40} style={{ color: '#E1E8F0' }} />}
        title="No completed inspections"
        message="Completed inspections will appear here"
      />
    ) : filter(history).map(item => (
      <HistoryCard
        key={item.id}
        item={item}
        isDesktop={isDesktop}
        onView={() => onViewReport(item)}
        onShare={() => handleShare(item.id)}
        onSend={() => handleSendLink(item)}
        shareSuccess={shareSuccessId === item.id}
      />
    ))
  )

  return (
    <div style={{
      minHeight: '100vh', background: '#F0F4F8',
      paddingBottom: isDesktop ? 0 : 'calc(64px + env(safe-area-inset-bottom, 0px))',
    }}>

      {/* Mobile header — hidden when parent provides its own header (e.g. standalone /inspections page) */}
      {!isDesktop && !hideHeader && (
        <div style={{ background: '#0D1B2A', padding: '48px 16px 16px' }}>
          <h1 style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 20, margin: '0 0 8px' }}>Inspections</h1>
          {tabButtons}
        </div>
      )}
      {!isDesktop && hideHeader && (
        <div style={{ background: '#0D1B2A', padding: '8px 16px 14px' }}>
          {tabButtons}
        </div>
      )}

      {/* Content area */}
      <div style={{
        maxWidth: isDesktop ? 1200 : undefined,
        margin: isDesktop ? '0 auto' : undefined,
        padding: isDesktop ? 24 : '16px 16px 0',
      }}>

        {/* Desktop tab pills */}
        {isDesktop && <div style={{ marginBottom: 12 }}>{tabButtons}</div>}

        {/* Search + action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search VIN or vehicle..."
              style={{
                width: '100%', paddingLeft: 36, paddingRight: 16, height: 40, borderRadius: 10,
                background: '#FFFFFF', border: '1px solid #E1E8F0', color: '#0D1B2A',
                fontSize: 14, outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>
          {tab === 'queue' && (
            <>
              <button
                onClick={() => setShowAddToQueue(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px',
                  height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: '#1B2D40', color: '#FFFFFF', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                }}
              >
                <Plus size={14} /> Add to Queue
              </button>
              <button
                onClick={() => onStartInspection()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px',
                  height: 40, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: '#00B4D8', color: '#FFFFFF', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
                }}
              >
                <Plus size={14} /> Check-In
              </button>
            </>
          )}
        </div>

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cardList}
        </div>
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

      {showAddToQueue && effectiveCompany && (
        <AddToQueueSheet
          companyId={effectiveCompany.id}
          existingQueueVins={new Set(queue.map((q: any) => q.vin).filter(Boolean))}
          onClose={() => setShowAddToQueue(false)}
          onAdded={items => {
            setQueue(prev => [
              ...items.map(v => ({
                id: crypto.randomUUID(),
                company_id: effectiveCompany.id,
                vin: v.vin, year: v.year ?? '', make: v.make ?? '', model: v.model ?? '',
                status: 'queued', created_at: new Date().toISOString(),
              })),
              ...prev,
            ])
            setShowAddToQueue(false)
          }}
        />
      )}
    </div>
  )
}

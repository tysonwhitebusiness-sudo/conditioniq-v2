'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { getActiveDispatches, dispatchStatus } from '@/lib/storage-actions'
import { Clock, CheckCircle, AlertTriangle, Send, Copy, Check, ExternalLink, RefreshCw, Lock } from 'lucide-react'
import BottomNav from '@/components/ui/bottom-nav'
import SendLinkSheet from '@/components/dispatch/send-link-sheet'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import { createClient } from '@/lib/supabase/client'
import { useFeatureFlag } from '@/hooks/use-feature-flag'

function Skeleton({ h = 40, r = 8 }: { h?: number; r?: number }) {
  return <div style={{ height: h, borderRadius: r, background: '#F0F4F8', animation: 'pulse 1.5s ease infinite' }} />
}

type DispatchStatus = 'awaiting' | 'completed' | 'expired'

const STATUS_CONFIG: Record<DispatchStatus, { icon: React.ReactNode; bg: string; color: string; label: string; border: string }> = {
  awaiting:  { icon: <Clock size={13} />,         bg: '#FEF3C7', color: '#92400E', label: 'Awaiting',  border: '#F59E0B' },
  completed: { icon: <CheckCircle size={13} />,   bg: '#D1FAE5', color: '#065F46', label: 'Completed', border: '#10B981' },
  expired:   { icon: <AlertTriangle size={13} />, bg: '#FEE2E2', color: '#991B1B', label: 'Expired',   border: '#EF4444' },
}

function StatusBadge({ status }: { status: DispatchStatus }) {
  const c = STATUS_CONFIG[status]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>
      {c.icon}{c.label}
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy}
      style={{ height: 32, width: 32, borderRadius: 8, border: '1px solid #E1E8F0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      title="Copy link">
      {copied ? <Check size={14} color="#10B981" /> : <Copy size={14} color="#94A3B8" />}
    </button>
  )
}

function VinCell({ vin }: { vin: string | null }) {
  if (!vin) return <span style={{ color: '#CBD5E1', fontStyle: 'italic', fontSize: 12, fontFamily: 'inherit' }}>No VIN</span>
  return <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0D1B2A' }}>{vin}</span>
}

function timeRemaining(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return `${h}h ${m}m`
}

export default function StorageDispatchPage() {
  const { effectiveCompany } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const dispatchEnabled = useFeatureFlag('dispatch')
  const companyId = effectiveCompany?.id ?? ''

  const [dispatches, setDispatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'' | DispatchStatus>('')
  const [showSendSheet, setShowSendSheet] = useState(false)
  const [resendSheet, setResendSheet] = useState<{ open: boolean; vin?: string; year?: string; make?: string; model?: string }>({ open: false })
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      setDispatches(await getActiveDispatches(companyId))
    } finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const filtered = dispatches.filter(d => !filter || dispatchStatus(d) === filter)

  const counts = {
    awaiting:  dispatches.filter(d => dispatchStatus(d) === 'awaiting').length,
    completed: dispatches.filter(d => dispatchStatus(d) === 'completed').length,
    expired:   dispatches.filter(d => dispatchStatus(d) === 'expired').length,
  }

  const filterTabs = [
    { key: '' as const,           label: 'All',       count: dispatches.length, bg: '#F5F8FA', color: '#4A5568' },
    { key: 'awaiting' as const,   label: 'Awaiting',  count: counts.awaiting,   bg: '#FEF3C7', color: '#92400E' },
    { key: 'completed' as const,  label: 'Completed', count: counts.completed,  bg: '#D1FAE5', color: '#065F46' },
    { key: 'expired' as const,    label: 'Expired',   count: counts.expired,    bg: '#FEE2E2', color: '#991B1B' },
  ]

  const handleSheetClose = () => {
    setShowSendSheet(false)
    setResendSheet({ open: false })
    load()
  }

  if (dispatchEnabled === false) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: 64, height: 64, borderRadius: 32, background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Lock size={28} color="#94A3B8" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', margin: '0 0 8px', textAlign: 'center' }}>
          Dispatch is not enabled for your account.
        </h2>
        <p style={{ fontSize: 14, color: '#94A3B8', margin: 0, textAlign: 'center' }}>
          Contact us to get access.
        </p>
      </div>
    )
  }

  return (
    <>
    {!isDesktop && <MobilePageHeader />}
    <div style={{ padding: isDesktop ? 24 : '16px', paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))', maxWidth: 1000, margin: '0 auto' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      <div style={{ marginBottom: isDesktop ? 24 : 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0D1B2A', margin: 0 }}>Dispatch Board</h1>
        <p style={{ fontSize: 14, color: '#94A3B8', margin: '4px 0 0' }}>Inspection links sent to external inspectors</p>
      </div>

      {/* Mobile: Send New Link button */}
      {!isDesktop && (
        <button onClick={() => setShowSendSheet(true)}
          style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          <Send size={16} />Send New Link
        </button>
      )}

      {/* Filter tabs */}
      {isDesktop ? (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {filterTabs.map(({ key, label, count, bg, color }) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{ height: 36, padding: '0 14px', borderRadius: 18, border: `1.5px solid ${filter === key ? color : '#E1E8F0'}`, background: filter === key ? bg : '#fff', color: filter === key ? color : '#94A3B8', fontWeight: filter === key ? 700 : 400, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
              {label}
              <span style={{ fontSize: 12, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: filter === key ? 'rgba(0,0,0,0.08)' : '#F0F4F8' }}>{count}</span>
            </button>
          ))}
          <button onClick={() => setShowSendSheet(true)}
            style={{ marginLeft: 'auto', height: 36, padding: '0 16px', borderRadius: 18, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Send size={14} />Send New Link
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', overflowX: 'auto', gap: 8, marginBottom: 14, marginLeft: -16, marginRight: -16, padding: '0 16px 4px', scrollbarWidth: 'none' } as React.CSSProperties}>
          {filterTabs.map(({ key, label, count, bg, color }) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{ height: 30, padding: '0 14px', borderRadius: 20, border: 'none', flexShrink: 0, background: filter === key ? '#0D1B2A' : '#F0F4F8', color: filter === key ? '#FFF' : '#4A5568', fontWeight: filter === key ? 700 : 400, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              {label}
              <span style={{ fontSize: 10, fontWeight: 700, background: filter === key ? 'rgba(255,255,255,0.2)' : '#E1E8F0', color: filter === key ? '#FFF' : '#4A5568', borderRadius: 8, padding: '1px 5px' }}>{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Desktop table */}
      {isDesktop && (
        <div style={{ background: '#fff', border: '1px solid #E1E8F0', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F5F8FA' }}>
                {['VIN', 'Notes', 'Status', 'Dispatched', 'Expires / Completed', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} style={{ padding: '12px 16px' }}><Skeleton h={20} r={4} /></td>
                ))}</tr>
              )) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 48, textAlign: 'center' }}>
                    <Send size={36} color="#E1E8F0" style={{ margin: '0 auto 10px', display: 'block' }} />
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', margin: 0 }}>No dispatches found</p>
                  </td>
                </tr>
              ) : filtered.map(d => {
                const status = dispatchStatus(d) as DispatchStatus
                const link = `${origin}/inspect/${d.token}`
                return (
                  <tr key={d.id} style={{ borderTop: '1px solid #F0F4F8' }}>
                    <td style={{ padding: '14px 16px' }}><VinCell vin={d.vin} /></td>
                    <td style={{ padding: '14px 16px', color: '#4A5568', maxWidth: 200 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.notes || <span style={{ color: '#CBD5E1' }}>—</span>}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}><StatusBadge status={status} /></td>
                    <td style={{ padding: '14px 16px', color: '#4A5568', whiteSpace: 'nowrap' }}>
                      {new Date(d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      {status === 'completed' && d.used_at
                        ? <span style={{ color: '#10B981', fontWeight: 600 }}>{new Date(d.used_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        : status === 'expired'
                          ? <span style={{ color: '#EF4444' }}>Expired</span>
                          : <span style={{ color: '#F59E0B', fontWeight: 600 }}>{timeRemaining(d.expires_at)}</span>}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <CopyButton text={link} />
                        <a href={link} target="_blank" rel="noopener noreferrer"
                          style={{ height: 32, width: 32, borderRadius: 8, border: '1px solid #E1E8F0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                          <ExternalLink size={14} color="#94A3B8" />
                        </a>
                        {status === 'completed' && d.inspection_id && (
                          <a href={`/reports/${d.inspection_id}`} target="_blank" rel="noopener noreferrer"
                            style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #E1E8F0', background: '#fff', display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: '#00B4D8', textDecoration: 'none', whiteSpace: 'nowrap', gap: 4 }}>
                            View Report
                          </a>
                        )}
                        {status === 'expired' && (
                          <button
                            onClick={() => setResendSheet({ open: true, vin: d.vin || undefined, year: d.year || undefined, make: d.make || undefined, model: d.model || undefined })}
                            style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #F59E0B', background: '#FFF', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#92400E', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            <RefreshCw size={12} />Resend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {!isDesktop && (
        <div>
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#FFF', borderRadius: 14, marginBottom: 8, padding: '14px 16px' }}>
              <Skeleton h={18} r={6} />
            </div>
          ))}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <Send size={36} color="#E1E8F0" style={{ margin: '0 auto 10px', display: 'block' }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', margin: 0 }}>No dispatches yet</p>
              <p style={{ fontSize: 13, color: '#CBD5E1', margin: '4px 0 0' }}>Tap "Send New Link" to create one</p>
            </div>
          )}
          {!loading && filtered.map(d => {
            const status = dispatchStatus(d) as DispatchStatus
            const cfg = STATUS_CONFIG[status]
            const link = `${origin}/inspect/${d.token}`
            return (
              <div key={d.id} style={{ background: '#FFFFFF', borderRadius: 14, marginBottom: 8, boxShadow: '0 1px 4px rgba(13,27,42,0.06)', borderLeft: `4px solid ${cfg.border}`, padding: '12px 16px' }}>
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <VinCell vin={d.vin} />
                  <StatusBadge status={status} />
                </div>
                {/* Notes */}
                <p style={{ fontSize: 12, color: d.notes ? '#4A5568' : '#CBD5E1', margin: '0 0 8px', fontStyle: d.notes ? 'normal' : 'italic' }}>
                  {d.notes || 'No notes'}
                </p>
                {/* Dates row */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>
                    Sent {new Date(d.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  {status === 'completed' && d.used_at && (
                    <span style={{ fontSize: 11, color: '#10B981', fontWeight: 600 }}>
                      Completed {new Date(d.used_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                  {status === 'awaiting' && (
                    <span style={{ fontSize: 11, color: '#F59E0B', fontWeight: 600 }}>
                      Expires in {timeRemaining(d.expires_at)}
                    </span>
                  )}
                  {status === 'expired' && (
                    <span style={{ fontSize: 11, color: '#EF4444', fontWeight: 600 }}>Expired</span>
                  )}
                </div>
                {/* Action row */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <CopyButton text={link} />
                  <a href={link} target="_blank" rel="noopener noreferrer"
                    style={{ height: 32, width: 32, borderRadius: 8, border: '1px solid #E1E8F0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                    <ExternalLink size={14} color="#94A3B8" />
                  </a>
                  {status === 'completed' && d.inspection_id && (
                    <a href={`/reports/${d.inspection_id}`} target="_blank" rel="noopener noreferrer"
                      style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #E1E8F0', background: '#fff', display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: '#00B4D8', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                      View Report
                    </a>
                  )}
                  {status === 'expired' && (
                    <button
                      onClick={() => setResendSheet({ open: true, vin: d.vin || undefined, year: d.year || undefined, make: d.make || undefined, model: d.model || undefined })}
                      style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #F59E0B', background: '#FFF', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#92400E', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                      <RefreshCw size={12} />Resend
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <SendLinkSheet
        isOpen={showSendSheet}
        onClose={handleSheetClose}
      />
      <SendLinkSheet
        isOpen={resendSheet.open}
        onClose={handleSheetClose}
        prefilledVin={resendSheet.vin}
        prefilledYear={resendSheet.year}
        prefilledMake={resendSheet.make}
        prefilledModel={resendSheet.model}
      />
      <BottomNav />
    </div>
    </>
  )
}

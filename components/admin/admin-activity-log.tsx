'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getAllActivityLog, type AdminActivityRow, type AdminActionType } from '@/lib/admin-activity-actions'
import { getAllCompanies } from '@/lib/admin-actions'
import { Clock, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 30

const ACTION_LABELS: Record<AdminActionType, string> = {
  flag_toggled: 'Feature Flag',
  plan_changed: 'Plan Change',
  report_limit_adjusted: 'Report Limits',
  member_cap_changed: 'Member Cap',
  ghost_mode_entered: 'Ghost Mode Entered',
  ghost_mode_exited: 'Ghost Mode Exited',
  role_changed: 'Role Change',
  note_added: 'Note Added',
}

export default function AdminActivityLog() {
  const router = useRouter()
  const [rows, setRows] = useState<AdminActivityRow[]>([])
  const [total, setTotal] = useState(0)
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [actionType, setActionType] = useState('')
  const [accountId, setAccountId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    getAllCompanies().then(data => setCompanies((data as Record<string, unknown>[]).map(c => ({ id: c.id as string, name: c.name as string }))))
  }, [])

  const load = useCallback(async (offset: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true)
    const { rows: newRows, total: newTotal } = await getAllActivityLog({
      actionType: actionType || null,
      accountId: accountId || null,
      limit: PAGE_SIZE,
      offset,
    })
    setRows(prev => append ? [...prev, ...newRows] : newRows)
    setTotal(newTotal)
    setLoading(false)
    setLoadingMore(false)
  }, [actionType, accountId])

  useEffect(() => { load(0, false) }, [load])

  return (
    <div style={{ padding: 24, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#F1F5F9', margin: 0 }}>Activity Log</h1>
        <div style={{ flex: 1 }} />
        <select value={actionType} onChange={e => setActionType(e.target.value)}
          style={{ height: 38, padding: '0 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, background: '#1B2D40', color: '#F1F5F9', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
          <option value="">All Actions</option>
          {Object.entries(ACTION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={accountId} onChange={e => setAccountId(e.target.value)}
          style={{ height: 38, padding: '0 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, background: '#1B2D40', color: '#F1F5F9', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', maxWidth: 220 }}>
          <option value="">All Accounts</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ background: '#1B2D40', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ height: 48, background: 'rgba(255,255,255,0.06)', borderRadius: 10, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <Clock size={32} color="#94A3B8" style={{ display: 'block', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 16, fontWeight: 600, color: '#F1F5F9', margin: '0 0 4px' }}>No activity found</p>
            <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>Try adjusting your filters</p>
          </div>
        ) : (
          rows.map((a, i) => (
            <div key={a.id}
              onClick={() => a.account_id && router.push(`/admin/customers/${a.account_id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
                borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
                cursor: a.account_id ? 'pointer' : 'default',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,255,255,0.08)', color: '#CBD5E1' }}>
                    {ACTION_LABELS[a.action_type] ?? a.action_type}
                  </span>
                  {a.accountName && <span style={{ fontSize: 12, fontWeight: 600, color: '#F1F5F9' }}>{a.accountName}</span>}
                  <span style={{ fontSize: 11, color: '#94A3B8' }}>by {a.actorName ?? 'System'}</span>
                </div>
                <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.description}</p>
              </div>
              <span style={{ fontSize: 11, color: '#94A3B8', flexShrink: 0 }}>{new Date(a.created_at).toLocaleString()}</span>
              {a.account_id && <ChevronRight size={14} color="#94A3B8" style={{ flexShrink: 0 }} />}
            </div>
          ))
        )}
      </div>

      {!loading && rows.length < total && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
          <button
            onClick={() => load(rows.length, true)}
            disabled={loadingMore}
            style={{ height: 38, padding: '0 20px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: '#1B2D40', color: '#F1F5F9', fontSize: 13, fontWeight: 600, cursor: loadingMore ? 'default' : 'pointer', fontFamily: 'inherit' }}
          >
            {loadingMore ? 'Loading...' : `Load More (${rows.length} of ${total})`}
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { getCompanyMembers, updateCompanyMemberRole, removeCompanyMember } from '@/lib/role-actions'
import { Mail, Loader2, Shield, Wrench, Trash2 } from 'lucide-react'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import { useMediaQuery } from '@/hooks/use-media-query'

const ROLE_CONFIG = {
  admin:     { label: 'Admin',     bg: '#FEF3C7', color: '#92400E', icon: Shield },
  inspector: { label: 'Inspector', bg: '#E0F7FC', color: '#0097B2', icon: Wrench },
}

export default function MembersPage() {
  const { effectiveCompany, user, companyRole, platformRole, loading: authLoading } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const companyId = effectiveCompany?.id ?? ''

  const canManage = platformRole === 'super_admin' || companyRole === 'admin'

  const [members, setMembers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try { setMembers(await getCompanyMembers(companyId)) }
    finally { setLoading(false) }
  }, [companyId])

  useEffect(() => { load() }, [load])

  const handleRoleChange = async (memberId: string, role: 'admin' | 'inspector') => {
    setUpdating(memberId)
    try { await updateCompanyMemberRole(memberId, role); await load() }
    catch (e: any) { setErrorMsg(e.message) }
    finally { setUpdating(null) }
  }

  const doRemove = async (memberId: string) => {
    setConfirmRemoveId(null)
    setUpdating(memberId)
    try { await removeCompanyMember(memberId); await load() }
    catch (e: any) { setErrorMsg(e.message) }
    finally { setUpdating(null) }
  }

  const companyName = effectiveCompany?.name ?? 'my account'
  const mailtoHref = `mailto:support@conditioniq.com?subject=${encodeURIComponent(`Add Team Member – ${companyName}`)}&body=${encodeURIComponent(`Hi CIQ team,\n\nPlease add the following person to my account (${companyName}):\n\nName: \nEmail: \nRole: Inspector / Admin\n\nThanks`)}`

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <div style={{ padding: isDesktop ? '28px 32px' : '16px', paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))', maxWidth: 800, margin: '0 auto' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: isDesktop ? 22 : 20, fontWeight: 800, color: '#0D1B2A', margin: '0 0 4px' }}>Team Members</h1>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>{effectiveCompany?.name} · {members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>

        {/* Add member — via CIQ team */}
        {!authLoading && canManage && (
          <div style={{ background: '#F8FAFC', border: '1px solid #E1E8F0', borderRadius: 16, padding: '18px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A', margin: '0 0 4px' }}>Need to add a team member?</p>
              <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
                Email the Condition IQ team and we'll get them set up on your account — usually within one business day.
              </p>
            </div>
            <a
              href={mailtoHref}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: 42, padding: '0 20px', borderRadius: 10,
                background: '#00B4D8', border: 'none', color: '#FFFFFF',
                fontWeight: 700, fontSize: 14, cursor: 'pointer',
                fontFamily: 'inherit', textDecoration: 'none', flexShrink: 0,
              }}
            >
              <Mail size={15} /> Email CIQ Team
            </a>
          </div>
        )}

        {/* Members list */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}>
              <Loader2 size={20} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : members.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>No members yet.</p>
            </div>
          ) : members.map((m, i) => {
            const role = (m.role ?? 'inspector') as 'admin' | 'inspector'
            const cfg = ROLE_CONFIG[role]
            const isUpdating = updating === m.id
            const u = m.user as any
            const isSelf = u?.id === user?.id || m.user_id === user?.id
            return (
              <div key={m.id} style={{ padding: '14px 20px', borderTop: i === 0 ? 'none' : '1px solid #F0F4F8', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, background: role === 'admin' ? '#FEF3C7' : '#E0F7FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: role === 'admin' ? '#92400E' : '#0097B2' }}>
                    {(u?.full_name?.[0] ?? u?.email?.[0] ?? '?').toUpperCase()}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>
                    {u?.full_name ?? '—'}
                    {isSelf && <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 6 }}>(you)</span>}
                  </p>
                  <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{u?.email ?? '—'}</p>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: cfg.bg, color: cfg.color, borderRadius: 20, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                  <cfg.icon size={11} />{cfg.label}
                </span>
                {!authLoading && canManage && !isSelf && (
                  isUpdating ? (
                    <Loader2 size={16} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select
                        value={role}
                        onChange={e => handleRoleChange(m.id, e.target.value as 'admin' | 'inspector')}
                        style={{ height: 32, padding: '0 8px', border: '1px solid #E1E8F0', borderRadius: 8, fontSize: 12, background: '#FFF', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }}>
                        <option value="inspector">Inspector</option>
                        <option value="admin">Admin</option>
                      </select>
                      <button
                        onClick={() => setConfirmRemoveId(m.id)}
                        style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #FEE2E2', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <Trash2 size={13} color="#EF4444" />
                      </button>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
        <BottomNav />
      </div>

      {confirmRemoveId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setConfirmRemoveId(null)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0D1B2A', margin: '0 0 12px' }}>Remove Member</h3>
            <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>Are you sure you want to remove this member from your team?</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmRemoveId(null)} style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => doRemove(confirmRemoveId)} style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: '#EF4444', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setErrorMsg(null)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 12px' }}>Something went wrong</h3>
            <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>{errorMsg}</p>
            <button onClick={() => setErrorMsg(null)} style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>OK</button>
          </div>
        </div>
      )}
    </>
  )
}

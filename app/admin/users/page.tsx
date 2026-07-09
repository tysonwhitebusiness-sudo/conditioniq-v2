'use client'

import { useState, useEffect, useCallback } from 'react'
import { getAllUsers, updatePlatformRole } from '@/lib/role-actions'
import { logAdminActivity } from '@/lib/admin-activity-actions'
import { useAuth } from '@/contexts/auth-context'
import { ShieldCheck, User, Loader2, Search } from 'lucide-react'

const ROLE_CONFIG = {
  super_admin: { label: 'Super Admin', bg: '#FEF3C7', color: '#92400E', icon: ShieldCheck },
  user:        { label: 'User',        bg: '#F0F4F8', color: '#4A5568', icon: User },
}

export default function AdminUsersPage() {
  const { user: actingUser } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [updating, setUpdating] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setUsers(await getAllUsers()) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRoleChange = async (userId: string, newRole: 'super_admin' | 'user') => {
    setUpdating(userId)
    const target = users.find(u => u.id === userId)
    const oldRole = target?.platform_role ?? 'user'
    try {
      await updatePlatformRole(userId, newRole)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, platform_role: newRole } : u))
      logAdminActivity({
        accountId: target?.company_id ?? null,
        actorId: actingUser?.id ?? null,
        actionType: 'role_changed',
        description: `${target?.full_name ?? target?.email ?? 'User'} role changed from ${oldRole} to ${newRole}`,
        metadata: { userId, oldRole, newRole },
      })
    } catch (e: any) {
      setErrorMsg('Failed: ' + e.message)
    } finally { setUpdating(null) }
  }

  const filtered = users.filter(u => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.companies?.name?.toLowerCase().includes(q))
  })

  const superAdminCount = users.filter(u => u.platform_role === 'super_admin').length

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#F8FAFC', margin: '0 0 4px' }}>Users & Roles</h1>
        <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>
          Manage platform access. {superAdminCount} super admin{superAdminCount !== 1 ? 's' : ''} — {users.length} total users.
        </p>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={15} color="#475569" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or company…"
          style={{ width: '100%', height: 42, background: '#1B2D40', border: '1px solid #334155', borderRadius: 10, padding: '0 12px 0 36px', fontSize: 14, color: '#F1F5F9', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#1B2D40', border: '1px solid #334155', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#0D1B2A' }}>
              {['Name', 'Email', 'Company', 'Platform Role', ''].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center' }}>
                <Loader2 size={20} color="#475569" style={{ animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#475569', fontSize: 14 }}>No users found</td></tr>
            ) : filtered.map(u => {
              const role = (u.platform_role ?? 'user') as 'super_admin' | 'user'
              const cfg = ROLE_CONFIG[role]
              const isUpdating = updating === u.id
              return (
                <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 16, background: role === 'super_admin' ? '#F4A62A' : '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: role === 'super_admin' ? '#0D1B2A' : '#94A3B8', flexShrink: 0 }}>
                        {(u.full_name?.[0] ?? u.email?.[0] ?? '?').toUpperCase()}
                      </div>
                      <span style={{ fontWeight: 600, color: '#F1F5F9' }}>{u.full_name ?? '—'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', color: '#94A3B8' }}>{u.email ?? '—'}</td>
                  <td style={{ padding: '14px 16px', color: '#64748B' }}>{u.companies?.name ?? '—'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: cfg.bg, color: cfg.color, borderRadius: 20, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>
                      <cfg.icon size={11} />{cfg.label}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {isUpdating ? (
                      <Loader2 size={16} color="#475569" style={{ animation: 'spin 0.8s linear infinite' }} />
                    ) : (
                      <select
                        value={role}
                        onChange={e => handleRoleChange(u.id, e.target.value as 'super_admin' | 'user')}
                        style={{ height: 32, padding: '0 8px', borderRadius: 8, border: '1px solid #334155', background: '#0D1B2A', color: '#94A3B8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', outline: 'none' }}
                      >
                        <option value="user">User</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {errorMsg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setErrorMsg(null)} />
          <div style={{ position: 'relative', background: '#1B2D40', border: '1px solid #334155', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F1F5F9', margin: '0 0 12px' }}>Something went wrong</h3>
            <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.6, margin: '0 0 24px' }}>{errorMsg}</p>
            <button onClick={() => setErrorMsg(null)} style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: '#334155', color: '#F1F5F9', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>OK</button>
          </div>
        </div>
      )}
    </div>
  )
}

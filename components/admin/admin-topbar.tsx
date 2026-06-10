'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Bell, Search } from 'lucide-react'

const TITLES: Record<string, string> = {
  '/admin/overview':      'Overview',
  '/admin/customers':     'Customers',
  '/admin/users':         'Users & Roles',
  '/admin/crm':           'CRM Dashboard',
  '/admin/crm/queue':     'Outreach Queue',
  '/admin/crm/leads':     'All Leads',
  '/admin/crm/pipeline':  'Pipeline',
}

export default function AdminTopBar() {
  const pathname = usePathname()
  const { userProfile, user } = useAuth()

  const title = Object.entries(TITLES).find(([k]) =>
    pathname === k || (k !== '/admin/crm' && pathname.startsWith(k + '/'))
  )?.[1] ?? 'Admin'

  const displayName = userProfile?.full_name ?? user?.email ?? ''
  const initials = displayName.split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'A'

  return (
    <div style={{
      position: 'fixed', top: 0, left: 256, right: 0, height: 64,
      background: '#0D1B2A', zIndex: 30,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', margin: 0 }}>{title}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            placeholder="Search..."
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '7px 12px 7px 30px', fontSize: 13,
              color: 'rgba(255,255,255,0.6)', outline: 'none', fontFamily: 'inherit', width: 180,
            }}
          />
        </div>
        <button style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bell size={16} color="rgba(255,255,255,0.5)" />
        </button>
        <div style={{ width: 32, height: 32, borderRadius: 16, background: '#F4A62A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#0D1B2A' }}>
          {initials}
        </div>
      </div>
    </div>
  )
}

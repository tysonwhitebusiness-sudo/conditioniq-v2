'use client'

import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { Bell, Menu } from 'lucide-react'

const TITLES: Record<string, string> = {
  '/admin/overview':      'Overview',
  '/admin/customers':     'Customers',
  '/admin/users':         'Users & Roles',
  '/admin/feedback':      'Feedback',
  '/admin/crm':           'CRM Dashboard',
  '/admin/crm/queue':     'Outreach Queue',
  '/admin/crm/leads':     'All Leads',
  '/admin/crm/pipeline':  'Pipeline',
  '/admin/crm/inbound':   'Inbound Requests',
}

interface Props {
  onHamburgerClick: () => void
}

export default function AdminTopBar({ onHamburgerClick }: Props) {
  const pathname = usePathname()
  const { userProfile, user } = useAuth()

  const title = Object.entries(TITLES).find(([k]) =>
    pathname === k || (k !== '/admin/crm' && pathname.startsWith(k + '/'))
  )?.[1] ?? 'Admin'

  const displayName = userProfile?.full_name ?? user?.email ?? ''
  const initials = displayName.split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'A'

  return (
    <div className="adm-topbar">
      {/* Left: hamburger (mobile) + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="adm-hamburger"
          onClick={onHamburgerClick}
          style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}
        >
          <Menu size={18} color="rgba(255,255,255,0.7)" />
        </button>
        <h1 style={{ fontSize: 17, fontWeight: 700, color: '#FFFFFF', margin: 0 }}>{title}</h1>
      </div>

      {/* Right: search (desktop only) + bell + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="adm-search"
          style={{ width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}
        >
          <Bell size={16} color="rgba(255,255,255,0.5)" />
        </button>
        <div style={{ width: 32, height: 32, borderRadius: 16, background: '#F4A62A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#0D1B2A', flexShrink: 0 }}>
          {initials}
        </div>
      </div>
    </div>
  )
}

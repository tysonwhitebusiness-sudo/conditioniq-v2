'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import {
  Car, BarChart2, Users, Target, List, UserCheck, Columns2,
  ChevronLeft, ShieldCheck, LogOut, MessageSquare, Inbox, Clock,
} from 'lucide-react'

const OPS_ITEMS = [
  { href: '/admin/overview',  label: 'Overview',       icon: BarChart2     },
  { href: '/admin/customers', label: 'Customers',      icon: Users         },
  { href: '/admin/users',     label: 'Users & Roles',  icon: ShieldCheck   },
  { href: '/admin/feedback',  label: 'Feedback',       icon: MessageSquare },
  { href: '/admin/activity',  label: 'Activity Log',   icon: Clock         },
]

const CRM_ITEMS = [
  { href: '/admin/crm',           label: 'CRM Dashboard',  icon: Target,    exact: true },
  { href: '/admin/crm/queue',     label: 'Outreach Queue', icon: List       },
  { href: '/admin/crm/leads',     label: 'All Leads',      icon: UserCheck  },
  { href: '/admin/crm/pipeline',  label: 'Pipeline',       icon: Columns2   },
  { href: '/admin/crm/inbound',   label: 'Inbound',        icon: Inbox      },
]

const SL: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.3)', padding: '16px 12px 6px', display: 'block',
}

interface Props {
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function AdminSidebar({ mobileOpen, onMobileClose }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, userProfile, signOut, impersonatedCompany } = useAuth()

  const displayName = userProfile?.full_name ?? user?.email ?? ''
  const initials = displayName.split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'A'

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/')

  const itemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px',
    borderRadius: active ? '0 8px 8px 0' : 8,
    margin: '1px 0', cursor: 'pointer',
    background: active ? 'rgba(0,180,216,0.12)' : 'transparent',
    color: active ? '#00B4D8' : 'rgba(255,255,255,0.6)',
    borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0,
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: active ? '#00B4D8' : 'transparent',
    fontSize: 14, fontWeight: 500,
    width: '100%', textAlign: 'left', outline: 'none', fontFamily: 'inherit',
    transition: 'background 150ms, color 150ms',
  })

  const nav = (href: string) => { router.push(href); onMobileClose() }

  return (
    <>
      {/* Mobile backdrop */}
      <div className={`adm-overlay ${mobileOpen ? 'mob-open' : ''}`} onClick={onMobileClose} />

      {/* Sidebar panel */}
      <div className={`adm-sidebar ${mobileOpen ? 'mob-open' : ''}`}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Car size={18} color="#FFF" />
            </div>
            <div>
              <p style={{ color: '#FFF', fontWeight: 700, fontSize: 15, margin: 0 }}>Condition IQ</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: 0 }}>Admin</p>
            </div>
          </div>
          <button
            onClick={() => nav('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.5)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}
          >
            <ChevronLeft size={13} /> Back to App
          </button>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, padding: '0 8px', paddingBottom: 8 }}>
          <span style={SL}>Operations</span>
          {OPS_ITEMS.map(({ href, label, icon: Icon }) => (
            <button key={href} onClick={() => nav(href)} style={itemStyle(isActive(href))}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}

          <span style={SL}>Sales CRM</span>
          {CRM_ITEMS.map(({ href, label, icon: Icon, exact }) => (
            <button key={href} onClick={() => nav(href)} style={itemStyle(isActive(href, exact))}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: '#F4A62A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#0D1B2A', flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName || user?.email}</p>
              <p style={{ fontSize: 11, color: '#00B4D8', margin: 0 }}>Super Admin</p>
              {impersonatedCompany && (
                <p style={{ fontSize: 10, fontWeight: 700, color: '#F4A62A', margin: '2px 0 0' }}>Ghost Mode: {impersonatedCompany.name}</p>
              )}
            </div>
          </div>
          <button
            onClick={async () => signOut()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.4)', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'inherit' }}
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>
    </>
  )
}

'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import {
  Car, Send, MapPin, Grid3x3, Package, FileText,
  Shield, LogOut, ChevronLeft, ChevronRight, Play, Users, LayoutGrid, CreditCard, DollarSign, Palette, Settings, ChevronDown, User,
} from 'lucide-react'
import { useFeatureFlag } from '@/hooks/use-feature-flag'

export type NavTab = 'home' | 'queue' | 'history' | 'account'

interface Props {
  activeTab?: string
  onTabChange?: (tab: string) => void
  onStartInspection?: () => void
  onSendToInspector?: () => void
  isInspecting?: boolean
  collapsed?: boolean
  onCollapseChange?: (collapsed: boolean) => void
  onStartPress?: () => void
}

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  type: 'tab' | 'route' | 'action'
  tab?: string
  route?: string
}

export default function DesktopSidebar({
  activeTab, onTabChange, onStartInspection, onSendToInspector, isInspecting = false,
  collapsed = false, onCollapseChange, onStartPress,
}: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, userProfile, effectiveCompany, isOwnerUser, companyRole, signOut } = useAuth()

  // Auto-collapse when an inspection starts
  useEffect(() => {
    if (isInspecting && !collapsed) {
      onCollapseChange?.(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInspecting])

  const isFMC = effectiveCompany?.account_type === 'fmc'
  const lotMapEnabled = useFeatureFlag('lot_map')
  const whiteLabelEnabled = useFeatureFlag('white_label')
  const dispatchEnabled = useFeatureFlag('dispatch')
  const settingsOpen = pathname.startsWith('/settings')
  const reportsUsed = effectiveCompany?.reports_used ?? 0
  const reportsTotal = effectiveCompany?.reports_included ?? 10
  const usagePct = Math.min(100, reportsTotal > 0 ? (reportsUsed / reportsTotal) * 100 : 0)
  const usageBarColor = usagePct >= 100 ? '#EF4444' : usagePct >= 80 ? '#F4A62A' : '#00B4D8'
  const displayName = userProfile?.full_name ?? user?.email ?? ''
  const initials = displayName.split(' ').filter(Boolean).map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || 'U'

  const isActive = (item: NavItem) => {
    if (item.type === 'tab') return !isInspecting && activeTab === item.tab
    if (item.type === 'route') return pathname === item.route || pathname.startsWith((item.route ?? '/___') + '/')
    return false
  }

  const handleClick = (item: NavItem) => {
    if (isInspecting && item.id !== 'signout') return
    if (item.type === 'tab' && onTabChange) onTabChange(item.tab!)
    else if (item.type === 'route' && item.route) router.push(item.route)
    else if (item.type === 'action' && item.id === 'start') { onStartPress?.(); onStartInspection?.() }
    else if (item.type === 'action' && item.id === 'send-inspector') onSendToInspector?.()
  }

  const inspItems: NavItem[] = [
    { id: 'start', label: 'Start Inspection', icon: <Play size={18} />, type: 'action' as const },
    { id: 'vehicles', label: 'Vehicles', icon: <Car size={18} />, type: 'route', route: '/vehicles' },
    ...(dispatchEnabled ? [{ id: 'dispatch', label: 'Dispatch', icon: <Send size={18} />, type: 'route' as const, route: '/storage/dispatch' }] : []),
    ...(isFMC ? [{ id: 'locations', label: 'Locations', icon: <MapPin size={18} />, type: 'route' as const, route: '/storage/locations' }] : []),
    ...(lotMapEnabled ? [{ id: 'lot', label: 'Lot', icon: <LayoutGrid size={18} />, type: 'route' as const, route: '/lot' }] : []),
  ]

  const storageItems: NavItem[] = []

  const fleetItems: NavItem[] = [
    { id: 'fleet', label: 'Fleet Dashboard', icon: <Grid3x3 size={18} />, type: 'route', route: '/fleet' },
    { id: 'fleet-dispatch', label: 'Dispatch', icon: <Send size={18} />, type: 'route', route: '/fleet/dispatch' },
    { id: 'fleet-inventory', label: 'Inventory', icon: <Package size={18} />, type: 'route', route: '/fleet/inventory' },
    { id: 'fleet-reports', label: 'Reports', icon: <FileText size={18} />, type: 'route', route: '/fleet/reports' },
  ]

  const toggleBtn = (
    <button
      onClick={() => onCollapseChange?.(!collapsed)}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      style={{
        width: 28, height: 28, borderRadius: 8,
        background: 'rgba(255,255,255,0.06)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.4)',
        flexShrink: 0,
      }}
    >
      {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
    </button>
  )

  const collapsedItemStyle = (active: boolean, dimmed = false): React.CSSProperties => ({
    width: 40, height: 40, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    margin: '2px auto',
    background: active ? 'rgba(0,180,216,0.15)' : 'transparent',
    color: dimmed ? 'rgba(255,255,255,0.2)' : active ? '#00B4D8' : 'rgba(255,255,255,0.6)',
    border: active ? '1px solid rgba(0,180,216,0.25)' : '1px solid transparent',
    cursor: isInspecting ? 'default' : 'pointer',
    transition: 'background 150ms ease',
    fontFamily: 'inherit',
    outline: 'none',
  })

  const expandedItemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 12px',
    borderRadius: active ? '0 8px 8px 0' : 8,
    margin: '1px 0', cursor: isInspecting ? 'default' : 'pointer',
    background: active ? 'rgba(0,180,216,0.12)' : 'transparent',
    color: isInspecting ? 'rgba(255,255,255,0.4)' : active ? '#00B4D8' : 'rgba(255,255,255,0.7)',
    borderTopWidth: 0, borderRightWidth: 0, borderBottomWidth: 0,
    borderLeftWidth: 3, borderLeftStyle: 'solid', borderLeftColor: active ? '#00B4D8' : 'transparent',
    fontSize: 14, fontWeight: 500,
    width: '100%', textAlign: 'left', outline: 'none',
    pointerEvents: isInspecting ? 'none' : 'auto',
    transition: 'background 150ms ease, color 150ms ease',
    fontFamily: 'inherit',
  })

  const subItemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 8px 7px 10px',
    borderRadius: 6, margin: '1px 0',
    cursor: isInspecting ? 'default' : 'pointer',
    background: active ? 'rgba(0,180,216,0.10)' : 'transparent',
    color: isInspecting ? 'rgba(255,255,255,0.3)' : active ? '#00B4D8' : 'rgba(255,255,255,0.55)',
    border: 'none', fontSize: 13, fontWeight: active ? 600 : 400,
    width: '100%', textAlign: 'left' as const, outline: 'none',
    transition: 'background 150ms ease, color 150ms ease',
    fontFamily: 'inherit',
  })

  const sectionLabel: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.3)', padding: '16px 12px 6px',
  }

  const divider = (marginY = '8px 0 4px'): React.CSSProperties => ({
    height: 1, width: 32, background: 'rgba(255,255,255,0.06)', margin: marginY, alignSelf: 'center',
  })

  return (
    <div style={{
      position: 'fixed', left: 0, top: 0, bottom: 0, width: collapsed ? 64 : 256,
      background: '#1B2D40', zIndex: 40,
      display: 'flex', flexDirection: 'column',
      transition: 'width 200ms ease',
      overflowX: 'hidden', overflowY: 'auto',
    }}>

      {/* ── Logo area ── */}
      {collapsed ? (
        <div style={{ padding: '20px 0 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Car size={18} color="#FFFFFF" />
          </div>
          {toggleBtn}
        </div>
      ) : (
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: effectiveCompany?.name ? 4 : 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Car size={18} color="#FFFFFF" />
            </div>
            <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 16, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>Condition IQ</span>
            {toggleBtn}
          </div>
          {effectiveCompany?.name && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, marginLeft: 46, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {effectiveCompany.name}
            </p>
          )}
        </div>
      )}

      {/* ── Nav ── */}
      {collapsed ? (
        <div style={{ flex: 1, paddingTop: 8, paddingBottom: 8, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={divider('4px 0 6px')} />
          {inspItems.map(item => (
            <button key={item.id} onClick={() => handleClick(item)} title={item.label} style={collapsedItemStyle(isActive(item))}>
              {item.icon}
            </button>
          ))}

          {isFMC && (
            <>
              <div style={divider()} />
              {fleetItems.map(item => (
                <button key={item.id} onClick={() => handleClick(item)} title={item.label} style={collapsedItemStyle(isActive(item))}>
                  {item.icon}
                </button>
              ))}
            </>
          )}

          <div style={divider()} />
          <button onClick={() => !isInspecting && router.push('/settings')} title="Settings" style={collapsedItemStyle(pathname.startsWith('/settings'))}>
            <Settings size={18} />
          </button>
          {isOwnerUser && (
            <button onClick={() => !isInspecting && router.push('/admin/overview')} title="Admin Center" style={collapsedItemStyle(pathname.startsWith('/admin'))}>
              <Shield size={18} />
            </button>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
          <p style={sectionLabel}>Inspections</p>
          {inspItems.map(item => (
            <button key={item.id} onClick={() => handleClick(item)} style={expandedItemStyle(isActive(item))}>
              {item.icon}
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.id === 'start' && (
                <span style={{ fontSize: 9, fontWeight: 800, background: '#F4A62A', color: '#0D1B2A', borderRadius: 6, padding: '2px 6px', letterSpacing: '0.04em' }}>NEW</span>
              )}
            </button>
          ))}

          {isFMC && (
            <>
              <p style={sectionLabel}>Fleet</p>
              {fleetItems.map(item => (
                <button key={item.id} onClick={() => handleClick(item)} style={expandedItemStyle(isActive(item))}>
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              ))}
            </>
          )}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />
          <button onClick={() => !isInspecting && router.push('/settings')} style={expandedItemStyle(pathname === '/settings')}>
            <Settings size={18} />
            <span style={{ flex: 1 }}>Settings</span>
            <ChevronDown size={13} style={{ transform: settingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 200ms', opacity: 0.35, flexShrink: 0 }} />
          </button>
          {settingsOpen && (
            <div style={{ marginLeft: 16, borderLeft: '1px solid rgba(255,255,255,0.07)', paddingLeft: 4, marginBottom: 2 }}>
              <button onClick={() => !isInspecting && router.push('/settings/profile')} style={subItemStyle(pathname === '/settings/profile')}>
                <User size={14} /><span>Profile</span>
              </button>
              <button onClick={() => !isInspecting && router.push('/settings/billing')} style={subItemStyle(pathname === '/settings/billing')}>
                <CreditCard size={14} /><span>Billing & Plan</span>
              </button>
              {(isOwnerUser || companyRole === 'admin') && (
                <button onClick={() => !isInspecting && router.push('/settings/members')} style={subItemStyle(pathname === '/settings/members')}>
                  <Users size={14} /><span>Team Members</span>
                </button>
              )}
              {(isOwnerUser || companyRole === 'admin') && whiteLabelEnabled && (
                <button onClick={() => !isInspecting && router.push('/settings/branding')} style={subItemStyle(pathname === '/settings/branding')}>
                  <Palette size={14} /><span>Branding</span>
                </button>
              )}
              {(isOwnerUser || companyRole === 'admin') && lotMapEnabled && (
                <button onClick={() => !isInspecting && router.push('/settings/lot-billing')} style={subItemStyle(pathname === '/settings/lot-billing')}>
                  <DollarSign size={14} /><span>Lot Billing</span>
                </button>
              )}
            </div>
          )}
          {isOwnerUser && (
            <button onClick={() => !isInspecting && router.push('/admin/overview')} style={expandedItemStyle(pathname.startsWith('/admin'))}>
              <Shield size={18} />
              <span>Admin Center</span>
            </button>
          )}
        </div>
      )}

      {/* ── Footer ── */}
      {collapsed ? (
        <div style={{ padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: 4, width: `${usagePct}%`, background: usageBarColor, borderRadius: 2 }} />
          </div>
          <div
            title={displayName || user?.email}
            style={{ width: 32, height: 32, borderRadius: 16, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#FFFFFF' }}
          >
            {initials}
          </div>
        </div>
      ) : (
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{reportsUsed} / {reportsTotal} reports</span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>
                {effectiveCompany?.subscription_tier ?? 'free'}
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <div style={{ height: 4, background: usageBarColor, borderRadius: 2, width: `${usagePct}%`, transition: 'width 400ms ease' }} />
            </div>
          </div>

          <button
            onClick={() => !isInspecting && handleClick({ id: 'account', label: 'Profile', icon: null, type: 'tab', tab: 'account' })}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', padding: '8px 0', cursor: 'pointer' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 16, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#FFFFFF', flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayName || user?.email}
              </p>
            </div>
            <button
              onClick={async (e) => { e.stopPropagation(); await signOut(); router.replace('/login') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, flexShrink: 0 }}
              title="Sign out"
            >
              <LogOut size={15} color="rgba(255,255,255,0.4)" />
            </button>
          </button>
        </div>
      )}
    </div>
  )
}

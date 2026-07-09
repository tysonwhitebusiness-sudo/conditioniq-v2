'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import { StatChip, FeatureCard, DEEP_NAVY, CYAN, type StatChipData } from '@/components/home/dashboard-primitives'
import { useDashboardData } from '@/components/home/use-dashboard-data'
import {
  Car, ChevronRight, AlertTriangle, X, ClipboardList, MapPin, MapPinned,
  Receipt, Send, Users, RefreshCw, FileText, DollarSign, Pencil, LogOut,
} from 'lucide-react'

interface Props {
  onStartInspection: () => void
  onResumeInspection: (data: any) => void
  onViewReport: (data: any) => void
}

const EVENT_ICON: Record<string, { icon: typeof Car; color: string }> = {
  intake:                { icon: Car,        color: CYAN },
  spot_assigned:         { icon: MapPin,     color: CYAN },
  spot_unassigned:       { icon: MapPin,     color: CYAN },
  status_changed:        { icon: RefreshCw,  color: CYAN },
  inspection_completed:  { icon: ClipboardList, color: CYAN },
  invoice_generated:     { icon: FileText,   color: '#00B4D8' },
  invoice_sent:          { icon: Send,       color: '#00B4D8' },
  invoice_paid:          { icon: DollarSign, color: '#00B4D8' },
  payment_logged:        { icon: DollarSign, color: '#00B4D8' },
  note_added:            { icon: Pencil,     color: CYAN },
  released:              { icon: LogOut,     color: CYAN },
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Yesterday' : `${days}d ago`
}

export default function HomeDashboard({ onStartInspection }: Props) {
  const { effectiveCompany } = useAuth()
  const router = useRouter()
  const companyId = effectiveCompany?.id ?? ''
  const [warningDismissed, setWarningDismissed] = useState(false)

  const {
    lotMapEnabled, lotBillingEnabled, dispatchEnabled,
    vehiclesOnLot, usageState, lotOccupancy, dailyAccrual, overdueCount,
    inspectionsToday, customerCount, events, expiringCount,
  } = useDashboardData(companyId)

  const isUnlimited = (usageState?.included ?? 0) >= 9999

  const statChips: StatChipData[] = [
    { label: 'Vehicles on lot', value: String(vehiclesOnLot) },
    ...(usageState ? [{ label: 'Reports used', value: `${usageState.used}/${isUnlimited ? '∞' : usageState.included}` }] : []),
    ...(lotMapEnabled && lotOccupancy ? [{ label: 'Lot occupancy', value: `${lotOccupancy.occupied}/${lotOccupancy.total}` }] : []),
    ...(lotMapEnabled ? [{ label: 'Accruing/day', value: `$${dailyAccrual.toFixed(0)}` }] : []),
    ...(lotBillingEnabled ? [{ label: 'Invoices overdue', value: String(overdueCount), amber: true }] : []),
  ]

  const exploreCards = [
    { key: 'vehicles', icon: Car, label: 'Vehicles', statLine: `${vehiclesOnLot} on lot`, locked: false, route: '/vehicles' },
    { key: 'inspections', icon: ClipboardList, label: 'Inspections', statLine: `${inspectionsToday} today`, locked: false, route: '/inspections' },
    { key: 'lot', icon: MapPinned, label: 'Lot', statLine: lotOccupancy ? `${lotOccupancy.occupied}/${lotOccupancy.total} occupied` : '—', locked: lotMapEnabled === false, route: '/lot' },
    { key: 'lot_billing', icon: Receipt, label: 'Lot Billing', statLine: `${overdueCount} overdue`, locked: lotBillingEnabled === false, route: '/lot-billing' },
    { key: 'dispatch', icon: Send, label: 'Dispatch', statLine: 'Send inspection links', locked: dispatchEnabled === false, route: '/storage/dispatch' },
    { key: 'customers', icon: Users, label: 'Customers', statLine: `${customerCount} customers`, locked: false, route: '/customers' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
      <MobilePageHeader />

      {expiringCount > 0 && !warningDismissed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: '#FEF3C7', borderBottom: '1px solid #F59E0B' }}>
          <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0 }} />
          <p style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#92400E', margin: 0 }}>
            {expiringCount} inspection{expiringCount !== 1 ? 's' : ''} will auto-complete in less than 4 hours.{' '}
            <button onClick={() => router.push('/inspections?tab=in_progress')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#D97706', fontWeight: 600, fontSize: 13, textDecoration: 'underline' }}>
              Resume now →
            </button>
          </p>
          <button onClick={() => setWarningDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}>
            <X size={16} color="#92400E" />
          </button>
        </div>
      )}

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Stat strip — horizontally scrollable */}
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -16px', padding: '0 16px', scrollbarWidth: 'none' }}>
          {statChips.map(s => <StatChip key={s.label} {...s} />)}
        </div>

        {/* Start New Inspection */}
        <button onClick={onStartInspection}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderRadius: 18, border: 'none', cursor: 'pointer', background: CYAN, boxShadow: '0 4px 16px rgba(0,180,216,0.35)', fontFamily: 'inherit' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Car size={22} color="#FFFFFF" />
            <span style={{ fontWeight: 700, fontSize: 16, color: '#FFFFFF' }}>Start New Inspection</span>
          </div>
          <ChevronRight size={20} color="rgba(255,255,255,0.6)" />
        </button>

        {/* Explore */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', margin: '0 0 10px' }}>Explore</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {exploreCards.map(c => (
              <FeatureCard key={c.key} icon={c.icon} label={c.label} statLine={c.statLine} locked={c.locked} onClick={() => router.push(c.route)} />
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', margin: '0 0 10px' }}>Recent Activity</p>
          <div style={{ background: DEEP_NAVY, borderRadius: 18, padding: events.length ? '4px 16px' : 20 }}>
            {events.length === 0 ? (
              <p style={{ fontSize: 13, color: 'rgba(240,244,248,0.5)', margin: 0, textAlign: 'center' }}>No recent activity yet.</p>
            ) : events.map((ev, i) => {
              const cfg = EVENT_ICON[ev.event_type] ?? { icon: ClipboardList, color: CYAN }
              const Icon = cfg.icon
              return (
                <div key={ev.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)' }}>
                  <Icon size={15} color={cfg.color} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: '#FFF', margin: 0 }}>
                      {ev.vehicle_label && <span style={{ fontWeight: 700 }}>{ev.vehicle_label}: </span>}
                      {ev.description}
                    </p>
                    <p style={{ fontSize: 11, color: 'rgba(240,244,248,0.45)', margin: '2px 0 0' }}>{relativeTime(ev.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

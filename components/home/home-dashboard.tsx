'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import { StatChip, type StatChipData } from '@/components/home/dashboard-primitives'
import { useDashboardData } from '@/components/home/use-dashboard-data'
import CapacityBar from '@/components/ui/capacity-bar'
import EmptyState from '@/components/ui/empty-state'
import LotMapPreview from '@/components/home/lot-map-preview'
import { PRIMARY as CYAN, AMBER, SUCCESS, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'
import {
  Car, AlertTriangle, X, ClipboardList, MapPinned, Receipt, Users,
  RefreshCw, FileText, DollarSign, Pencil, LogOut, ScanLine, Wrench, QrCode, Map,
} from 'lucide-react'

interface Props {
  onStartInspection: () => void
  onResumeInspection: (data: any) => void
  onViewReport: (data: any) => void
}

const EVENT_ICON: Record<string, { icon: typeof Car; color: string }> = {
  intake:                { icon: Car,        color: CYAN },
  spot_assigned:         { icon: MapPinned,  color: CYAN },
  spot_unassigned:       { icon: MapPinned,  color: CYAN },
  status_changed:        { icon: RefreshCw,  color: CYAN },
  inspection_completed:  { icon: ClipboardList, color: CYAN },
  invoice_generated:     { icon: FileText,   color: CYAN },
  invoice_sent:          { icon: FileText,   color: CYAN },
  invoice_paid:          { icon: DollarSign, color: CYAN },
  payment_logged:        { icon: DollarSign, color: CYAN },
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

const GO_TO = [
  { key: 'vehicles', icon: Car, label: 'Vehicles', route: '/vehicles' },
  { key: 'inspections', icon: ClipboardList, label: 'Inspections', route: '/inspections' },
  { key: 'lot', icon: MapPinned, label: 'Lot', route: '/lot' },
  { key: 'lot_billing', icon: Receipt, label: 'Lot Billing', route: '/lot-billing' },
  { key: 'customers', icon: Users, label: 'Customers', route: '/customers' },
]

export default function HomeDashboard({}: Props) {
  const { effectiveCompany } = useAuth()
  const router = useRouter()
  const companyId = effectiveCompany?.id ?? ''
  const [warningDismissed, setWarningDismissed] = useState(false)

  const {
    lotMapEnabled, lotBillingEnabled,
    vehiclesOnLot, lotOccupancy, dailyAccrual, overdueCount,
    customerCount, events, expiringCount, arrivalsToday, needsAttention, todaysQueue, lotSpots,
  } = useDashboardData(companyId)

  const statChips: StatChipData[] = [
    { label: 'On Lot', value: String(vehiclesOnLot) },
    { label: 'Arriving Today', value: String(arrivalsToday) },
    { label: 'Needs Attention', value: String(needsAttention), amber: true },
    ...(lotMapEnabled ? [{ label: 'Accruing/Day', value: `$${dailyAccrual.toFixed(0)}` }] : []),
    ...(lotBillingEnabled ? [{ label: 'Invoices Overdue', value: String(overdueCount), amber: true }] : []),
    { label: 'Customers', value: String(customerCount) },
  ]

  const queueItems = todaysQueue ? [
    ...todaysQueue.arrivingToday.map(v => ({ ...v, tag: 'Arriving', color: CYAN })),
    ...todaysQueue.readyForRelease.map(v => ({ ...v, tag: 'Ready', color: SUCCESS })),
    ...todaysQueue.needsStatusUpdate.map(v => ({ ...v, tag: 'Update', color: AMBER })),
  ] : []

  return (
    <div style={{ minHeight: '100vh', background: GRAY_100, paddingBottom: 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>
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

        {/* Quick actions — no inspection-first CTA */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={() => router.push('/vehicles/intake')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, border: 'none', cursor: 'pointer', background: CYAN, color: WHITE, fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
            <ScanLine size={16} />Check In
          </button>
          <button onClick={() => router.push('/vehicles')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, border: `1px solid ${GRAY_300}`, cursor: 'pointer', background: WHITE, color: GRAY_700, fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>
            <Wrench size={15} />Log Service
          </button>
          <button onClick={() => router.push('/vehicles')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, border: `1px solid ${GRAY_300}`, cursor: 'pointer', background: WHITE, color: GRAY_700, fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>
            <QrCode size={15} />Print QR
          </button>
          <button onClick={() => router.push('/lot')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 46, borderRadius: 14, border: `1px solid ${GRAY_300}`, cursor: 'pointer', background: WHITE, color: GRAY_700, fontWeight: 600, fontSize: 13, fontFamily: 'inherit' }}>
            <Map size={15} />Lot Map
          </button>
        </div>

        {/* Stat strip — horizontally scrollable */}
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', margin: '0 -16px', padding: '0 16px', scrollbarWidth: 'none' }}>
          {statChips.map(s => <StatChip key={s.label} {...s} />)}
        </div>

        {/* Capacity bar */}
        {lotMapEnabled && lotOccupancy && (
          <CapacityBar occupied={lotOccupancy.occupied} total={lotOccupancy.total} />
        )}

        {/* Lot Map preview */}
        {lotMapEnabled && <LotMapPreview spots={lotSpots} />}

        {/* Today's Queue */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: GRAY_500, margin: '0 0 10px' }}>Today's Queue</p>
          <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: queueItems.length ? '4px 16px' : 20 }}>
            {queueItems.length === 0 ? (
              <EmptyState icon={ClipboardList} title="Nothing needs attention today" />
            ) : queueItems.map((v, i) => (
              <button key={`${v.tag}-${v.id}`} onClick={() => router.push(`/inventory/${v.id}`)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '12px 0', borderTop: i === 0 ? 'none' : `1px solid ${GRAY_100}`,
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: GRAY_900, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin}
                  </p>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: v.color, background: `${v.color}1A`, borderRadius: 20, padding: '3px 9px', flexShrink: 0 }}>{v.tag}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Go To — compact list, no Dispatch entry */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: GRAY_500, margin: '0 0 10px' }}>Go To</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {GO_TO.map(g => (
              <button key={g.key} onClick={() => router.push(g.route)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px', borderRadius: 12, border: `1px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                <g.icon size={15} color={GRAY_500} />{g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: GRAY_500, margin: '0 0 10px' }}>Recent Activity</p>
          <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: events.length ? '4px 16px' : 20 }}>
            {events.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No recent activity yet" />
            ) : events.map((ev, i) => {
              const cfg = EVENT_ICON[ev.event_type] ?? { icon: ClipboardList, color: CYAN }
              const Icon = cfg.icon
              return (
                <div key={ev.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 0', borderTop: i === 0 ? 'none' : `1px solid ${GRAY_100}` }}>
                  <Icon size={15} color={cfg.color} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: GRAY_900, margin: 0 }}>
                      {ev.vehicle_label && <span style={{ fontWeight: 700 }}>{ev.vehicle_label}: </span>}
                      {ev.description}
                    </p>
                    <p style={{ fontSize: 11, color: GRAY_500, margin: '2px 0 0' }}>{relativeTime(ev.created_at)}</p>
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

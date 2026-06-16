'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { checkUsageState } from '@/lib/usage-actions'
import { useMediaQuery } from '@/hooks/use-media-query'
import StatusBadge, { ScoreBadge } from '@/components/ui/status-badge'
import { Car, ChevronRight, AlertTriangle, X, Loader2 } from 'lucide-react'

interface Props {
  onStartInspection: () => void
  onResumeInspection: (data: any) => void
  onViewReport: (data: any) => void
  onGoToQueue?: () => void
}

type VehicleStatus = 'pending_arrival' | 'on_lot' | 'released'

function daysOnLot(arrivedAt: string, releasedAt: string | null) {
  if (!arrivedAt) return null
  const end = releasedAt ? new Date(releasedAt) : new Date()
  return Math.max(0, Math.floor((end.getTime() - new Date(arrivedAt).getTime()) / 86400000))
}

function effectiveStatus(v: any): VehicleStatus | null {
  const s = v.lifecycle_status || v.status
  if (s === 'queued' || s === 'pending_arrival' || s === 'pending_inspection') return 'pending_arrival'
  if (s === 'on_lot' || s === 'inspected' || s === 'releasing') return 'on_lot'
  if (s === 'released') return 'released'
  return null
}

interface StatCardProps {
  value: number
  label: string
  selected: boolean
  accent?: string
  onClick: () => void
  loading?: boolean
}

function StatCard({ value, label, selected, accent, onClick, loading }: StatCardProps) {
  const bg = selected ? (accent ?? '#00B4D8') : '#FFFFFF'
  const textColor = selected ? '#FFFFFF' : '#0D1B2A'
  const subColor = selected ? 'rgba(255,255,255,0.7)' : '#94A3B8'
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, minWidth: 80, padding: 16, borderRadius: 18, cursor: 'pointer',
        background: bg,
        border: selected ? 'none' : '1px solid #E1E8F0',
        boxShadow: selected ? '0 4px 16px rgba(0,0,0,0.15)' : '0 1px 3px rgba(13,27,42,0.06)',
        textAlign: 'left', fontFamily: 'inherit',
        transition: 'background 150ms, box-shadow 150ms',
      } as React.CSSProperties}
    >
      {loading ? (
        <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 28, height: 8, borderRadius: 4, background: selected ? 'rgba(255,255,255,0.3)' : '#E1E8F0' }} />
        </div>
      ) : (
        <p style={{ fontSize: 30, fontWeight: 900, color: textColor, margin: 0, lineHeight: 1 }}>{value}</p>
      )}
      <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: subColor, margin: '8px 0 0' }}>
        {label}
      </p>
    </button>
  )
}

export default function HomeDashboard({ onStartInspection, onResumeInspection, onViewReport, onGoToQueue }: Props) {
  const { effectiveCompany, user, userProfile, isOwnerUser } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const router = useRouter()

  const [statsLoading, setStatsLoading] = useState(true)
  const [queuedCount, setQueuedCount] = useState(0)
  const [onLotCount, setOnLotCount] = useState(0)
  const [releasedCount, setReleasedCount] = useState(0)
  const [selectedStatus, setSelectedStatus] = useState<VehicleStatus>('on_lot')

  const [vehiclesLoading, setVehiclesLoading] = useState(false)
  const [vehicleList, setVehicleList] = useState<any[]>([])

  const [usageState, setUsageState] = useState<any>(null)
  const [expiringCount, setExpiringCount] = useState(0)
  const [warningDismissed, setWarningDismissed] = useState(false)

  const supabase = createClient()

  const name = userProfile?.full_name ?? user?.email ?? 'Inspector'
  const initials = name.charAt(0).toUpperCase()
  const usagePct = usageState ? Math.min(100, usageState.percentUsed) : 0
  const isUnlimited = (usageState?.included ?? 0) >= 9999
  const barColor = usagePct >= 100 ? '#EF4444' : usagePct >= 80 ? '#F59E0B' : '#00B4D8'
  const isOwnerFlag = isOwnerUser
  const planLabel = isOwnerFlag ? 'OWNER' : (usageState?.planName ?? 'STARTER').toUpperCase()

  function getGreeting() {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }

  const loadStats = useCallback(async () => {
    if (!effectiveCompany?.id) return
    setStatsLoading(true)
    try {
      const cutoff20h = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString()
      const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const [vehiclesRes, uRes, exRes] = await Promise.all([
        supabase
          .from('storage_vehicles')
          .select('id, lifecycle_status, status')
          .eq('company_id', effectiveCompany.id),
        checkUsageState(effectiveCompany.id),
        supabase
          .from('vehicle_inspections')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', effectiveCompany.id)
          .eq('status', 'in_progress')
          .is('locked_at', null)
          .gte('last_active_at', cutoff24h)
          .lte('last_active_at', cutoff20h),
      ])

      const all = vehiclesRes.data ?? []
      let q = 0, o = 0, r = 0
      for (const v of all) {
        const s = effectiveStatus(v)
        if (s === 'pending_arrival') q++
        else if (s === 'on_lot') o++
        else if (s === 'released') r++
      }
      setQueuedCount(q); setOnLotCount(o); setReleasedCount(r)
      setUsageState(uRes)
      setExpiringCount(exRes.error ? 0 : (exRes.count ?? 0))
    } finally {
      setStatsLoading(false)
    }
  }, [effectiveCompany?.id])

  const loadVehicles = useCallback(async (status: VehicleStatus) => {
    if (!effectiveCompany?.id) return
    setVehiclesLoading(true)
    try {
      // Get all vehicles and filter client-side for the selected status
      const { data } = await supabase
        .from('storage_vehicles')
        .select('id, vin, year, make, model, lifecycle_status, status, arrived_at, released_at')
        .eq('company_id', effectiveCompany.id)
        .order('arrived_at', { ascending: false })
      const filtered = (data ?? []).filter(v => effectiveStatus(v) === status)
      setVehicleList(filtered)
    } finally {
      setVehiclesLoading(false)
    }
  }, [effectiveCompany?.id])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadVehicles(selectedStatus) }, [selectedStatus, loadVehicles])

  const handleSelectStatus = (s: VehicleStatus) => {
    setSelectedStatus(s)
  }

  const STAT_COLORS: Record<VehicleStatus, string> = {
    pending_arrival: '#4A5568',
    on_lot: '#00B4D8',
    released: '#10B981',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', paddingBottom: isDesktop ? 0 : 'calc(64px + env(safe-area-inset-bottom, 0px))' }}>

      {/* Mobile header */}
      {!isDesktop && (
        <div style={{ background: '#0D1B2A', paddingTop: 48, paddingBottom: 20, paddingLeft: 16, paddingRight: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Car size={18} color="#FFFFFF" />
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#FFFFFF', margin: 0, lineHeight: 1.2 }}>Condition IQ</p>
                <p style={{ fontSize: 12, color: '#00B4D8', margin: 0 }}>{effectiveCompany?.name ?? '—'}</p>
              </div>
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: '#FFFFFF', fontWeight: 700, fontSize: 14 }}>{initials}</span>
            </div>
          </div>
        </div>
      )}

      {/* Expiry warning */}
      {expiringCount > 0 && !warningDismissed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: '#FEF3C7', borderBottom: '1px solid #F59E0B' }}>
          <AlertTriangle size={16} color="#F59E0B" style={{ flexShrink: 0 }} />
          <p style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#92400E', margin: 0 }}>
            {expiringCount} inspection{expiringCount !== 1 ? 's' : ''} will auto-complete in less than 4 hours.{' '}
            {onGoToQueue && (
              <button onClick={onGoToQueue} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#D97706', fontWeight: 600, fontSize: 13, textDecoration: 'underline' }}>
                Resume now →
              </button>
            )}
          </p>
          <button onClick={() => setWarningDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', flexShrink: 0 }}>
            <X size={16} color="#92400E" />
          </button>
        </div>
      )}

      <div style={{ padding: isDesktop ? 24 : '16px 16px 0', maxWidth: isDesktop ? 1200 : undefined, margin: isDesktop ? '0 auto' : undefined }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Desktop greeting */}
          {isDesktop && (
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>{getGreeting()}, {name.split(' ')[0]}</h2>
              <p style={{ fontSize: 14, color: '#94A3B8', marginTop: 4, marginBottom: 0 }}>Here's your inspection overview</p>
            </div>
          )}

          {/* Stat cards */}
          <div style={{ display: 'flex', gap: 10 }}>
            <StatCard
              value={queuedCount}
              label="Pending Arrival"
              selected={selectedStatus === 'pending_arrival'}
              accent={STAT_COLORS.pending_arrival}
              onClick={() => handleSelectStatus('pending_arrival')}
              loading={statsLoading}
            />
            <StatCard
              value={onLotCount}
              label="On Lot"
              selected={selectedStatus === 'on_lot'}
              accent={STAT_COLORS.on_lot}
              onClick={() => handleSelectStatus('on_lot')}
              loading={statsLoading}
            />
            <StatCard
              value={releasedCount}
              label="Released"
              selected={selectedStatus === 'released'}
              accent={STAT_COLORS.released}
              onClick={() => handleSelectStatus('released')}
              loading={statsLoading}
            />
          </div>

          {/* Usage bar */}
          {usageState && (
            <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 18, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8' }}>
                  Reports: {usageState.used} / {isUnlimited ? '∞' : usageState.included}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, ...(isOwnerFlag ? { background: '#0D1B2A', color: '#FFFFFF' } : { background: '#E0F7FC', color: '#0097B2' }) }}>
                  {planLabel}
                </span>
              </div>
              <div style={{ height: 8, background: '#F0F4F8', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: isUnlimited ? '8%' : `${usagePct}%`, background: barColor, borderRadius: 4, transition: 'width 500ms ease' }} />
              </div>
            </div>
          )}

          {/* CTA */}
          {isDesktop ? (
            <button onClick={onStartInspection}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#F4A62A', color: '#0D1B2A', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 16px rgba(244,166,42,0.25)', fontFamily: 'inherit' }}>
              <Car size={20} />Start New Inspection
            </button>
          ) : (
            <button onClick={onStartInspection}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderRadius: 18, border: 'none', cursor: 'pointer', background: '#00B4D8', boxShadow: '0 4px 16px rgba(0,180,216,0.35)', fontFamily: 'inherit' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Car size={22} color="#FFFFFF" />
                <span style={{ fontWeight: 700, fontSize: 16, color: '#FFFFFF' }}>Start New Inspection</span>
              </div>
              <ChevronRight size={20} color="rgba(255,255,255,0.6)" />
            </button>
          )}

          {/* Vehicle list — filtered by selected status */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', margin: 0 }}>
                {selectedStatus === 'pending_arrival' ? 'Pending Arrival Vehicles' : selectedStatus === 'on_lot' ? 'Vehicles On Lot' : 'Released Vehicles'}
              </p>
              {!vehiclesLoading && (
                <span style={{ fontSize: 11, fontWeight: 700, background: '#F0F4F8', color: '#4A5568', padding: '1px 7px', borderRadius: 8 }}>
                  {vehicleList.length}
                </span>
              )}
            </div>

            {vehiclesLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 18, padding: 16, display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 16, width: '55%', background: '#F0F4F8', borderRadius: 6, marginBottom: 8 }} />
                      <div style={{ height: 12, width: '35%', background: '#F5F8FA', borderRadius: 4 }} />
                    </div>
                    <div style={{ height: 20, width: 60, background: '#F0F4F8', borderRadius: 8 }} />
                  </div>
                ))}
              </div>
            ) : vehicleList.length === 0 ? (
              <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 18, padding: '40px 20px', textAlign: 'center' }}>
                <Car size={36} color="#E1E8F0" style={{ margin: '0 auto 10px', display: 'block' }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', margin: 0 }}>
                  No {selectedStatus === 'pending_arrival' ? 'pending arrival' : selectedStatus === 'on_lot' ? 'on-lot' : 'released'} vehicles
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {vehicleList.map(v => {
                  const title = [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle'
                  const days = daysOnLot(v.arrived_at, v.released_at)
                  return (
                    <button
                      key={v.id}
                      onClick={() => router.push(`/inventory/${v.id}`)}
                      style={{ width: '100%', background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 18, padding: 16, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
                        <p style={{ fontSize: 12, fontFamily: 'monospace', color: '#94A3B8', margin: 0 }}>{v.vin || '—'}</p>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                        {days !== null && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: days < 30 ? '#059669' : days < 60 ? '#D97706' : '#DC2626' }}>
                            {days}d
                          </span>
                        )}
                        <ChevronRight size={14} color="#CBD5E1" />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

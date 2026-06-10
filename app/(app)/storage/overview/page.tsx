'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { useRouter } from 'next/navigation'
import {
  getFMCOverviewStats, getFMCLocationSummaries, getVehiclesNeedingAttention,
} from '@/lib/storage-actions'
import { LayoutDashboard, MapPin, Car, AlertTriangle, ChevronRight } from 'lucide-react'

function Skeleton({ h = 40, r = 8 }: { h?: number; r?: number }) {
  return <div style={{ height: h, borderRadius: r, background: '#F0F4F8', animation: 'pulse 1.5s ease infinite' }} />
}

function scoreColor(score: number | null): { bg: string; color: string } {
  if (score === null) return { bg: '#F0F4F8', color: '#94A3B8' }
  if (score >= 90) return { bg: '#D1FAE5', color: '#065F46' }
  if (score >= 70) return { bg: '#E0F7FC', color: '#0097B2' }
  if (score >= 50) return { bg: '#FEF3C7', color: '#92400E' }
  return { bg: '#FEE2E2', color: '#991B1B' }
}

function daysOnLot(arrivedAt: string): number {
  return Math.floor((Date.now() - new Date(arrivedAt).getTime()) / 86400000)
}

function daysColor(days: number): string {
  if (days < 30) return '#10B981'
  if (days < 60) return '#F59E0B'
  return '#EF4444'
}

export default function StorageOverviewPage() {
  const { effectiveCompany } = useAuth()
  const router = useRouter()
  const isFMC = effectiveCompany?.account_type === 'fmc'
  const companyId = effectiveCompany?.id ?? ''

  const [stats, setStats] = useState<any>(null)
  const [locations, setLocations] = useState<any[]>([])
  const [needingAttention, setNeedingAttention] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isFMC) { router.replace('/storage/inventory'); return }
  }, [isFMC])

  const load = useCallback(async () => {
    if (!companyId || !isFMC) return
    setLoading(true)
    try {
      const [s, l, n] = await Promise.all([
        getFMCOverviewStats(companyId),
        getFMCLocationSummaries(companyId),
        getVehiclesNeedingAttention(companyId),
      ])
      setStats(s); setLocations(l); setNeedingAttention(n)
    } finally { setLoading(false) }
  }, [companyId, isFMC])

  useEffect(() => { load() }, [load])

  const statCards = stats ? [
    { label: 'Active Locations', value: stats.totalLocations, icon: <MapPin size={20} color="#00B4D8" />, bg: '#E0F7FC', accent: '#00B4D8' },
    { label: 'Total on Lot', value: stats.totalOnLot, icon: <Car size={20} color="#F4A62A" />, bg: '#FEF3C7', accent: '#F4A62A' },
    { label: 'Inspected This Month', value: stats.inspectedThisMonth, icon: <LayoutDashboard size={20} color="#10B981" />, bg: '#D1FAE5', accent: '#10B981' },
    { label: 'Avg Condition Score', value: stats.avgScore ?? '—', icon: <div style={{ width: 20, height: 20, borderRadius: 10, background: scoreColor(stats.avgScore).bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 9, fontWeight: 900, color: scoreColor(stats.avgScore).color }}>S</span></div>, bg: scoreColor(stats.avgScore).bg, accent: scoreColor(stats.avgScore).color },
  ] : []

  return (
    <div style={{ padding: 24, paddingBottom: 40, maxWidth: 1400 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0D1B2A', margin: 0 }}>FMC Overview</h1>
        <p style={{ fontSize: 14, color: '#94A3B8', margin: '4px 0 0' }}>Fleet Management Company — all locations at a glance</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
        {loading ? Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ flex: '1 1 180px', height: 100, borderRadius: 16, background: '#E1E8F0', animation: 'pulse 1.5s ease infinite' }} />
        )) : statCards.map(c => (
          <div key={c.label} style={{ flex: '1 1 180px', background: '#fff', border: `1px solid #E1E8F0`, borderLeft: `4px solid ${c.accent}`, borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 14, boxShadow: '0 1px 3px rgba(13,27,42,0.06)' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {c.icon}
            </div>
            <div>
              <p style={{ fontSize: 28, fontWeight: 900, color: '#0D1B2A', margin: 0, lineHeight: 1 }}>{c.value}</p>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '6px 0 0' }}>{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Location cards grid */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Locations</h2>
          <button onClick={() => router.push('/storage/locations')}
            style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1.5px solid #E1E8F0', background: '#fff', color: '#00B4D8', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Manage Locations
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h={160} r={16} />)}
          </div>
        ) : locations.length === 0 ? (
          <div style={{ background: '#fff', border: '1.5px dashed #E1E8F0', borderRadius: 16, padding: 40, textAlign: 'center' }}>
            <MapPin size={32} color="#E1E8F0" style={{ margin: '0 auto 10px', display: 'block' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: '#94A3B8', margin: 0 }}>No locations yet</p>
            <button onClick={() => router.push('/storage/locations')}
              style={{ marginTop: 12, height: 36, padding: '0 16px', borderRadius: 8, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Add First Location
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
            {locations.map(loc => {
              const sc = scoreColor(loc.avgScore)
              const inspPct = loc.total > 0 ? (loc.inspected / loc.total) * 100 : 0
              return (
                <div key={loc.id} style={{ background: '#fff', border: '1px solid #E1E8F0', borderRadius: 16, padding: 20, boxShadow: '0 1px 3px rgba(13,27,42,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>{loc.name}</p>
                      {(loc.city || loc.state) && (
                        <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>
                          {[loc.city, loc.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    {loc.avgScore !== null && (
                      <div style={{ padding: '4px 10px', borderRadius: 20, background: sc.bg }}>
                        <span style={{ fontSize: 13, fontWeight: 900, color: sc.color }}>{loc.avgScore}</span>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#4A5568' }}>{loc.inspected} / {loc.total} inspected</span>
                      {loc.uninspected > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: '#FEF3C7', color: '#92400E' }}>{loc.uninspected} needs insp.</span>
                      )}
                    </div>
                    <div style={{ height: 6, background: '#F0F4F8', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${inspPct}%`, background: inspPct >= 80 ? '#10B981' : inspPct >= 50 ? '#00B4D8' : '#F59E0B', borderRadius: 3, transition: 'width 600ms ease' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ padding: '4px 10px', borderRadius: 8, background: '#F0F4F8', textAlign: 'center' }}>
                      <p style={{ fontSize: 16, fontWeight: 900, color: '#0D1B2A', margin: 0 }}>{loc.total}</p>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total</p>
                    </div>
                    <button onClick={() => router.push(`/storage/inventory?location=${loc.id}`)}
                      style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1.5px solid #E1E8F0', background: '#fff', color: '#00B4D8', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                      View <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Vehicles needing attention */}
      {(loading || needingAttention.length > 0) && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Vehicles Needing Attention</h2>
              <p style={{ fontSize: 13, color: '#94A3B8', margin: '2px 0 0' }}>On lot 7+ days with no inspection</p>
            </div>
            {!loading && (
              <span style={{ padding: '4px 12px', borderRadius: 12, background: '#FEF3C7', color: '#92400E', fontSize: 12, fontWeight: 700 }}>
                {needingAttention.length} vehicle{needingAttention.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div style={{ background: '#fff', border: '1px solid #E1E8F0', borderRadius: 16, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#FEF3C7' }}>
                  {['VIN', 'Make / Model', 'Year', 'Location', 'Days on Lot', 'Action'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} style={{ padding: '12px 14px' }}><Skeleton h={18} r={4} /></td>
                    ))}
                  </tr>
                )) : needingAttention.map(v => {
                  const days = daysOnLot(v.arrived_at)
                  return (
                    <tr key={v.id} style={{ borderTop: '1px solid #FEF3C7' }}>
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#0D1B2A' }}>{v.vin}</td>
                      <td style={{ padding: '12px 14px', color: '#4A5568' }}>{[v.make, v.model].filter(Boolean).join(' ') || '—'}</td>
                      <td style={{ padding: '12px 14px', color: '#4A5568' }}>{v.year || '—'}</td>
                      <td style={{ padding: '12px 14px', color: '#4A5568' }}>
                        {v.location?.name || <span style={{ color: '#CBD5E1' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontWeight: 700, color: daysColor(days) }}>{days}d</span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <button onClick={() => router.push('/storage/inventory')}
                          style={{ height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid #E1E8F0', background: '#fff', color: '#00B4D8', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={11} /> Inspect
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

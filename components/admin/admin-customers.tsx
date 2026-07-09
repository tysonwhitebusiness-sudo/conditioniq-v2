'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAllCompanies } from '@/lib/admin-actions'
import { getCompaniesWithPendingRequests } from '@/lib/billing-actions'
import { Search, ChevronRight, MessageSquare } from 'lucide-react'

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  demo:           { bg: '#F0F4F8', color: '#94A3B8' },
  starter:        { bg: '#E0F7FC', color: '#0097B2' },
  growth:         { bg: '#D1FAE5', color: '#065F46' },
  pro:            { bg: '#EDE9FE', color: '#5B21B6' },
  enterprise:     { bg: '#FEF3C7', color: '#92400E' },
  legacy_starter: { bg: '#FFF0E8', color: '#C2410C' },
}

const TIERS = ['demo', 'legacy_starter', 'starter', 'growth', 'pro', 'enterprise']

export default function AdminCustomers() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Record<string, unknown>[]>([])
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [pendingCompanyIds, setPendingCompanyIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    Promise.all([
      getAllCompanies(),
      getCompaniesWithPendingRequests(),
    ]).then(([data, pendingIds]) => {
      setCompanies(data as Record<string, unknown>[])
      setPendingCompanyIds(new Set(pendingIds))
      setLoading(false)
    })
  }, [])

  const filtered = companies.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !q || (c.name as string)?.toLowerCase().includes(q)
    const matchTier = !tierFilter || c.subscription_tier === tierFilter
    return matchSearch && matchTier
  })

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#F1F5F9', margin: 0 }}>Customers ({companies.length})</h1>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..."
            style={{ height: 38, paddingLeft: 32, paddingRight: 12, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: '#1B2D40', color: '#F1F5F9', width: 220 }}
          />
        </div>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          style={{ height: 38, padding: '0 10px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 13, background: '#1B2D40', color: '#F1F5F9', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
          <option value="">All Plans</option>
          {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Company list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 72, background: 'rgba(255,255,255,0.06)', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <Search size={32} color="#94A3B8" style={{ display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#F1F5F9', margin: '0 0 4px' }}>No customers found</p>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>Try adjusting your search or filter</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(company => {
            const tier = (company.subscription_tier as string) ?? 'starter'
            const pc = PLAN_COLORS[tier] ?? PLAN_COLORS.starter
            const used = (company.reports_used as number) ?? 0
            const inc = (company.reports_included as number) ?? 1
            const pct = Math.min(100, (used / Math.max(inc, 1)) * 100)
            const barColor = pct >= 100 ? '#EF4444' : pct >= 80 ? '#F4A62A' : '#00B4D8'
            const ageDays = Math.floor((Date.now() - new Date(company.created_at as string).getTime()) / 86400000)
            const hasPending = pendingCompanyIds.has(company.id as string)
            return (
              <div key={company.id as string}
                onClick={() => router.push(`/admin/customers/${company.id as string}`)}
                style={{ background: '#1B2D40', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer', transition: 'box-shadow 150ms' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#F1F5F9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.name as string}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: pc.bg, color: pc.color, flexShrink: 0 }}>{tier.toUpperCase()}</span>
                    {(company.legacy_pricing as boolean) && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: '#FFF0E8', color: '#C2410C', flexShrink: 0 }}>LEGACY</span>
                    )}
                    {hasPending && (
                      <span title="Pending plan change request" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: '#FEF3C7', color: '#92400E', flexShrink: 0 }}>
                        <MessageSquare size={9} />PLAN REQ
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#94A3B8', flexShrink: 0 }}>{ageDays}d old</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, maxWidth: 200 }}>
                      <div style={{ height: 4, width: `${pct}%`, background: barColor, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#94A3B8' }}>{used}/{inc} reports</span>
                  </div>
                </div>
                <ChevronRight size={16} color="#94A3B8" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

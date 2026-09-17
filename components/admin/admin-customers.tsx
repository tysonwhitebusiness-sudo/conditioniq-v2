'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getAllCompanies } from '@/lib/admin-actions'
import { getCompaniesWithPendingRequests } from '@/lib/billing-actions'
import { Search, ChevronRight, MessageSquare } from 'lucide-react'
import { PLANS } from '@/lib/pricing'
import { WHITE, GRAY_900, GRAY_500, GRAY_300 } from '@/lib/design-tokens'

const PLAN_COLORS: Record<string, { bg: string; color: string }> = {
  demo:       { bg: '#F0F4F8', color: GRAY_500 },
  pay_per_use: { bg: '#DCFCE7', color: '#166534' },
  operations: { bg: '#E0F7FC', color: '#0097B2' },
  pro:        { bg: '#EDE9FE', color: '#5B21B6' },
  enterprise: { bg: '#FEF3C7', color: '#92400E' },
}

const TIERS = ['demo', 'pay_per_use', 'operations', 'pro', 'enterprise']

type CompanyUsage = { planKey: string; reportsUsed: number; reportsIncluded: number | null; hasPriceOverride: boolean }

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
    const matchTier = !tierFilter || (c.usage as CompanyUsage | undefined)?.planKey === tierFilter
    return matchSearch && matchTier
  })

  return (
    <div className="adm-page" style={{ maxWidth: 1200 }}>
      {/* Header */}
      <div className="adm-wrap" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: GRAY_900, margin: 0 }}>Customers ({companies.length})</h1>
        <div style={{ flex: 1 }} />
        <div className="adm-grow-mobile" style={{ position: 'relative' }}>
          <Search size={14} color={GRAY_500} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..."
            style={{ height: 38, paddingLeft: 32, paddingRight: 12, border: `1px solid ${GRAY_300}`, borderRadius: 10, fontSize: 13, outline: 'none', fontFamily: 'inherit', background: WHITE, color: GRAY_900, width: 220, maxWidth: '100%', boxSizing: 'border-box' }}
            className="adm-grow-mobile"
          />
        </div>
        <select value={tierFilter} onChange={e => setTierFilter(e.target.value)}
          style={{ height: 38, padding: '0 10px', border: `1px solid ${GRAY_300}`, borderRadius: 10, fontSize: 13, background: WHITE, color: GRAY_900, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
          <option value="">All Plans</option>
          {TIERS.map(t => <option key={t} value={t}>{PLANS[t as keyof typeof PLANS]?.name ?? t}</option>)}
        </select>
      </div>

      {/* Company list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ height: 72, background: GRAY_300, borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <Search size={32} color={GRAY_500} style={{ display: 'block', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: GRAY_900, margin: '0 0 4px' }}>No customers found</p>
          <p style={{ fontSize: 14, color: GRAY_500, margin: 0 }}>Try adjusting your search or filter</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(company => {
            const usage = company.usage as CompanyUsage
            const tier = usage.planKey
            const pc = PLAN_COLORS[tier] ?? PLAN_COLORS.operations
            const used = usage.reportsUsed
            const inc = usage.reportsIncluded
            const pct = inc === null ? 0 : Math.min(100, (used / Math.max(inc, 1)) * 100)
            const barColor = pct >= 100 ? '#EF4444' : pct >= 80 ? '#F4A62A' : '#00B4D8'
            const ageDays = Math.floor((Date.now() - new Date(company.created_at as string).getTime()) / 86400000)
            const hasPending = pendingCompanyIds.has(company.id as string)
            return (
              <div key={company.id as string}
                onClick={() => router.push(`/admin/customers/${company.id as string}`)}
                style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', transition: 'box-shadow 150ms' }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.10)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: GRAY_900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{company.name as string}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: pc.bg, color: pc.color, flexShrink: 0 }}>{tier.toUpperCase()}</span>
                    {usage.hasPriceOverride && (
                      <span title="Grandfathered: price held below the plan's list price" style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: '#FFF0E8', color: '#C2410C', flexShrink: 0 }}>HELD PRICE</span>
                    )}
                    {hasPending && (
                      <span title="Pending plan change request" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: '#FEF3C7', color: '#92400E', flexShrink: 0 }}>
                        <MessageSquare size={9} />PLAN REQ
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: GRAY_500, flexShrink: 0 }}>{ageDays}d old</span>
                  </div>
                  {tier === 'pay_per_use' ? (
                    // No allowance to fill: Pay Per Use shows what this month is running at.
                    <span style={{ fontSize: 12, color: GRAY_500 }}>
                      {used} {used === 1 ? 'report' : 'reports'} this month · ${(used * PLANS.pay_per_use.additionalReportCost).toFixed(2)}
                    </span>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 4, background: GRAY_300, borderRadius: 2, maxWidth: 200 }}>
                        <div style={{ height: 4, width: `${pct}%`, background: barColor, borderRadius: 2 }} />
                      </div>
                      <span style={{ fontSize: 12, color: GRAY_500 }}>{used}/{inc === null ? '∞' : inc} reports</span>
                    </div>
                  )}
                </div>
                <ChevronRight size={16} color={GRAY_500} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

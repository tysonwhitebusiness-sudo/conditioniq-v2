'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/auth-context'
import { createClient } from '@/lib/supabase/client'
import { getPlan, calcEstimatedMonthly, calcOverageCost } from '@/lib/pricing'
import { checkUsageState, createInspectionRequest } from '@/lib/usage-actions'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, Download, ExternalLink, CreditCard, ArrowUp } from 'lucide-react'
import type { UsageState } from '@/lib/usage-actions'

export default function BillingDashboard() {
  const { effectiveCompany, isOwnerUser } = useAuth()
  const [usageState, setUsageState] = useState<UsageState | null>(null)
  const [billedInspections, setBilledInspections] = useState<any[]>([])
  const [sparklineData, setSparklineData] = useState<any[]>([])
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!effectiveCompany) return
    const load = async () => {
      setLoading(true)
      try {
        const [uState, inspRes] = await Promise.all([
          checkUsageState(effectiveCompany.id),
          supabase.from('vehicle_inspections')
            .select('id, vin, make, model, year, created_at')
            .eq('company_id', effectiveCompany.id)
            .eq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(100),
        ])
        setUsageState(uState)
        setBilledInspections(inspRes.data ?? [])

        // Build 14-day sparkline
        const now = new Date()
        const days: any[] = []
        for (let i = 13; i >= 0; i--) {
          const d = new Date(now)
          d.setDate(now.getDate() - i)
          const dateStr = d.toISOString().split('T')[0]
          const count = (inspRes.data ?? []).filter(ins => ins.created_at?.startsWith(dateStr)).length
          days.push({ date: dateStr.slice(5), count })
        }
        setSparklineData(days)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [effectiveCompany])

  if (isOwnerUser) {
    return (
      <div className="p-6 text-center">
        <div className="text-6xl mb-4">∞</div>
        <h2 className="text-xl font-bold text-gray-900">Unlimited Access</h2>
        <p className="text-gray-500 mt-2">Owner accounts have no usage limits.</p>
      </div>
    )
  }

  if (loading || !effectiveCompany || !usageState) {
    return <div className="p-6 text-center text-gray-400">Loading billing...</div>
  }

  const plan = getPlan(effectiveCompany.subscription_tier)
  const estimated = calcEstimatedMonthly(plan, usageState.used)
  const overageCost = calcOverageCost(plan, usageState.used)
  const cycleStart = new Date(effectiveCompany.billing_cycle_start)
  const nextCycle = new Date(cycleStart)
  nextCycle.setMonth(nextCycle.getMonth() + 1)

  return (
    <div className="max-w-2xl mx-auto space-y-4 p-4">
      <h1 className="text-xl font-bold text-gray-900">Billing & Usage</h1>

      {/* Current Plan */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Current Plan</p>
            <h2 className="text-lg font-bold text-gray-900">{plan.name}</h2>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#1e3a5f]">${plan.monthlyCost}<span className="text-sm font-normal text-gray-400">/mo</span></p>
          </div>
        </div>
        <p className="text-sm text-gray-500">{plan.reportsIncluded} reports included · ${plan.additionalReportCost.toFixed(2)}/overage report</p>
        <button
          onClick={() => setShowUpgradeModal(true)}
          className="flex items-center gap-2 text-sm text-[#dc5010] font-medium"
        >
          <TrendingUp size={16} /> Explore Plans
        </button>
      </div>

      {/* Usage Meter */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200 space-y-3">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Usage This Cycle</p>
        <div className="flex items-end justify-between">
          <p className="text-3xl font-bold text-gray-900">{usageState.used}</p>
          <p className="text-sm text-gray-500">of {usageState.included} included</p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${usageState.percentUsed >= 100 ? 'bg-orange-500' : usageState.percentUsed >= 80 ? 'bg-yellow-400' : 'bg-[#1e3a5f]'}`}
            style={{ width: `${Math.min(100, usageState.percentUsed)}%` }}
          />
        </div>
        {usageState.isOverage && (
          <p className="text-sm text-orange-600 font-medium">
            {usageState.used - usageState.included} overage report{usageState.used - usageState.included !== 1 ? 's' : ''} billed at ${plan.additionalReportCost.toFixed(2)}/each
          </p>
        )}
      </div>

      {/* Estimated Invoice */}
      <div className="bg-white rounded-2xl p-5 border border-gray-200 space-y-3">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Estimated Next Invoice</p>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Base ({plan.name})</span>
            <span>${plan.monthlyCost.toFixed(2)}</span>
          </div>
          {overageCost > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Overage ({usageState.used - usageState.included} reports)</span>
              <span className="text-orange-600">${overageCost.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-gray-100 pt-2 flex justify-between font-semibold">
            <span>Total</span>
            <span>${estimated.toFixed(2)}</span>
          </div>
        </div>
        <p className="text-xs text-gray-400">Next billing date: {nextCycle.toLocaleDateString()}</p>
      </div>

      {/* Usage Sparkline */}
      {sparklineData.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-gray-200">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">Reports — Last 14 Days</p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={sparklineData} barCategoryGap={2}>
              <Bar dataKey="count" fill="#1e3a5f" radius={[2, 2, 0, 0]} />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v: any) => [`${v} reports`, '']} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Usage History */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900">Usage History</p>
        </div>
        {billedInspections.slice(0, 20).map(ins => (
          <div key={ins.id} className="flex items-center justify-between p-4 border-b border-gray-50 last:border-0">
            <div>
              <p className="text-sm font-medium font-mono">{ins.vin}</p>
              <p className="text-xs text-gray-400">{new Date(ins.created_at).toLocaleDateString()}</p>
            </div>
            <span className="text-xs text-gray-400">{[ins.year, ins.make, ins.model].filter(Boolean).join(' ')}</span>
          </div>
        ))}
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <UpgradeModal onClose={() => setShowUpgradeModal(false)} currentPlan={plan.key} companyId={effectiveCompany.id} />
      )}
    </div>
  )
}

function UpgradeModal({ onClose, currentPlan, companyId }: { onClose: () => void; currentPlan: string; companyId: string }) {
  const plans = [
    { key: 'starter', name: 'Starter', price: 99, reports: 30, overage: 4.0, features: ['30 reports/mo', '$4.00 overage', 'Mobile app', 'PDF reports'] },
    { key: 'growth', name: 'Growth', price: 199, reports: 75, overage: 3.25, features: ['75 reports/mo', '$3.25 overage', 'Team access', 'Priority support'] },
    { key: 'pro', name: 'Pro', price: 399, reports: 200, overage: 2.75, features: ['200 reports/mo', '$2.75 overage', 'Advanced analytics', 'API access'] },
    { key: 'enterprise', name: 'Enterprise', price: 0, reports: 9999, overage: 2.25, features: ['Unlimited reports', '$2.25 overage', 'Dedicated support', 'Custom integrations'] },
  ]

  const handleRequest = async (targetPlan: string) => {
    const supabase = createClient()
    await supabase.from('contact_requests').insert({
      message: `Upgrade request: ${currentPlan} → ${targetPlan}`,
      company: companyId,
    })
    alert('Upgrade request submitted! We\'ll be in touch shortly.')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center">
      <div className="bg-white rounded-t-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Upgrade Plan</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="space-y-3">
          {plans.map(p => (
            <div key={p.key} className={`border-2 rounded-2xl p-4 ${p.key === currentPlan ? 'border-[#1e3a5f]' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="font-bold text-gray-900">{p.name}</span>
                  {p.key === currentPlan && <span className="ml-2 text-xs bg-[#1e3a5f] text-white px-2 py-0.5 rounded-full">Current</span>}
                </div>
                <span className="font-bold text-[#1e3a5f]">{p.price > 0 ? `$${p.price}/mo` : 'Custom'}</span>
              </div>
              <ul className="space-y-1 mb-3">
                {p.features.map(f => <li key={f} className="text-xs text-gray-500 flex gap-2"><span className="text-green-500">✓</span>{f}</li>)}
              </ul>
              {p.key !== currentPlan && (
                <button
                  onClick={() => handleRequest(p.key)}
                  className="w-full py-2 bg-[#1e3a5f] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2"
                >
                  <ArrowUp size={14} /> Request Upgrade
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

'use client'

import { AlertTriangle, TrendingUp } from 'lucide-react'
import type { UsageState } from '@/lib/usage-actions'

interface Props {
  usageState: UsageState
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

export default function UsageConfirmationModal({ usageState, onConfirm, onCancel, loading }: Props) {
  const isOverage = usageState.isOverage

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-5 shadow-xl">
        <div className="flex items-center gap-3">
          {isOverage ? (
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <AlertTriangle size={20} className="text-orange-600" />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <TrendingUp size={20} className="text-blue-600" />
            </div>
          )}
          <h2 className="text-lg font-semibold text-gray-900">
            {isOverage ? 'Overage Report' : 'Start Inspection'}
          </h2>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Reports used</span>
            <span className="font-medium">{usageState.used} / {usageState.included}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${usageState.percentUsed >= 100 ? 'bg-orange-500' : usageState.percentUsed >= 80 ? 'bg-yellow-500' : 'bg-blue-500'}`}
              style={{ width: `${Math.min(100, usageState.percentUsed)}%` }}
            />
          </div>
          <p className="text-sm text-gray-600">
            {isOverage
              ? `All ${usageState.included} included reports used. This report will be billed at $${usageState.overageRate.toFixed(2)}/report.`
              : `This will use 1 of your ${usageState.remaining} remaining report${usageState.remaining !== 1 ? 's' : ''}.`}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-3 rounded-xl text-white font-medium disabled:opacity-50 ${isOverage ? 'bg-orange-600 hover:bg-orange-700' : 'bg-[#1e3a5f] hover:bg-[#162d4a]'}`}
          >
            {loading ? 'Starting...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

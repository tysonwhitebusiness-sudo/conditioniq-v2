'use client'

import { useState } from 'react'
import { calculateVehicleScore, getGrade } from '@/lib/vehicle-score'

interface Props {
  inspection: Record<string, unknown>
}

export default function SharedInspectionView({ inspection }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'exterior' | 'interior' | 'mechanical' | 'docs'>('overview')

  const data = inspection as {
    id: string
    vin: string
    year: number
    make: string
    model: string
    odometer: number
    asset_id?: string
    location?: string
    completed_at?: string
    overall_condition?: string
    exterior_condition?: string
    interior_condition?: string
    engine_condition?: string
    documentation?: Record<string, unknown>
    function_checks?: Record<string, unknown>
    tires?: Record<string, unknown>
    damage_items?: unknown[]
    fluid_levels?: Record<string, unknown>
    photos?: Record<string, string>
    inspector_name?: string
    company_name?: string
  }

  const scoreData = {
    exteriorCondition: data.exterior_condition as string || 'good',
    interiorCondition: data.interior_condition as string || 'good',
    engineCondition: data.engine_condition as string || 'good',
    functionChecks: (data.function_checks || {}) as Record<string, string>,
    documentation: (data.documentation || {}) as Record<string, boolean>,
    odometer: data.odometer || 0,
    tires: (data.tires || {}) as Record<string, unknown>,
    damageItems: (data.damage_items || []) as unknown[],
    fluidLevels: (data.fluid_levels || {}) as Record<string, string>,
  }

  const score = calculateVehicleScore(scoreData)
  const grade = getGrade(score.breakdown.total)

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'exterior', label: 'Exterior' },
    { id: 'interior', label: 'Interior' },
    { id: 'mechanical', label: 'Mechanical' },
    { id: 'docs', label: 'Documents' },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1e3a5f] text-white">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-blue-200 text-sm font-medium uppercase tracking-wide">Condition Report</p>
              <h1 className="text-xl font-bold mt-1">
                {data.year} {data.make} {data.model}
              </h1>
              <p className="text-blue-200 text-sm mt-0.5">VIN: {data.vin}</p>
            </div>
            <div className="text-center">
              <div className="text-4xl font-black" style={{ color: grade.color }}>
                {grade.letter}
              </div>
              <div className="text-blue-200 text-sm">{score.breakdown.total}/100</div>
            </div>
          </div>
          {data.company_name && (
            <p className="text-blue-300 text-xs mt-3">Inspected by {data.company_name}</p>
          )}
          {data.completed_at && (
            <p className="text-blue-300 text-xs">
              {new Date(data.completed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      </div>

      {/* Tab nav */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 flex overflow-x-auto no-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#1e3a5f] text-[#1e3a5f]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {activeTab === 'overview' && (
          <>
            {/* Score breakdown */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Score Breakdown</h2>
              <div className="space-y-3">
                {[
                  { label: 'Exterior', value: score.breakdown.exterior, max: 25 },
                  { label: 'Interior', value: score.breakdown.interior, max: 20 },
                  { label: 'Mechanical', value: score.breakdown.mechanical, max: 30 },
                  { label: 'Documentation', value: score.breakdown.documentation, max: 15 },
                  { label: 'Mileage', value: score.breakdown.mileage, max: 10 },
                ].map(({ label, value, max }) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">{label}</span>
                      <span className="font-medium text-gray-900">{value}/{max}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1e3a5f] rounded-full transition-all"
                        style={{ width: `${(value / max) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Vehicle details */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Vehicle Details</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: 'VIN', value: data.vin },
                  { label: 'Year', value: data.year },
                  { label: 'Make', value: data.make },
                  { label: 'Model', value: data.model },
                  { label: 'Odometer', value: data.odometer ? `${data.odometer.toLocaleString()} mi` : '—' },
                  { label: 'Asset ID', value: data.asset_id || '—' },
                  { label: 'Location', value: data.location || '—' },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-gray-500">{label}</p>
                    <p className="font-medium text-gray-900">{String(value)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {score.recommendations.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 mb-3">Recommendations</h2>
                <ul className="space-y-2">
                  {score.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="text-orange-500 mt-0.5">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {activeTab === 'exterior' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Exterior Condition</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Overall</span>
                <span className="font-medium capitalize">{data.exterior_condition || '—'}</span>
              </div>
            </div>
            {(data.damage_items as unknown[])?.filter((d: unknown) => (d as { location_type: string }).location_type === 'exterior').length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Damage Items</h3>
                <div className="space-y-2">
                  {(data.damage_items as Array<{ location_type: string; damage_type: string; location: string; severity: string; description?: string }>)
                    .filter(d => d.location_type === 'exterior')
                    .map((item, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg px-3 py-2">
                        <p className="font-medium capitalize">{item.damage_type} — {item.location}</p>
                        <p className="text-gray-500 capitalize">Severity: {item.severity}</p>
                        {item.description && <p className="text-gray-600 mt-0.5">{item.description}</p>}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'interior' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Interior Condition</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Overall</span>
                <span className="font-medium capitalize">{data.interior_condition || '—'}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'mechanical' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Engine & Mechanical</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Engine condition</span>
                  <span className="font-medium capitalize">{data.engine_condition || '—'}</span>
                </div>
              </div>
            </div>
            {data.function_checks && Object.keys(data.function_checks).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 mb-4">Function Checks</h2>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(data.function_checks as Record<string, string>).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className={`font-medium text-xs px-2 py-0.5 rounded-full ${
                        val === 'pass' ? 'bg-green-100 text-green-700' :
                        val === 'fail' ? 'bg-red-100 text-red-700' :
                        'bg-gray-200 text-gray-600'
                      }`}>
                        {val === 'not_tested' ? 'N/T' : val}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Documentation</h2>
            {data.documentation ? (
              <div className="space-y-2 text-sm">
                {Object.entries(data.documentation as Record<string, boolean>).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${val ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {val ? 'Present' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No documentation data available.</p>
            )}
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-8 text-center">
        <p className="text-xs text-gray-400">
          This report was generated by Condition IQ. For questions, contact the inspecting company.
        </p>
      </div>
    </div>
  )
}

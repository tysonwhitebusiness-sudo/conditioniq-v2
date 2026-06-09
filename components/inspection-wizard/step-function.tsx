'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import VoiceInput from '@/components/ui/voice-input'

type TestStatus = 'pass' | 'fail' | 'not_tested'

const GROUPS = [
  {
    name: 'Starting & Drivetrain',
    tests: ['engineStarts', 'shiftsToD', 'shiftsToR', 'parkingBrake'],
    labels: { engineStarts: 'Engine Starts', shiftsToD: 'Shifts to Drive', shiftsToR: 'Shifts to Reverse', parkingBrake: 'Parking Brake' },
  },
  {
    name: 'Lights',
    tests: ['headlights', 'taillights', 'turnSignals', 'brakeLights', 'hazardLights'],
    labels: { headlights: 'Headlights', taillights: 'Taillights', turnSignals: 'Turn Signals', brakeLights: 'Brake Lights', hazardLights: 'Hazard Lights' },
  },
  {
    name: 'Controls',
    tests: ['horn', 'wipers', 'washerFluid', 'ac', 'heater', 'radio'],
    labels: { horn: 'Horn', wipers: 'Wipers', washerFluid: 'Washer Fluid', ac: 'A/C', heater: 'Heater', radio: 'Radio' },
  },
  {
    name: 'Windows & Locks',
    tests: ['powerWindows', 'powerLocks', 'mirrors'],
    labels: { powerWindows: 'Power Windows', powerLocks: 'Power Locks', mirrors: 'Mirrors' },
  },
]

const ALL_TESTS = GROUPS.flatMap(g => g.tests)

function initTests(existing: Record<string, TestStatus>): Record<string, TestStatus> {
  const out: Record<string, TestStatus> = {}
  ALL_TESTS.forEach(t => { out[t] = existing[t] ?? 'pass' })
  return out
}

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepFunction({ data, onChange, onNext, onBack }: Props) {
  const tests: Record<string, TestStatus> = data.tests ? data.tests : initTests({})
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const setTest = (key: string, status: TestStatus) => {
    const updated = { ...tests, [key]: status }
    onChange({ ...data, tests: updated })
  }

  const setBulk = (groupTests: string[], status: TestStatus) => {
    const updated = { ...tests }
    groupTests.forEach(k => { updated[k] = status })
    onChange({ ...data, tests: updated })
  }

  const isGroupFilled = (groupTests: string[]) => groupTests.every(k => tests[k] !== undefined)

  const toggle = (name: string) => setCollapsed(c => ({ ...c, [name]: !c[name] }))

  return (
    <div className="space-y-4 pb-24">
      {GROUPS.map(group => {
        const allFilled = isGroupFilled(group.tests)
        const isCollapsed = collapsed[group.name] && allFilled

        return (
          <div key={group.name} className="border border-gray-200 rounded-2xl overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(group.name)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100"
            >
              <span className="font-semibold text-gray-800">{group.name}</span>
              <div className="flex items-center gap-2">
                {allFilled && <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Done</span>}
                {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
              </div>
            </button>

            {!isCollapsed && (
              <div className="p-4 space-y-3">
                <div className="flex gap-2 mb-3">
                  {(['pass', 'fail', 'not_tested'] as const).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setBulk(group.tests, s)}
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        s === 'pass' ? 'bg-green-50 text-green-700 hover:bg-green-100' :
                        s === 'fail' ? 'bg-red-50 text-red-700 hover:bg-red-100' :
                        'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      All {s === 'not_tested' ? 'N/T' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>

                {group.tests.map(testKey => (
                  <div key={testKey} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{(group.labels as any)[testKey]}</span>
                    <div className="flex gap-1">
                      {(['pass', 'fail', 'not_tested'] as const).map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setTest(testKey, s)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                            tests[testKey] === s
                              ? s === 'pass' ? 'bg-green-500 text-white' : s === 'fail' ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {s === 'pass' ? 'Pass' : s === 'fail' ? 'Fail' : 'N/T'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Function Notes</label>
        <div className="relative">
          <textarea
            value={data.functionNotes ?? ''}
            onChange={e => onChange({ ...data, functionNotes: e.target.value })}
            rows={3}
            placeholder="Add notes about vehicle function..."
            className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="absolute top-3 right-3">
            <VoiceInput onTranscript={t => onChange({ ...data, functionNotes: (data.functionNotes ?? '') + ' ' + t })} />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3">
        <button onClick={onBack} className="flex-1 py-4 rounded-2xl border border-gray-200 text-gray-700 font-semibold">Back</button>
        <button onClick={onNext} className="flex-1 py-4 rounded-2xl bg-[#1e3a5f] text-white font-semibold">Continue</button>
      </div>
    </div>
  )
}

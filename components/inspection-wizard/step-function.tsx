'use client'

import { useState } from 'react'
import { Settings, ChevronRight, Check } from 'lucide-react'
import VoiceInput from '@/components/ui/voice-input'
import StepOpener from './step-opener'

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
  ALL_TESTS.forEach(t => { out[t] = existing[t] ?? 'not_tested' })
  return out
}

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

function TogglePill({ status, selected, onSelect }: { status: TestStatus; selected: boolean; onSelect: () => void }) {
  const label = status === 'pass' ? 'Pass' : status === 'fail' ? 'Fail' : 'N/T'
  let bg = '#FFFFFF', border = '#E1E8F0', color = '#4A5568'
  if (selected) {
    if (status === 'pass') { bg = '#D1FAE5'; border = '#10B981'; color = '#065F46' }
    else if (status === 'fail') { bg = '#FEE2E2'; border = '#EF4444'; color = '#991B1B' }
    else { bg = '#F0F4F8'; border = '#94A3B8'; color = '#4A5568' }
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        flex: 1, height: 44, borderRadius: 8,
        background: bg, border: `1px solid ${border}`, color,
        fontWeight: selected ? 600 : 400, fontSize: 13, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

export default function StepFunction({ data, onChange, onNext, onBack }: Props) {
  const tests: Record<string, TestStatus> = data.tests ? data.tests : initTests({})
  const [open, setOpen] = useState<Record<string, boolean>>({ 'Starting & Drivetrain': true })

  const setTest = (key: string, status: TestStatus) => {
    onChange({ ...data, tests: { ...tests, [key]: status } })
  }

  const setBulk = (groupTests: string[], status: TestStatus) => {
    const updated = { ...tests }
    groupTests.forEach(k => { updated[k] = status })
    onChange({ ...data, tests: updated })
  }

  const isGroupComplete = (groupTests: string[]) =>
    groupTests.every(k => tests[k] && tests[k] !== 'not_tested')

  const toggle = (name: string) => setOpen(o => ({ ...o, [name]: !o[name] }))

  const setBulkAll = (status: TestStatus) => {
    const updated: Record<string, TestStatus> = {}
    ALL_TESTS.forEach(k => { updated[k] = status })
    onChange({ ...data, tests: updated })
  }

  return (
    <div style={{ paddingBottom: 140 }}>
      <StepOpener
        icon={<Settings size={36} style={{ color: '#00B4D8' }} />}
        title="Vehicle Function"
        subtitle="Test basic vehicle functions and controls"
        instructionTitle="Testing Instructions"
        instructionText="Test each function and mark as Pass, Fail, or N/T (Not Tested). Use Set All to mark groups quickly."
        complete={true}
        remainingText=""
      />

      <div style={{ padding: '0 24px' }}>
        {/* Set All row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: '#4A5568' }}>Set All:</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {([['pass', '#10B981', '#065F46'], ['fail', '#EF4444', '#991B1B'], ['not_tested', '#94A3B8', '#4A5568']] as const).map(([s, borderColor, textColor]) => (
              <button
                key={s}
                type="button"
                onClick={() => setBulkAll(s as TestStatus)}
                style={{
                  height: 32, padding: '0 12px', borderRadius: 20,
                  border: `1px solid ${borderColor}`, color: textColor,
                  background: '#FFFFFF', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                All {s === 'not_tested' ? 'N/T' : s === 'pass' ? 'Pass' : 'Fail'}
              </button>
            ))}
          </div>
        </div>

        {/* Collapsible sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {GROUPS.map(group => {
            const complete = isGroupComplete(group.tests)
            const isOpen = open[group.name] ?? false

            return (
              <div key={group.name} style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 12, overflow: 'hidden' }}>
                {/* Section header */}
                <button
                  type="button"
                  onClick={() => toggle(group.name)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: 16, background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0D1B2A' }}>{group.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {complete && <Check size={18} color="#10B981" />}
                    <ChevronRight
                      size={18}
                      color="#94A3B8"
                      style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}
                    />
                  </div>
                </button>

                {/* Set-all row for this group */}
                {isOpen && (
                  <div>
                    <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', borderBottom: '1px solid #E1E8F0' }}>
                      <span style={{ fontSize: 12, color: '#94A3B8', alignSelf: 'center', marginRight: 4 }}>Group:</span>
                      {(['pass', 'fail', 'not_tested'] as const).map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setBulk(group.tests, s)}
                          style={{
                            height: 28, padding: '0 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                            cursor: 'pointer',
                            background: s === 'pass' ? '#F0FDF4' : s === 'fail' ? '#FFF5F5' : '#F0F4F8',
                            color: s === 'pass' ? '#065F46' : s === 'fail' ? '#991B1B' : '#4A5568',
                            border: `1px solid ${s === 'pass' ? '#10B981' : s === 'fail' ? '#EF4444' : '#94A3B8'}`,
                          }}
                        >
                          All {s === 'not_tested' ? 'N/T' : s === 'pass' ? 'Pass' : 'Fail'}
                        </button>
                      ))}
                    </div>

                    {/* Test items */}
                    {group.tests.map((testKey, i) => (
                      <div
                        key={testKey}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderTop: i === 0 ? 'none' : '1px solid #E1E8F0',
                        }}
                      >
                        <span style={{ fontSize: 14, color: '#4A5568' }}>{(group.labels as any)[testKey]}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {(['pass', 'fail', 'not_tested'] as const).map(s => (
                            <TogglePill
                              key={s}
                              status={s}
                              selected={tests[testKey] === s}
                              onSelect={() => setTest(testKey, s)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Function notes */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 }}>
            Function Notes
          </label>
          <div style={{ position: 'relative' }}>
            <textarea
              value={data.functionNotes ?? ''}
              onChange={e => onChange({ ...data, functionNotes: e.target.value })}
              className="step-textarea"
              placeholder="Any additional notes about vehicle functions..."
              style={{ paddingRight: 44 }}
            />
            <div style={{ position: 'absolute', top: 10, right: 10 }}>
              <VoiceInput onTranscript={t => onChange({ ...data, functionNotes: (data.functionNotes ?? '') + ' ' + t })} />
            </div>
          </div>
        </div>
      </div>

      {/* Fixed bottom bar */}
      <div className="wizard-bottom-bar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#FFFFFF', borderTop: '1px solid #E1E8F0',
        padding: '12px 20px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              width: '38%', height: 52, borderRadius: 12,
              background: '#FFFFFF', border: '1.5px solid #E1E8F0',
              color: '#4A5568', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            }}
          >
            ← Back
          </button>
          <button
            onClick={onNext}
            style={{
              flex: 1, height: 52, borderRadius: 12, border: 'none',
              fontWeight: 700, fontSize: 15, cursor: 'pointer',
              background: '#F4A62A', color: '#0D1B2A',
              boxShadow: '0 4px 12px rgba(244,166,42,0.3)',
            }}
          >
            Continue to Documentation →
          </button>
        </div>
      </div>
    </div>
  )
}

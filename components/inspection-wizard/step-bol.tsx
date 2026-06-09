'use client'

import PhotoField from '@/components/ui/photo-field'
import VoiceInput from '@/components/ui/voice-input'

const QUICK_CHIPS = ['BOL matches vehicle', 'No discrepancies', 'Mileage matches', 'Signatures present', 'Date verified']

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepBOL({ data, onChange, onNext, onBack }: Props) {
  const bolPresent = data.bolPresent ?? false
  const canAdvance = bolPresent

  return (
    <div className="space-y-5 pb-24">
      <div
        onClick={() => onChange({ ...data, bolPresent: !bolPresent })}
        className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${bolPresent ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}
      >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${bolPresent ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
          {bolPresent && <span className="text-white text-xs font-bold">✓</span>}
        </div>
        <div>
          <p className="font-medium text-gray-900">Driver provided BOL</p>
          <p className="text-xs text-gray-500">Bill of Lading received from driver</p>
        </div>
      </div>

      {bolPresent && (
        <>
          <PhotoField
            label="BOL Photo"
            value={data.bolPhoto}
            onChange={url => onChange({ ...data, bolPhoto: url })}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">BOL Notes</label>
            <div className="relative">
              <textarea
                value={data.bolNotes ?? ''}
                onChange={e => onChange({ ...data, bolNotes: e.target.value })}
                rows={3}
                placeholder="Add notes about the BOL..."
                className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="absolute top-3 right-3">
                <VoiceInput onTranscript={t => onChange({ ...data, bolNotes: (data.bolNotes ?? '') + ' ' + t })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {QUICK_CHIPS.map(chip => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => onChange({ ...data, bolNotes: ((data.bolNotes ?? '') + ' ' + chip).trim() })}
                  className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs hover:bg-blue-50 hover:text-blue-700"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3">
        <button onClick={onBack} className="flex-1 py-4 rounded-2xl border border-gray-200 text-gray-700 font-semibold">Back</button>
        <button
          onClick={onNext}
          disabled={!canAdvance}
          className="flex-1 py-4 rounded-2xl bg-[#1e3a5f] text-white font-semibold disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

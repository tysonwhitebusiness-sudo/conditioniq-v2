'use client'

import PhotoField from '@/components/ui/photo-field'
import VoiceInput from '@/components/ui/voice-input'

const FLUID_OPTIONS: Record<string, string[]> = {
  oilLevel: ['full', 'good', 'low', 'overfull', 'not_checked'],
  coolantLevel: ['full', 'good', 'low', 'not_checked'],
  brakeFluid: ['good', 'low', 'not_checked'],
  transmissionFluid: ['good', 'low', 'not_checked'],
}

const FLUID_LABELS: Record<string, string> = {
  oilLevel: 'Oil Level', coolantLevel: 'Coolant Level', brakeFluid: 'Brake Fluid', transmissionFluid: 'Transmission Fluid',
}

const COMPONENT_OPTIONS: Record<string, string[]> = {
  batteryCondition: ['good', 'fair', 'poor'],
  beltCondition: ['good', 'worn', 'cracked', 'not_visible'],
  hoseCondition: ['good', 'worn', 'leaking', 'not_visible'],
}

const COMPONENT_LABELS: Record<string, string> = {
  batteryCondition: 'Battery Condition', beltCondition: 'Belt Condition', hoseCondition: 'Hose Condition',
}

const NOISE_TYPES = ['knocking', 'ticking', 'squealing', 'grinding', 'rattling', 'other']

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

function optionColor(val: string): string {
  if (val === 'full' || val === 'good') return 'bg-green-500 text-white'
  if (val === 'low' || val === 'worn' || val === 'leaking' || val === 'cracked' || val === 'poor') return 'bg-red-500 text-white'
  if (val === 'fair' || val === 'overfull') return 'bg-yellow-500 text-white'
  return 'bg-[#1e3a5f] text-white'
}

export default function StepEngine({ data, onChange, onNext, onBack }: Props) {
  const set = (key: string, val: any) => onChange({ ...data, [key]: val })

  return (
    <div className="space-y-5 pb-24">
      <PhotoField
        label="Engine Bay Photo"
        value={data.engineBayPhoto}
        onChange={url => set('engineBayPhoto', url)}
        required
      />

      {/* Fluids */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Fluid Levels</h3>
        <div className="space-y-4">
          {Object.entries(FLUID_OPTIONS).map(([key, opts]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-600 mb-2">{FLUID_LABELS[key]}</label>
              <div className="flex flex-wrap gap-2">
                {opts.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => set(key, opt)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${data[key] === opt ? optionColor(opt) : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {opt.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Components */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Components</h3>
        <div className="space-y-4">
          {Object.entries(COMPONENT_OPTIONS).map(([key, opts]) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-600 mb-2">{COMPONENT_LABELS[key]}</label>
              <div className="flex flex-wrap gap-2">
                {opts.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => set(key, opt)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${data[key] === opt ? optionColor(opt) : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {opt.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Leaks */}
      <div
        onClick={() => set('visibleLeaks', !data.visibleLeaks)}
        className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer ${data.visibleLeaks ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
      >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${data.visibleLeaks ? 'border-red-500 bg-red-500' : 'border-gray-300'}`}>
          {data.visibleLeaks && <span className="text-white text-xs">✓</span>}
        </div>
        <span className="font-medium">Visible Leaks</span>
      </div>

      {data.visibleLeaks && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leak Description</label>
            <input
              value={data.leakDescription ?? ''}
              onChange={e => set('leakDescription', e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
              placeholder="Describe the leak..."
            />
          </div>
          <PhotoField label="Leak Photo" value={data.leakPhoto} onChange={url => set('leakPhoto', url)} />
        </>
      )}

      {/* Unusual Noise */}
      <div
        onClick={() => set('unusualNoise', !data.unusualNoise)}
        className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer ${data.unusualNoise ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}
      >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${data.unusualNoise ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}>
          {data.unusualNoise && <span className="text-white text-xs">✓</span>}
        </div>
        <span className="font-medium">Unusual Noise</span>
      </div>

      {data.unusualNoise && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Noise Type</label>
          <div className="flex flex-wrap gap-2">
            {NOISE_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => set('noiseType', t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize ${data.noiseType === t ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Engine Notes</label>
        <div className="relative">
          <textarea
            value={data.engineNotes ?? ''}
            onChange={e => set('engineNotes', e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Additional engine observations..."
          />
          <div className="absolute top-3 right-3">
            <VoiceInput onTranscript={t => set('engineNotes', (data.engineNotes ?? '') + ' ' + t)} />
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

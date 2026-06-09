'use client'

import { useState } from 'react'
import PhotoField from '@/components/ui/photo-field'
import DamageEntry from './damage-entry'
import VoiceInput from '@/components/ui/voice-input'
import { Camera, Plus, Trash2 } from 'lucide-react'
import dynamic from 'next/dynamic'

const CameraCapture = dynamic(() => import('@/components/ui/camera-capture'), { ssr: false })

const COND_OPTIONS = { overallCondition: ['good', 'fair', 'poor'], paintCondition: ['good', 'faded', 'scratched', 'dented', 'peeling'], glassCondition: ['good', 'chipped', 'cracked', 'shattered'] }
const TIRE_POSITIONS = ['tireFrontLeft', 'tireFrontRight', 'tireRearLeft', 'tireRearRight'] as const
const TIRE_LABELS: Record<string, string> = { tireFrontLeft: 'FL', tireFrontRight: 'FR', tireRearLeft: 'RL', tireRearRight: 'RR' }
const EXT_PHOTOS = ['exteriorFrontPhoto', 'exteriorRearPhoto', 'exteriorDriverPhoto', 'exteriorPassengerPhoto']
const EXT_PHOTO_LABELS = ['Front', 'Rear', 'Driver Side', 'Passenger Side']

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepExterior({ data, onChange, onNext, onBack }: Props) {
  const [showSequence, setShowSequence] = useState(false)
  const [extraPhotos, setExtraPhotos] = useState<string[]>(data.extraPhotos ?? [])

  const set = (key: string, val: any) => onChange({ ...data, [key]: val })
  const setTire = (pos: string, key: string, val: any) =>
    onChange({ ...data, [pos]: { ...(data[pos] ?? {}), [key]: val } })

  const handleSequenceCapture = (index: number, url: string) => {
    set(EXT_PHOTOS[index], url)
  }

  const addExtraPhoto = (url: string) => {
    const updated = [...extraPhotos, url]
    setExtraPhotos(updated)
    set('extraPhotos', updated)
  }

  const removeExtraPhoto = (i: number) => {
    const updated = extraPhotos.filter((_, idx) => idx !== i)
    setExtraPhotos(updated)
    set('extraPhotos', updated)
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Sequence capture button */}
      <button
        type="button"
        onClick={() => setShowSequence(true)}
        className="w-full flex items-center justify-center gap-2 py-4 bg-[#1e3a5f] text-white rounded-2xl font-medium"
      >
        <Camera size={20} /> Capture All 4 Exterior Photos
      </button>

      {showSequence && (
        <CameraCapture
          onCapture={() => {}}
          onClose={() => setShowSequence(false)}
          photoSequence={EXT_PHOTO_LABELS}
          currentSequenceIndex={0}
          onSequenceCapture={handleSequenceCapture}
        />
      )}

      {/* Individual photo fields */}
      <div className="grid grid-cols-2 gap-3">
        {EXT_PHOTOS.map((key, i) => (
          <PhotoField key={key} label={EXT_PHOTO_LABELS[i]} value={data[key]} onChange={url => set(key, url)} />
        ))}
      </div>

      {/* Condition fields */}
      {Object.entries(COND_OPTIONS).map(([key, opts]) => (
        <div key={key}>
          <label className="block text-sm font-medium text-gray-700 mb-2 capitalize">
            {key.replace(/([A-Z])/g, ' $1').trim()}
          </label>
          <div className="flex flex-wrap gap-2">
            {opts.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => set(key, opt)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all capitalize ${data[key] === opt ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      {data.glassCondition && data.glassCondition !== 'good' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Which pane?</label>
          <input
            value={data.glassDamageLocation ?? ''}
            onChange={e => set('glassDamageLocation', e.target.value)}
            placeholder="e.g. Windshield, Driver window..."
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm"
          />
        </div>
      )}

      {/* Tires */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Tires</h3>
        <div className="grid grid-cols-2 gap-3">
          {TIRE_POSITIONS.map(pos => {
            const tire = data[pos] ?? {}
            return (
              <div key={pos} className="border border-gray-200 rounded-xl p-3 space-y-2">
                <span className="text-xs font-bold text-gray-500">{TIRE_LABELS[pos]}</span>
                <div>
                  <label className="text-xs text-gray-400">Tread (32nds)</label>
                  <input
                    type="number"
                    value={tire.treadDepth ?? ''}
                    onChange={e => setTire(pos, 'treadDepth', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm mt-1"
                    min="0" max="32"
                  />
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={tire.flat ?? false} onChange={e => setTire(pos, 'flat', e.target.checked)} />
                  Flat
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={tire.unevenWear ?? false} onChange={e => setTire(pos, 'unevenWear', e.target.checked)} />
                  Uneven Wear
                </label>
              </div>
            )
          })}
        </div>
      </div>

      {/* Damage */}
      <DamageEntry
        damages={data.damages ?? []}
        onChange={damages => set('damages', damages)}
        locationType="exterior"
      />

      {/* Extra photos */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Extra Photos</h3>
        {extraPhotos.map((url, i) => (
          <div key={i} className="relative mb-3">
            <img src={url} alt="" className="w-full h-32 object-cover rounded-xl" />
            <button
              onClick={() => removeExtraPhoto(i)}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <PhotoField label="Add Extra Photo" value={null} onChange={addExtraPhoto} />
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Exterior Notes</label>
        <div className="relative">
          <textarea
            value={data.exteriorNotes ?? ''}
            onChange={e => set('exteriorNotes', e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Additional exterior observations..."
          />
          <div className="absolute top-3 right-3">
            <VoiceInput onTranscript={t => set('exteriorNotes', (data.exteriorNotes ?? '') + ' ' + t)} />
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

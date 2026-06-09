'use client'

import { useState } from 'react'
import PhotoField from '@/components/ui/photo-field'
import DamageEntry from './damage-entry'
import VoiceInput from '@/components/ui/voice-input'
import { Camera, Trash2 } from 'lucide-react'
import dynamic from 'next/dynamic'

const CameraCapture = dynamic(() => import('@/components/ui/camera-capture'), { ssr: false })

const INT_PHOTOS = ['interiorDriverDoorPhoto', 'interiorRearDriverDoorPhoto', 'interiorTrunkPhoto', 'interiorRearPassengerDoorPhoto', 'interiorPassengerDoorPhoto', 'dashboardPhoto']
const INT_PHOTO_LABELS = ['Driver Door', 'Rear Driver Door', 'Trunk', 'Rear Passenger Door', 'Passenger Door', 'Dashboard']

const CONDITIONS: Record<string, string[]> = {
  overallCondition: ['good', 'fair', 'poor'],
  frontSeats: ['good', 'stained', 'torn', 'worn', 'burned'],
  rearSeats: ['good', 'stained', 'torn', 'worn', 'burned'],
  dashboard: ['good', 'cracked', 'faded', 'warning_lights'],
  headliner: ['good', 'stained', 'sagging', 'torn'],
  carpetFloor: ['good', 'stained', 'worn', 'torn', 'wet'],
  steeringWheel: ['good', 'worn', 'cracked', 'peeling'],
}

const CONDITION_LABELS: Record<string, string> = {
  overallCondition: 'Overall Interior', frontSeats: 'Front Seats', rearSeats: 'Rear Seats',
  dashboard: 'Dashboard', headliner: 'Headliner', carpetFloor: 'Carpet/Floor', steeringWheel: 'Steering Wheel',
}

const ODOR_TYPES = ['smoke', 'mildew', 'pet', 'food', 'chemical', 'other']

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepInterior({ data, onChange, onNext, onBack }: Props) {
  const [showSequence, setShowSequence] = useState(false)
  const [extraPhotos, setExtraPhotos] = useState<string[]>(data.extraPhotos ?? [])

  const set = (key: string, val: any) => onChange({ ...data, [key]: val })

  const addExtraPhoto = (url: string) => {
    const updated = [...extraPhotos, url]
    setExtraPhotos(updated)
    set('extraPhotos', updated)
  }

  return (
    <div className="space-y-6 pb-24">
      <button
        type="button"
        onClick={() => setShowSequence(true)}
        className="w-full flex items-center justify-center gap-2 py-4 bg-[#1e3a5f] text-white rounded-2xl font-medium"
      >
        <Camera size={20} /> Capture All 6 Interior Photos
      </button>

      {showSequence && (
        <CameraCapture
          onCapture={() => {}}
          onClose={() => setShowSequence(false)}
          photoSequence={INT_PHOTO_LABELS}
          currentSequenceIndex={0}
          onSequenceCapture={(idx, url) => set(INT_PHOTOS[idx], url)}
        />
      )}

      <div className="grid grid-cols-2 gap-3">
        {INT_PHOTOS.map((key, i) => (
          <PhotoField key={key} label={INT_PHOTO_LABELS[i]} value={data[key]} onChange={url => set(key, url)} />
        ))}
      </div>

      {Object.entries(CONDITIONS).map(([key, opts]) => (
        <div key={key}>
          <label className="block text-sm font-medium text-gray-700 mb-2">{CONDITION_LABELS[key]}</label>
          {key === 'dashboard' && data[key] === 'warning_lights' && (
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mb-2">
              Warning lights present — document in notes
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {opts.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => set(key, opt)}
                className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-all ${data[key] === opt ? 'bg-[#1e3a5f] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {opt.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Odor */}
      <div
        onClick={() => set('interiorOdor', !data.interiorOdor)}
        className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer ${data.interiorOdor ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200'}`}
      >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${data.interiorOdor ? 'border-yellow-500 bg-yellow-500' : 'border-gray-300'}`}>
          {data.interiorOdor && <span className="text-white text-xs">✓</span>}
        </div>
        <span className="font-medium">Odor Present</span>
      </div>

      {data.interiorOdor && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Odor Type</label>
          <div className="flex flex-wrap gap-2">
            {ODOR_TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => set('odorType', t)}
                className={`px-4 py-2 rounded-full text-sm font-medium capitalize ${data.odorType === t ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <DamageEntry
        damages={data.damages ?? []}
        onChange={damages => set('damages', damages)}
        locationType="interior"
      />

      {/* Extra photos */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Extra Photos</h3>
        {extraPhotos.map((url, i) => (
          <div key={i} className="relative mb-3">
            <img src={url} alt="" className="w-full h-32 object-cover rounded-xl" />
            <button
              onClick={() => { const u = extraPhotos.filter((_, idx) => idx !== i); setExtraPhotos(u); set('extraPhotos', u) }}
              className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <PhotoField label="Add Extra Photo" value={null} onChange={addExtraPhoto} />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Interior Notes</label>
        <div className="relative">
          <textarea
            value={data.interiorNotes ?? ''}
            onChange={e => set('interiorNotes', e.target.value)}
            rows={3}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="absolute top-3 right-3">
            <VoiceInput onTranscript={t => set('interiorNotes', (data.interiorNotes ?? '') + ' ' + t)} />
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

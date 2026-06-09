'use client'

import { useState, useCallback } from 'react'
import PhotoField from '@/components/ui/photo-field'
import VoiceInput from '@/components/ui/voice-input'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

export default function StepDocumentation({ data, onChange, onNext, onBack }: Props) {
  const [scanning, setScanning] = useState(false)
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null)

  const handlePlatePhotoCapture = useCallback(async (url: string) => {
    onChange({ ...data, licensePlatePhoto: url })
    if (!url) return

    setScanning(true)
    try {
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      const { data: result } = await worker.recognize(url)
      await worker.terminate()
      const confidence = result.confidence
      const raw = result.text.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8)
      setOcrConfidence(confidence)
      if (confidence > 50) onChange({ ...data, licensePlatePhoto: url, licensePlate: raw })
    } catch {
      // OCR failed silently
    } finally {
      setScanning(false)
    }
  }, [data, onChange])

  return (
    <div className="space-y-5 pb-24">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">License Plate</label>
          <input
            value={data.licensePlate ?? ''}
            onChange={e => onChange({ ...data, licensePlate: e.target.value.toUpperCase() })}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 font-mono uppercase text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="ABC-1234"
            maxLength={8}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
          <select
            value={data.licensePlateState ?? ''}
            onChange={e => onChange({ ...data, licensePlateState: e.target.value })}
            className="w-full border border-gray-300 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">--</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div>
        <PhotoField
          label={data.licensePlatePhoto ? 'Re-scan Plate Photo' : 'License Plate Photo'}
          value={data.licensePlatePhoto}
          onChange={handlePlatePhotoCapture}
        />
        {scanning && <p className="text-xs text-blue-500 mt-1 animate-pulse">Scanning plate...</p>}
        {ocrConfidence !== null && !scanning && (
          <p className={`text-xs mt-1 ${ocrConfidence < 70 ? 'text-yellow-600' : 'text-green-600'}`}>
            OCR confidence: {Math.round(ocrConfidence)}%{ocrConfidence < 70 ? ' — please verify manually' : ''}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div
          onClick={() => onChange({ ...data, registrationCurrent: !data.registrationCurrent })}
          className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer ${data.registrationCurrent ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${data.registrationCurrent ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
            {data.registrationCurrent && <span className="text-white text-xs">✓</span>}
          </div>
          <span className="font-medium">Registration Current</span>
        </div>

        {data.registrationCurrent && (
          <PhotoField label="Registration Photo" value={data.registrationPhoto} onChange={url => onChange({ ...data, registrationPhoto: url })} />
        )}

        <div
          onClick={() => onChange({ ...data, insurancePresent: !data.insurancePresent })}
          className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer ${data.insurancePresent ? 'border-green-500 bg-green-50' : 'border-gray-200'}`}
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${data.insurancePresent ? 'border-green-500 bg-green-500' : 'border-gray-300'}`}>
            {data.insurancePresent && <span className="text-white text-xs">✓</span>}
          </div>
          <span className="font-medium">Insurance Present</span>
        </div>

        {data.insurancePresent && (
          <PhotoField label="Insurance Photo" value={data.insurancePhoto} onChange={url => onChange({ ...data, insurancePhoto: url })} />
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Documentation Notes</label>
        <div className="relative">
          <textarea
            value={data.docNotes ?? ''}
            onChange={e => onChange({ ...data, docNotes: e.target.value })}
            rows={3}
            placeholder="Notes about documentation..."
            className="w-full border border-gray-300 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="absolute top-3 right-3">
            <VoiceInput onTranscript={t => onChange({ ...data, docNotes: (data.docNotes ?? '') + ' ' + t })} />
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

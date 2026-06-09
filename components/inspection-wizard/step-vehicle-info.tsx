'use client'

import { useState, useEffect, useCallback } from 'react'
import { Scan, Search, ChevronDown, ChevronUp } from 'lucide-react'
import { decodeVIN, type VINDecodeResult } from '@/lib/vin-decode'
import PhotoField from '@/components/ui/photo-field'

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
}

const VIN_REGEX = /[^A-HJ-NPR-Z0-9]/gi

export default function StepVehicleInfo({ data, onChange, onNext }: Props) {
  const [decoding, setDecoding] = useState(false)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [advancedInfo, setAdvancedInfo] = useState<VINDecodeResult | null>(data.advancedInfo ?? null)

  const vin = data.vin ?? ''
  const isVinComplete = vin.length === 17

  const handleVinChange = useCallback((raw: string) => {
    const cleaned = raw.replace(VIN_REGEX, '').toUpperCase().slice(0, 17)
    onChange({ ...data, vin: cleaned })
    if (cleaned.length === 17) autoDecode(cleaned)
    else setAdvancedInfo(null)
  }, [data, onChange])

  const autoDecode = useCallback(async (vinStr: string) => {
    setDecoding(true)
    setDecodeError(null)
    try {
      const result = await decodeVIN(vinStr)
      if (result) {
        setAdvancedInfo(result)
        onChange({ ...data, vin: vinStr, make: result.make, model: result.model, year: result.year, advancedInfo: result })
      } else {
        setDecodeError('VIN could not be decoded. Please verify.')
      }
    } catch {
      setDecodeError('Decode failed. Check your connection.')
    } finally {
      setDecoding(false)
    }
  }, [data, onChange])

  useEffect(() => {
    const savedLoc = localStorage.getItem('vcr_last_location')
    if (savedLoc && !data.location) onChange({ ...data, location: savedLoc })
  }, [])

  const handleLocationBlur = () => {
    if (data.location) localStorage.setItem('vcr_last_location', data.location)
  }

  const canAdvance = isVinComplete

  return (
    <div className="space-y-5 pb-24">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          VIN <span className="text-red-500">*</span>
          <span className="text-xs text-gray-400 ml-2">{vin.length}/17</span>
        </label>
        <div className="flex gap-2">
          <input
            value={vin}
            onChange={e => handleVinChange(e.target.value)}
            placeholder="Enter 17-character VIN"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 uppercase tracking-widest font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={17}
            autoCapitalize="characters"
          />
          <button
            type="button"
            onClick={() => isVinComplete && autoDecode(vin)}
            disabled={!isVinComplete || decoding}
            className="flex items-center gap-1 px-4 py-3 rounded-xl bg-[#1e3a5f] text-white text-sm disabled:opacity-40"
          >
            <Search size={16} />
            {decoding ? '...' : 'Decode'}
          </button>
        </div>
        {decodeError && <p className="text-red-500 text-xs mt-1">{decodeError}</p>}
        {advancedInfo && (
          <p className="text-green-600 text-xs mt-1">
            Decoded: {advancedInfo.year} {advancedInfo.make} {advancedInfo.model}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {['year', 'make', 'model'].map(field => (
          <div key={field}>
            <label className="block text-xs font-medium text-gray-500 mb-1 capitalize">{field}</label>
            <input
              value={data[field] ?? ''}
              onChange={e => onChange({ ...data, [field]: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Asset ID</label>
          <input
            value={data.assetId ?? ''}
            onChange={e => onChange({ ...data, assetId: e.target.value })}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input
            value={data.location ?? ''}
            onChange={e => onChange({ ...data, location: e.target.value })}
            onBlur={handleLocationBlur}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Yard / facility"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Odometer</label>
        <input
          value={data.odometer ?? ''}
          onChange={e => onChange({ ...data, odometer: e.target.value.replace(/\D/g, '') })}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Miles"
          inputMode="numeric"
        />
      </div>

      <PhotoField
        label="Baseline Vehicle Photo"
        value={data.baselinePhoto}
        onChange={url => onChange({ ...data, baselinePhoto: url })}
        required
      />

      {advancedInfo && (
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(v => !v)}
            className="flex items-center gap-2 text-sm text-blue-600"
          >
            {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            Advanced VIN Details
          </button>
          {showAdvanced && (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-gray-50 rounded-xl p-3">
              {Object.entries({
                Trim: advancedInfo.trim, Body: advancedInfo.bodyClass, Doors: advancedInfo.doors,
                Drive: advancedInfo.driveType, Transmission: advancedInfo.transmissionStyle,
                Cylinders: advancedInfo.cylinders, Displacement: advancedInfo.displacement ? `${advancedInfo.displacement}L` : undefined,
                Horsepower: advancedInfo.horsepower ? `${advancedInfo.horsepower} HP` : undefined,
                Fuel: advancedInfo.fuelType, GVWR: advancedInfo.gvwr,
                Manufacturer: advancedInfo.manufacturer, Plant: advancedInfo.plantCity,
              }).filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><span className="text-gray-400">{k}:</span> <span className="font-medium">{v}</span></div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100">
        <button
          onClick={onNext}
          disabled={!canAdvance}
          className="w-full py-4 rounded-2xl bg-[#1e3a5f] text-white font-semibold text-lg disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

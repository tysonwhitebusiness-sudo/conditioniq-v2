'use client'

import { useState, useEffect, useCallback } from 'react'
import { Car, ChevronDown, ChevronUp, Check, Loader2, Lock } from 'lucide-react'
import { decodeVINAction, type VINDecodeResult } from '@/lib/vin-actions'
import PhotoField from '@/components/ui/photo-field'
import StepOpener from './step-opener'
import { useAuth } from '@/contexts/auth-context'
import { inferInspectionType, type InspectionType } from '@/lib/storage-actions'

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  inspectionId: string
}

const VIN_REGEX = /[^A-HJ-NPR-Z0-9]/gi

const label13 = { fontSize: 13, fontWeight: 500, color: '#374151', display: 'block', marginBottom: 6 } as const
const fieldGap = { marginBottom: 20 } as const

const INSP_TYPES: { id: InspectionType; label: string; desc: string }[] = [
  { id: 'check_in',  label: 'Check-In',        desc: 'Vehicle arriving at storage' },
  { id: 'check_out', label: 'Check-Out',        desc: 'Vehicle leaving storage' },
  { id: 'standard',  label: 'Other / Standard', desc: 'Transport, one-off, or mid-storage report' },
]

const INSP_COLORS: Record<InspectionType, { bg: string; border: string; color: string }> = {
  check_in:  { bg: '#D1FAE5', border: '#10B981', color: '#065F46' },
  check_out: { bg: '#FEF3C7', border: '#F59E0B', color: '#92400E' },
  standard:  { bg: '#E0F7FC', border: '#00B4D8', color: '#0097B2' },
}

export default function StepVehicleInfo({ data, onChange, onNext, inspectionId }: Props) {
  const { effectiveCompany } = useAuth()
  const [decoding, setDecoding] = useState(false)
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [advancedInfo, setAdvancedInfo] = useState<VINDecodeResult | null>(data.advancedInfo ?? null)
  const [inferring, setInferring] = useState(false)
  const [vinAttempted, setVinAttempted] = useState(false)

  const vin = data.vin ?? ''
  const isVinComplete = vin.length === 17
  const isVinLocked = Boolean(data._vinLocked) && isVinComplete
  const inspectionType: InspectionType = data.inspectionType ?? 'standard'
  const hasPhoto = !!data.baselinePhoto
  const canAdvance = isVinComplete && hasPhoto

  const missing: string[] = []
  if (!isVinComplete) missing.push('VIN (17 chars)')
  if (!hasPhoto) missing.push('baseline photo')
  const remainingText = missing.length > 0 ? missing.join(' • ') + ' required' : ''

  const handleVinChange = useCallback((raw: string) => {
    const cleaned = raw.replace(VIN_REGEX, '').toUpperCase().slice(0, 17)
    onChange({ ...data, vin: cleaned })
    if (cleaned.length === 17) autoDecode(cleaned)
    else { setAdvancedInfo(null); setDecodeError(null) }
  }, [data, onChange])

  const autoDecode = useCallback(async (vinStr: string) => {
    setDecoding(true)
    setDecodeError(null)
    try {
      const result = await decodeVINAction(vinStr)
      if (result) {
        setAdvancedInfo(result)
        onChange({ ...data, vin: vinStr, make: result.make, model: result.model, year: result.year, advancedInfo: result })
      } else {
        setDecodeError('Could not decode VIN — enter year/make/model manually or tap Decode.')
      }
    } catch {
      setDecodeError('Decode failed — tap Decode to retry.')
    } finally {
      setDecoding(false)
    }
  }, [data, onChange])

  useEffect(() => {
    const savedLoc = localStorage.getItem('vcr_last_location')
    if (savedLoc && !data.location) onChange({ ...data, location: savedLoc })
    // If VIN is already 17 chars on mount (e.g. from Pick from Vehicles), run decode
    if (vin.length === 17 && !data.advancedInfo) autoDecode(vin)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-infer inspection type when VIN is complete and type not yet manually set
  useEffect(() => {
    if (!isVinComplete || !effectiveCompany?.id || data.inspectionType) return
    setInferring(true)
    inferInspectionType(effectiveCompany.id, vin)
      .then(type => onChange({ ...data, inspectionType: type }))
      .catch(() => onChange({ ...data, inspectionType: 'standard' }))
      .finally(() => setInferring(false))
  }, [isVinComplete, vin, effectiveCompany?.id])

  const handleLocationBlur = () => {
    if (data.location) localStorage.setItem('vcr_last_location', data.location)
  }

  return (
    <div style={{ paddingBottom: 140 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <StepOpener
        icon={<Car size={36} style={{ color: '#00B4D8' }} />}
        title="Vehicle Information"
        subtitle="Enter the basic vehicle details to begin"
        instructionTitle="VIN Lookup"
        instructionText="Enter the 17-character VIN to auto-fill year, make, and model."
        complete={canAdvance}
        remainingText={remainingText}
      />

      <div style={{ padding: '0 24px' }}>
        {/* VIN */}
        <div style={fieldGap}>
          <label style={label13}>
            VIN <span style={{ color: '#EF4444' }}>*</span>
          </label>
          <div style={{ position: 'relative', marginBottom: 4 }}>
            <input
              value={vin}
              onChange={isVinLocked ? undefined : e => handleVinChange(e.target.value)}
              readOnly={isVinLocked}
              placeholder="Enter 17-character VIN"
              className="step-input"
              style={{
                width: '100%',
                fontFamily: 'monospace',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                borderColor: isVinComplete ? '#10B981' : undefined,
                paddingRight: 44,
                boxSizing: 'border-box',
                background: isVinLocked ? '#F5F8FA' : undefined,
                color: isVinLocked ? '#4A5568' : undefined,
                cursor: isVinLocked ? 'default' : undefined,
              }}
              maxLength={17}
              autoCapitalize="characters"
            />
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
              {isVinLocked && <Lock size={14} color="#94A3B8" />}
              {!isVinLocked && decoding && <Loader2 size={16} color="#00B4D8" style={{ animation: 'spin 0.8s linear infinite' }} />}
              {!isVinLocked && !decoding && isVinComplete && !decodeError && <Check size={16} color="#10B981" />}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div style={{ flex: 1 }}>
              {isVinLocked ? (
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Lock size={11} />VIN set by dispatch
                </p>
              ) : (
                <>
                  {vinAttempted && !isVinComplete && (
                    <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>
                      VIN must be 17 characters.
                    </p>
                  )}
                  {decodeError && (
                    <p style={{ fontSize: 12, color: '#EF4444', margin: 0 }}>{decodeError}</p>
                  )}
                </>
              )}
              {advancedInfo && !decodeError && (
                <p style={{ fontSize: 12, color: '#10B981', margin: 0 }}>
                  ✓ {advancedInfo.year} {advancedInfo.make} {advancedInfo.model}
                </p>
              )}
            </div>
            {!isVinLocked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isVinComplete && (
                  <button
                    type="button"
                    onClick={() => autoDecode(vin)}
                    disabled={decoding}
                    style={{ height: 28, padding: '0 12px', borderRadius: 6, border: '1px solid #00B4D8', background: '#FFF', color: '#00B4D8', fontSize: 12, fontWeight: 600, cursor: decoding ? 'default' : 'pointer', fontFamily: 'inherit', opacity: decoding ? 0.6 : 1 }}>
                    {decoding ? 'Decoding…' : 'Decode'}
                  </button>
                )}
                <span style={{ fontSize: 12, color: '#94A3B8' }}>{vin.length}/17</span>
              </div>
            )}
          </div>
        </div>

        {/* Inspection Type */}
        {isVinComplete && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
              Inspection Type{inferring ? ' — detecting…' : ''}
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {INSP_TYPES.map(({ id, label }) => {
                const active = inspectionType === id
                const c = INSP_COLORS[id]
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChange({ ...data, inspectionType: id })}
                    style={{
                      flex: 1, height: 44, borderRadius: 8, border: `1px solid ${active ? c.border : '#E1E8F0'}`,
                      background: active ? c.bg : '#FFFFFF',
                      color: active ? c.color : '#4A5568',
                      fontWeight: active ? 600 : 400, fontSize: 13,
                      cursor: 'pointer', transition: 'all 150ms ease',
                      fontFamily: 'inherit',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
              {INSP_TYPES.find(t => t.id === inspectionType)?.desc}
            </p>
          </div>
        )}

        {/* Year / Make / Model */}
        <div style={{ ...fieldGap, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {(['year', 'make', 'model'] as const).map(field => (
            <div key={field}>
              <label style={{ ...label13, textTransform: 'capitalize' }}>{field}</label>
              <input
                value={data[field] ?? ''}
                onChange={e => onChange({ ...data, [field]: e.target.value })}
                className="step-input"
                placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              />
            </div>
          ))}
        </div>

        {/* Asset ID / Location */}
        <div style={{ ...fieldGap, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={label13}>Asset ID</label>
            <input
              value={data.assetId ?? ''}
              onChange={e => onChange({ ...data, assetId: e.target.value })}
              className="step-input"
              placeholder="Optional"
            />
          </div>
          <div>
            <label style={label13}>Location</label>
            <input
              value={data.location ?? ''}
              onChange={e => onChange({ ...data, location: e.target.value })}
              onBlur={handleLocationBlur}
              className="step-input"
              placeholder="Yard / facility"
            />
          </div>
        </div>

        {/* Odometer */}
        <div style={fieldGap}>
          <label style={label13}>Odometer</label>
          <input
            value={data.odometer ?? ''}
            onChange={e => onChange({ ...data, odometer: e.target.value.replace(/\D/g, '') })}
            className="step-input"
            placeholder="Miles"
            inputMode="numeric"
          />
        </div>

        {/* Baseline Photo */}
        <div style={fieldGap}>
          <PhotoField
            label="Baseline Vehicle Photo"
            value={data.baselinePhoto}
            onChange={url => onChange({ ...data, baselinePhoto: url })}
            required
            inspectionId={inspectionId}
            fieldKey="baselinePhoto"
          />
        </div>

        {/* Advanced VIN details accordion */}
        {advancedInfo && (
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, color: '#00B4D8', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              {showAdvanced ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              Advanced VIN Details
            </button>
            {showAdvanced && (
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: '#F5F8FA', borderRadius: 10, padding: 12, fontSize: 12 }}>
                {Object.entries({
                  Trim: advancedInfo.trim, Body: advancedInfo.bodyClass, Doors: advancedInfo.doors,
                  Drive: advancedInfo.driveType, Transmission: advancedInfo.transmissionStyle,
                  Cylinders: advancedInfo.cylinders,
                  Displacement: advancedInfo.displacement ? `${advancedInfo.displacement}L` : undefined,
                  Horsepower: advancedInfo.horsepower ? `${advancedInfo.horsepower} HP` : undefined,
                  Fuel: advancedInfo.fuelType, GVWR: advancedInfo.gvwr,
                }).filter(([, v]) => v).map(([k, v]) => (
                  <div key={k}>
                    <span style={{ color: '#94A3B8' }}>{k}: </span>
                    <span style={{ fontWeight: 500, color: '#0D1B2A' }}>{v as string}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fixed bottom bar */}
      <div className="wizard-bottom-bar" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
        background: '#FFFFFF', borderTop: '1px solid #E1E8F0',
        padding: '12px 20px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
      }}>
        {!canAdvance && (
          <p style={{ fontSize: 12, color: '#F59E0B', textAlign: 'center', marginBottom: 8 }}>
            {missing.join(' • ')} required
          </p>
        )}
        <button
          onClick={() => {
            if (!canAdvance) {
              if (!isVinComplete) setVinAttempted(true)
              return
            }
            onNext()
          }}
          style={{
            width: '100%', height: 52, borderRadius: 12, border: 'none',
            fontWeight: 700, fontSize: 15, cursor: canAdvance ? 'pointer' : 'not-allowed',
            background: canAdvance ? '#00B4D8' : '#E1E8F0',
            color: canAdvance ? '#FFFFFF' : '#94A3B8',
            boxShadow: canAdvance ? '0 4px 12px rgba(0,180,216,0.3)' : 'none',
          }}
        >
          Continue to BOL →
        </button>
      </div>
    </div>
  )
}

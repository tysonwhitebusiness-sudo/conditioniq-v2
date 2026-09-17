'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Search, ScanLine, ChevronRight, Loader2, AlertTriangle, X, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { decodeVINAction } from '@/lib/vin-actions'
import { usePlan } from '@/hooks/use-plan'
import { isValidVin } from '@/components/ui/vin-scanner'
import {
  PRIMARY, PRIMARY_LIGHT, PRIMARY_PILL_TEXT, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100,
  DANGER, WARN_LIGHT, WARN_DARK,
} from '@/lib/design-tokens'

const VinScanner = dynamic(() => import('@/components/ui/vin-scanner'), { ssr: false })

// What a full inspection starts from. A picked vehicle carries its id; a typed
// VIN carries what the decode found, so a new vehicle gets its body type.
export interface InspectionStartSelection {
  vehicleId?: string
  vin: string
  year?: string | null
  make?: string | null
  model?: string | null
  bodyClass?: string | null
}

interface VehicleRow {
  id: string
  vin: string
  year: number | string | null
  make: string | null
  model: string | null
  work_order_status: string
}

type Step = 'pick' | 'confirm-new' | 'vin'

// The Start Inspection sheet on the Inspections list.
//
// Accounts with the lot platform pick from their active vehicles. Inspection-only
// accounts (Pay Per Use) enter a VIN. A lot account can still add a VIN that is
// not in its inventory, but only after a warning: it adds a unit on the lot and
// uses a billed vehicle slot.
export default function StartInspectionSheet({
  isOpen, companyId, onClose, onSelect,
}: {
  isOpen: boolean
  companyId: string
  onClose: () => void
  onSelect: (selection: InspectionStartSelection) => void
}) {
  const { plan } = usePlan()
  const [step, setStep] = useState<Step>('pick')
  const [vehicles, setVehicles] = useState<VehicleRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [vin, setVin] = useState('')
  const [scanning, setScanning] = useState(false)
  const [decoding, setDecoding] = useState(false)
  const [decoded, setDecoded] = useState<{ year: string | null; make: string | null; model: string | null; bodyClass: string | null } | null>(null)
  const [decodeFailed, setDecodeFailed] = useState(false)

  // Reset every time the sheet opens.
  useEffect(() => {
    if (!isOpen) return
    setStep(plan.hasPlatform ? 'pick' : 'vin')
    setSearch('')
    setVin('')
    setDecoded(null)
    setDecodeFailed(false)
  }, [isOpen, plan.hasPlatform])

  useEffect(() => {
    if (!isOpen || !plan.hasPlatform || !companyId) return
    let cancelled = false
    setVehicles(null)
    setLoadError(null)
    createClient()
      .from('storage_vehicles')
      .select('id, vin, year, make, model, work_order_status')
      .eq('company_id', companyId)
      .neq('work_order_status', 'released')
      .order('arrived_at', { ascending: false, nullsFirst: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setLoadError(error.message)
        else setVehicles((data ?? []) as VehicleRow[])
      })
    return () => { cancelled = true }
  }, [isOpen, plan.hasPlatform, companyId])

  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const needle = search.trim().toUpperCase()
  const filtered = useMemo(() => (vehicles ?? []).filter(v => {
    if (!needle) return true
    return [v.vin, v.year, v.make, v.model].filter(Boolean).join(' ').toUpperCase().includes(needle)
  }), [vehicles, needle])

  const setVinValue = async (raw: string) => {
    const cleaned = raw.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase().slice(0, 17)
    setVin(cleaned)
    setDecoded(null)
    setDecodeFailed(false)
    if (!isValidVin(cleaned)) return
    setDecoding(true)
    try {
      const result = await decodeVINAction(cleaned)
      if (result) setDecoded({ year: result.year ?? null, make: result.make ?? null, model: result.model ?? null, bodyClass: result.bodyClass ?? null })
      else setDecodeFailed(true)
    } catch {
      setDecodeFailed(true)
    } finally {
      setDecoding(false)
    }
  }

  const startWithVin = () => {
    if (!isValidVin(vin)) return
    // A lot account typing a VIN it already has uses that vehicle, no new unit.
    const existing = (vehicles ?? []).find(v => v.vin?.toUpperCase() === vin)
    onSelect({
      vehicleId: existing?.id,
      vin,
      year: decoded?.year ?? (existing?.year != null ? String(existing.year) : null),
      make: decoded?.make ?? existing?.make ?? null,
      model: decoded?.model ?? existing?.model ?? null,
      bodyClass: decoded?.bodyClass ?? null,
    })
  }

  if (!isOpen) return null

  const title = step === 'pick' ? 'Start Inspection' : step === 'confirm-new' ? 'Add a new vehicle?' : 'Enter the VIN'
  const vinIsInInventory = plan.hasPlatform && (vehicles ?? []).some(v => v.vin?.toUpperCase() === vin)

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.65)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div role="dialog" aria-labelledby="start-inspection-title" style={{
        position: 'relative', background: WHITE, borderRadius: '24px 24px 0 0',
        paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        width: '100%', maxWidth: 560, margin: '0 auto',
      }}>
        <div style={{ width: 40, height: 4, background: GRAY_300, borderRadius: 2, margin: '12px auto 0' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px 12px', borderBottom: `1px solid ${GRAY_100}` }}>
          {plan.hasPlatform && step !== 'pick' && (
            <button onClick={() => setStep('pick')} aria-label="Back" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
              <ArrowLeft size={18} color={GRAY_700} />
            </button>
          )}
          <p id="start-inspection-title" style={{ fontSize: 16, fontWeight: 700, color: GRAY_900, margin: 0, flex: 1 }}>{title}</p>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <X size={18} color={GRAY_500} />
          </button>
        </div>

        {step === 'pick' && (
          <>
            <div style={{ padding: '12px 20px 8px', position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 32, top: '50%', transform: 'translateY(-30%)', color: GRAY_500 }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search VIN, year, make or model"
                aria-label="Search vehicles"
                style={{ width: '100%', height: 42, paddingLeft: 36, paddingRight: 12, borderRadius: 10, border: `1px solid ${GRAY_300}`, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ overflowY: 'auto', flex: 1, minHeight: 120 }}>
              {loadError && <p style={{ padding: '16px 20px', fontSize: 13, color: DANGER, margin: 0 }}>Could not load vehicles: {loadError}</p>}
              {!loadError && vehicles === null && (
                <div style={{ padding: 28, display: 'flex', justifyContent: 'center' }}><Loader2 size={22} color={GRAY_500} className="animate-spin" /></div>
              )}
              {vehicles !== null && filtered.length === 0 && (
                <p style={{ padding: '24px 20px', textAlign: 'center', fontSize: 14, color: GRAY_500, margin: 0 }}>
                  {needle ? 'No vehicle matches that search.' : 'No active vehicles on your lot.'}
                </p>
              )}
              {filtered.map(v => (
                <button key={v.id} onClick={() => onSelect({ vehicleId: v.id, vin: v.vin, year: v.year != null ? String(v.year) : null, make: v.make, model: v.model })}
                  style={{ width: '100%', padding: '13px 20px', background: 'none', border: 'none', borderBottom: `1px solid ${GRAY_100}`, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: GRAY_900, margin: '0 0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {[v.year, v.make, v.model].filter(Boolean).join(' ') || v.vin}
                    </p>
                    <p style={{ fontSize: 12, color: GRAY_500, margin: 0, fontFamily: 'monospace' }}>{v.vin}</p>
                  </div>
                  <ChevronRight size={16} color={GRAY_500} />
                </button>
              ))}
            </div>
            <div style={{ padding: '12px 20px 0' }}>
              <button onClick={() => setStep('confirm-new')}
                style={{ width: '100%', background: 'none', border: 'none', color: PRIMARY, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 6 }}>
                Vehicle not listed? Add a new VIN
              </button>
            </div>
          </>
        )}

        {step === 'confirm-new' && (
          <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', gap: 12, background: WARN_LIGHT, borderRadius: 12, padding: 14, marginBottom: 18 }}>
              <AlertTriangle size={20} color={WARN_DARK} style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 14, color: WARN_DARK, margin: 0, lineHeight: 1.5 }}>
                Inspecting a vehicle that is not in your inventory adds it to your lot as a new unit, and it uses a billed vehicle slot on your plan.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep('pick')}
                style={{ flex: 1, height: 46, borderRadius: 12, border: `1.5px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Pick from my vehicles
              </button>
              <button onClick={() => setStep('vin')}
                style={{ flex: 1, height: 46, borderRadius: 12, border: 'none', background: PRIMARY, color: WHITE, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Add it to my lot
              </button>
            </div>
          </div>
        )}

        {step === 'vin' && (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={vin}
                onChange={e => setVinValue(e.target.value)}
                placeholder="17-character VIN"
                aria-label="VIN"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                style={{ flex: 1, height: 48, borderRadius: 10, border: `1.5px solid ${isValidVin(vin) ? PRIMARY : GRAY_300}`, padding: '0 12px', fontSize: 16, fontFamily: 'monospace', letterSpacing: 1, outline: 'none', minWidth: 0 }}
              />
              <button onClick={() => setScanning(true)} aria-label="Scan VIN barcode"
                style={{ width: 48, height: 48, borderRadius: 10, border: `1.5px solid ${GRAY_300}`, background: WHITE, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <ScanLine size={20} color={GRAY_700} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: GRAY_500, margin: '-6px 0 0' }}>{vin.length}/17</p>

            {decoding && <p style={{ fontSize: 13, color: GRAY_500, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={14} className="animate-spin" /> Looking up the VIN…</p>}
            {decoded && (
              <div style={{ background: PRIMARY_LIGHT, borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: PRIMARY_PILL_TEXT, margin: 0 }}>
                  {[decoded.year, decoded.make, decoded.model].filter(Boolean).join(' ') || 'Vehicle found'}
                </p>
                {decoded.bodyClass && <p style={{ fontSize: 12, color: PRIMARY_PILL_TEXT, margin: '2px 0 0' }}>{decoded.bodyClass}</p>}
              </div>
            )}
            {decodeFailed && (
              <p style={{ fontSize: 13, color: GRAY_700, margin: 0 }}>The VIN could not be looked up. You can still start; enter the details on the first step.</p>
            )}
            {vinIsInInventory && <p style={{ fontSize: 13, color: GRAY_700, margin: 0 }}>This vehicle is already in your inventory. It will be used, not added again.</p>}

            <button onClick={startWithVin} disabled={!isValidVin(vin) || decoding}
              style={{
                height: 50, borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
                background: isValidVin(vin) && !decoding ? PRIMARY : GRAY_300, color: WHITE,
                cursor: isValidVin(vin) && !decoding ? 'pointer' : 'not-allowed',
              }}>
              Start Inspection
            </button>
          </div>
        )}
      </div>

      {scanning && (
        <VinScanner
          onScan={scanned => { setScanning(false); setVinValue(scanned) }}
          onManualEntry={() => setScanning(false)}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Car, Plus, FileText, ChevronRight, Loader2, Search, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Option = null | 'new' | 'oneoff' | 'pick'

interface Props {
  open: boolean
  onClose: () => void
}

function daysOnLot(arrivedAt: string | null): number | null {
  if (!arrivedAt) return null
  return Math.max(0, Math.floor((Date.now() - new Date(arrivedAt).getTime()) / 86400000))
}

export default function StartInspectionSheet({ open, onClose }: Props) {
  const router = useRouter()
  const { effectiveCompany, user } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [option, setOption] = useState<Option>(null)
  const [vin, setVin] = useState('')
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [decoding, setDecoding] = useState(false)
  const [starting, setStarting] = useState(false)

  // Pick from Vehicles state
  const [vehicles, setVehicles] = useState<any[]>([])
  const [vehiclesLoading, setVehiclesLoading] = useState(false)
  const [search, setSearch] = useState('')

  const cleanVin = vin.trim().toUpperCase()

  const decode = async (v: string) => {
    setDecoding(true)
    try {
      const { decodeVINAction } = await import('@/lib/vin-actions')
      const r = await decodeVINAction(v)
      if (r) { setYear(r.year ?? ''); setMake(r.make ?? ''); setModel(r.model ?? '') }
    } finally { setDecoding(false) }
  }

  useEffect(() => {
    if (cleanVin.length === 17) decode(cleanVin)
    else { setYear(''); setMake(''); setModel('') }
  }, [cleanVin])

  const loadVehicles = useCallback(async () => {
    if (!effectiveCompany?.id) return
    setVehiclesLoading(true)
    try {
      const { data } = await createClient()
        .from('storage_vehicles')
        .select('id, vin, year, make, model, lifecycle_status, status, arrived_at')
        .eq('company_id', effectiveCompany.id)
        .not('lifecycle_status', 'in', '(released,one_off)')
        .order('arrived_at', { ascending: false })
        .limit(100)
      setVehicles(data ?? [])
    } finally { setVehiclesLoading(false) }
  }, [effectiveCompany?.id])

  useEffect(() => {
    if (option === 'pick') loadVehicles()
  }, [option])

  const reset = () => {
    setOption(null)
    setVin(''); setYear(''); setMake(''); setModel('')
    setSearch('')
  }

  const close = () => { reset(); onClose() }

  const startInspection = async (type: 'standard' | 'one_off', vehicleData?: { vin: string; year?: string; make?: string; model?: string }) => {
    if (!effectiveCompany || !user) return
    setStarting(true)
    try {
      const { initiateInspection } = await import('@/lib/usage-actions')
      const { getDeviceId } = await import('@/lib/device-id')
      const vd = vehicleData ?? (cleanVin ? { vin: cleanVin, year, make, model } : undefined)

      if (vd?.vin) {
        const { addVehicleToSystem } = await import('@/lib/storage-actions')
        await addVehicleToSystem(effectiveCompany.id, {
          vin: vd.vin, year: vd.year, make: vd.make, model: vd.model,
          lifecycleStatus: type === 'one_off' ? 'one_off' : 'in_progress',
        }).catch(() => {})
      }

      const { inspectionId } = await initiateInspection({
        companyId: effectiveCompany.id,
        inspectorId: user.id,
        initialData: vd?.vin ? { vin: vd.vin, year: vd.year, make: vd.make, model: vd.model } : undefined,
        deviceId: getDeviceId(),
      })

      try { sessionStorage.setItem('pending_inspection_id', inspectionId) } catch {}
      close()
      router.push('/vehicles')
    } catch (e: any) {
      alert('Failed to start: ' + e.message)
    } finally { setStarting(false) }
  }

  if (!open) return null

  const isInline = option === 'new' || option === 'oneoff'
  const canStart = !starting && (option === 'oneoff' || cleanVin.length === 17)

  const filteredVehicles = vehicles.filter(v => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (v.vin && v.vin.toLowerCase().includes(q)) ||
      (v.make && v.make.toLowerCase().includes(q)) ||
      (v.model && v.model.toLowerCase().includes(q)) ||
      (v.year && v.year.toString().includes(q))
    )
  })

  const sheetStyle: React.CSSProperties = isDesktop
    ? {
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 201, background: '#FFFFFF', borderRadius: 20,
        width: 480, maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(13,27,42,0.2)',
      }
    : {
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201,
        background: '#FFFFFF', borderRadius: '28px 28px 0 0',
        paddingBottom: 'env(safe-area-inset-bottom, 16px)',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 -8px 40px rgba(13,27,42,0.2)',
      }

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(13,27,42,0.6)' }} />
      <div style={sheetStyle}>
        {!isDesktop && (
          <div style={{ width: 40, height: 4, background: '#E1E8F0', borderRadius: 2, margin: '12px auto 0' }} />
        )}

        <div style={{ padding: '20px 20px 4px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            {(isInline || option === 'pick') ? (
              <button onClick={reset}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#00B4D8', fontSize: 13, fontFamily: 'inherit', fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeft size={14} /> Back
              </button>
            ) : <div />}
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>New Inspection</h2>
            <div style={{ width: 48 }} />
          </div>

          {/* Option menu */}
          {!isInline && option !== 'pick' && (
            <>
              <button onClick={() => setOption('pick')}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 14px', borderRadius: 14, border: '1.5px solid #E1E8F0', background: '#FFFFFF', cursor: 'pointer', marginBottom: 10, textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Car size={20} color="#FFFFFF" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Pick from Vehicles</p>
                  <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Select an existing vehicle to inspect</p>
                </div>
                <ChevronRight size={18} color="#CBD5E1" />
              </button>

              <button onClick={() => setOption('new')}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 14px', borderRadius: 14, border: '1.5px solid #E1E8F0', background: '#FFFFFF', cursor: 'pointer', marginBottom: 10, textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: '#F4A62A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Plus size={20} color="#FFFFFF" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Add New Vehicle</p>
                  <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Enter VIN and start immediately</p>
                </div>
                <ChevronRight size={18} color="#CBD5E1" />
              </button>

              <button onClick={() => setOption('oneoff')}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 14px', borderRadius: 14, border: '1.5px solid #E1E8F0', background: '#FFFFFF', cursor: 'pointer', marginBottom: 10, textAlign: 'left', fontFamily: 'inherit' }}>
                <div style={{ width: 44, height: 44, borderRadius: 22, background: '#00B4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <FileText size={20} color="#FFFFFF" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>One-Off Report</p>
                  <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Quick report, no storage tracking</p>
                </div>
                <ChevronRight size={18} color="#CBD5E1" />
              </button>
            </>
          )}

          {/* Pick from Vehicles — inline list */}
          {option === 'pick' && (
            <div>
              {/* Search */}
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <Search size={15} color="#94A3B8" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search VIN, make, or model…"
                  style={{ width: '100%', height: 42, border: '1.5px solid #E1E8F0', borderRadius: 10, padding: '0 12px 0 36px', fontSize: 14, outline: 'none', fontFamily: 'inherit', background: '#FAFAFA', boxSizing: 'border-box' }}
                />
              </div>

              {vehiclesLoading ? (
                <div style={{ padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
                  <Loader2 size={20} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : filteredVehicles.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <Car size={28} color="#E1E8F0" style={{ margin: '0 auto 8px', display: 'block' }} />
                  <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
                    {search ? 'No vehicles match your search' : 'No inspectable vehicles found'}
                  </p>
                </div>
              ) : (
                <div style={{ maxHeight: isDesktop ? '40vh' : '45vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filteredVehicles.map(v => {
                    const title = [v.year, v.make, v.model].filter(Boolean).join(' ') || 'Unknown Vehicle'
                    const days = daysOnLot(v.arrived_at)
                    return (
                      <button
                        key={v.id}
                        disabled={starting}
                        onClick={() => startInspection('standard', { vin: v.vin, year: v.year, make: v.make, model: v.model })}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FAFAFA', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
                          <p style={{ fontSize: 12, fontFamily: 'monospace', color: '#94A3B8', margin: 0 }}>{v.vin || '—'}</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                          {days !== null && <span style={{ fontSize: 11, fontWeight: 700, color: days < 30 ? '#059669' : '#D97706' }}>{days}d</span>}
                          <ChevronRight size={14} color="#CBD5E1" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {starting && (
                <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Loader2 size={16} color="#00B4D8" style={{ animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 13, color: '#94A3B8' }}>Starting inspection…</span>
                </div>
              )}
            </div>
          )}

          {/* Add New Vehicle / One-Off inline form */}
          {isInline && (
            <div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  VIN {option === 'new' ? '*' : '(optional)'}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    value={vin}
                    onChange={e => setVin(e.target.value.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase().slice(0, 17))}
                    placeholder="17-character VIN"
                    maxLength={17}
                    style={{ width: '100%', height: 44, border: '1.5px solid #E1E8F0', borderRadius: 10, padding: '0 40px 0 12px', fontSize: 14, fontFamily: 'monospace', outline: 'none', background: '#FAFAFA', boxSizing: 'border-box' }}
                  />
                  {decoding && (
                    <Loader2 size={15} color="#00B4D8" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', animation: 'spin 0.8s linear infinite' }} />
                  )}
                </div>
              </div>

              {(year || make || model) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {([['Year', year, setYear], ['Make', make, setMake], ['Model', model, setModel]] as const).map(([lbl, val, setter]) => (
                    <div key={lbl as string}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{lbl as string}</label>
                      <input value={val as string} onChange={e => (setter as any)(e.target.value)}
                        style={{ width: '100%', height: 40, border: '1.5px solid #E1E8F0', borderRadius: 8, padding: '0 8px', fontSize: 13, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => startInspection(option === 'oneoff' ? 'one_off' : 'standard')}
                disabled={!canStart}
                style={{
                  width: '100%', height: 52, borderRadius: 14, border: 'none',
                  background: canStart ? '#F4A62A' : '#E1E8F0',
                  color: canStart ? '#0D1B2A' : '#94A3B8',
                  fontWeight: 700, fontSize: 16, cursor: canStart ? 'pointer' : 'default',
                  fontFamily: 'inherit', marginBottom: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {starting
                  ? <><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /> Starting…</>
                  : 'Start Inspection'}
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: '4px 20px 16px' }}>
          <button onClick={close}
            style={{ width: '100%', height: 48, borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FFFFFF', color: '#4A5568', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ScanLine, Keyboard } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import VinScanner, { isValidVin } from '@/components/ui/vin-scanner'
import { addVehicleToSystem } from '@/lib/storage-actions'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'

// Walk-up / tow-in entry point — no pre-existing work order needed. Resolves or
// creates both vehicle_master (via addVehicleToSystem -> resolveVehicleMasterId)
// and the storage_vehicles work order (addVehicleToSystem's existing find-or-create
// dedup, reused as-is rather than reimplemented), then hands off to the same
// shared checkpoint form used by the existing-vehicle flow.
export default function WalkUpIntakePage() {
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { effectiveCompany } = useAuth()

  const [mode, setMode] = useState<'choose' | 'scan' | 'manual'>('choose')
  const [manualVin, setManualVin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  const handleVin = async (vin: string) => {
    if (!effectiveCompany) return
    setResolving(true)
    setError(null)
    try {
      const vehicleId = await addVehicleToSystem(effectiveCompany.id, { vin })
      if (!vehicleId) throw new Error('Could not create work order')
      router.push(`/inventory/${vehicleId}/checkpoint/intake`)
    } catch (e: any) {
      setError(e.message ?? 'Something went wrong')
      setResolving(false)
    }
  }

  const submitManual = () => {
    const vin = manualVin.trim().toUpperCase()
    if (!isValidVin(vin)) { setError('Enter a valid 17-character VIN.'); return }
    handleVin(vin)
  }

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <div style={{ padding: 24, maxWidth: 420, margin: '0 auto', paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0D1B2A', margin: '0 0 4px' }}>New Intake</h1>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 24px' }}>Scan or enter the VIN to start.</p>

        {error && (
          <p style={{ fontSize: 13, color: '#EF4444', background: '#FEE2E2', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{error}</p>
        )}

        {resolving ? (
          <p style={{ fontSize: 14, color: '#94A3B8', textAlign: 'center' }}>Looking up vehicle…</p>
        ) : mode === 'manual' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              value={manualVin}
              onChange={e => setManualVin(e.target.value.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase().slice(0, 17))}
              placeholder="17-character VIN" maxLength={17}
              style={{ height: 48, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 14px', fontSize: 15, fontFamily: 'monospace', outline: 'none' }}
            />
            <button
              onClick={submitManual}
              disabled={manualVin.length !== 17}
              style={{ height: 48, borderRadius: 10, border: 'none', background: '#00B4D8', color: '#FFFFFF', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: manualVin.length !== 17 ? 0.5 : 1, fontFamily: 'inherit' }}
            >
              Continue
            </button>
            <button onClick={() => setMode('choose')} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Back
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => setMode('scan')}
              style={{ height: 56, borderRadius: 12, border: 'none', background: '#00B4D8', color: '#FFFFFF', fontWeight: 700, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'inherit' }}
            >
              <ScanLine size={20} /> Scan VIN Barcode
            </button>
            <button
              onClick={() => setMode('manual')}
              style={{ height: 56, borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FFFFFF', color: '#374151', fontWeight: 600, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontFamily: 'inherit' }}
            >
              <Keyboard size={18} /> Enter VIN Manually
            </button>
          </div>
        )}
      </div>
      {!isDesktop && <BottomNav />}

      {mode === 'scan' && (
        <VinScanner
          onScan={handleVin}
          onManualEntry={() => setMode('manual')}
          onClose={() => setMode('choose')}
        />
      )}
    </>
  )
}

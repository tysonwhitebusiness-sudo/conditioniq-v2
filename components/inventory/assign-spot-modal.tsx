'use client'

import { useEffect, useState } from 'react'
import { X, Wand2 } from 'lucide-react'
import { getLotSpots, getLotShapes, assignVehicleToSpot, suggestSpotForVehicle } from '@/lib/lot-actions'
import type { LotSpot, LotShape } from '@/lib/lot-actions'

interface Props {
  vehicleId: string
  customerId: string | null
  companyId: string
  userId: string
  onClose: () => void
  onAssigned: () => void
}

export default function AssignSpotModal({ vehicleId, customerId, companyId, userId, onClose, onAssigned }: Props) {
  const [allSpots, setAllSpots] = useState<LotSpot[]>([])
  const [shapes, setShapes] = useState<LotShape[]>([])
  const [loading, setLoading] = useState(true)
  const [savingSpotId, setSavingSpotId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getLotSpots(companyId), getLotShapes(companyId)]).then(([spots, sh]) => {
      setAllSpots(spots); setShapes(sh); setLoading(false)
    })
  }, [companyId])

  const emptySpots = allSpots.filter(s => !s.active_assignment)
  // vehicle_master isn't fetched on this page's vehicle query, so size-class
  // matching is skipped here — suggestSpotForVehicle treats that as "no
  // constraint" rather than a wrong one.
  const suggested = suggestSpotForVehicle({ customer_id: customerId, vehicle_master: null }, emptySpots, allSpots, shapes)

  const handleAssign = async (spotId: string) => {
    setSavingSpotId(spotId)
    await assignVehicleToSpot(spotId, vehicleId, userId)
    onAssigned()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,27,42,0.5)' }}>
      <div style={{ background: '#FFF', borderRadius: 16, width: 420, maxWidth: '90vw', maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(13,27,42,0.2)' }}>
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #E1E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Assign Spot</h3>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 16, background: '#F0F4F8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#4A5568" />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading ? (
            <p style={{ fontSize: 14, color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>Loading spots…</p>
          ) : emptySpots.length === 0 ? (
            <p style={{ fontSize: 14, color: '#94A3B8', textAlign: 'center', padding: '24px 0' }}>No empty spots available.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {suggested && (
                <button
                  onClick={() => handleAssign(suggested.id)}
                  disabled={savingSpotId !== null}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px',
                    border: '1.5px solid #00B4D8', borderRadius: 10, background: '#E0F7FC',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <Wand2 size={15} color="#00B4D8" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0097B2' }}>
                    {savingSpotId === suggested.id ? 'Assigning…' : `Suggested: Spot ${suggested.label}`}
                  </span>
                </button>
              )}
              {emptySpots.filter(s => s.id !== suggested?.id).map(s => (
                <button
                  key={s.id}
                  onClick={() => handleAssign(s.id)}
                  disabled={savingSpotId !== null}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px',
                    border: '1px solid #E1E8F0', borderRadius: 10, background: '#FFF',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A' }}>Spot {s.label}</span>
                  <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'capitalize' }}>{s.size_class}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

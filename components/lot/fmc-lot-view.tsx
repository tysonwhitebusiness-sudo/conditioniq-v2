'use client'

import { useEffect, useState } from 'react'
import { MapPin, ChevronRight } from 'lucide-react'
import { getStorageLocations } from '@/lib/storage-actions'
import type { StorageLocation } from '@/lib/storage-actions'
import StorageLotView from './storage-lot-view'
import { getLotOccupancy } from '@/lib/lot-actions'

interface LocationWithOccupancy extends StorageLocation {
  occupied: number
  total: number
}

interface Props {
  companyId: string
}

export default function FmcLotView({ companyId }: Props) {
  const [locations, setLocations] = useState<LocationWithOccupancy[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    getStorageLocations(companyId).then(async locs => {
      const enriched = await Promise.all(
        locs.map(async loc => {
          const occ = await getLotOccupancy(companyId, loc.id)
          return { ...loc, ...occ }
        })
      )
      setLocations(enriched)
      setLoading(false)
    })
  }, [companyId])

  const selected = locations.find(l => l.id === selectedId) ?? null

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>

      {/* Panel 1 — Location list */}
      <div style={{
        width: 280, flexShrink: 0, borderRight: '1px solid #E1E8F0',
        display: 'flex', flexDirection: 'column', background: '#FFF',
      }}>
        <div style={{ padding: '20px 16px 14px', borderBottom: '1px solid #E1E8F0' }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>Locations</h2>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 64, background: '#F0F4F8', borderRadius: 10, marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))
          ) : locations.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center' }}>
              <MapPin size={24} color="#94A3B8" style={{ display: 'block', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No locations found</p>
            </div>
          ) : (
            locations.map(loc => {
              const isActive = selectedId === loc.id
              return (
                <button
                  key={loc.id}
                  onClick={() => setSelectedId(loc.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 12px', borderRadius: 10, border: 'none',
                    background: isActive ? 'rgba(0,180,216,0.08)' : 'transparent',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    marginBottom: 2, transition: 'background 120ms',
                    borderLeft: isActive ? '3px solid #00B4D8' : '3px solid transparent',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: isActive ? '#00B4D8' : '#0D1B2A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {loc.name}
                    </p>
                    {(loc.city || loc.state) && (
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>{[loc.city, loc.state].filter(Boolean).join(', ')}</p>
                    )}
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }}>
                      {loc.occupied}/{loc.total} occupied
                    </p>
                  </div>
                  <ChevronRight size={14} color={isActive ? '#00B4D8' : '#94A3B8'} />
                </button>
              )
            })
          )}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
      </div>

      {/* Panel 2+3 — selected location detail + lot grid */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!selected ? (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapPin size={24} color="#94A3B8" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>Select a location</p>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Choose a location on the left to view its lot map</p>
          </div>
        ) : (
          <StorageLotView
            companyId={companyId}
            locationId={selected.id}
          />
        )}
      </div>
    </div>
  )
}

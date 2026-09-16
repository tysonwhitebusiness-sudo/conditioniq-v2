import Link from 'next/link'
import type { ScanVehicle } from '@/lib/qr-actions'

const MIDNIGHT = '#0D1B2A'
const CYAN = '#00B4D8'

export default function ClosedRecordView({ vehicle }: { vehicle: ScanVehicle }) {
  const releasedDate = vehicle.released_at
    ? new Date(vehicle.released_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div style={{
      minHeight: '100vh', background: '#F0F4F8', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{
        maxWidth: 380, width: '100%', background: '#FFFFFF', borderRadius: 20,
        border: '1px solid #E1E8F0', padding: 28, textAlign: 'center',
        boxShadow: '0 4px 24px rgba(13,27,42,0.08)',
      }}>
        <p style={{
          fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase',
          letterSpacing: '0.08em', margin: '0 0 6px',
        }}>
          {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
        </p>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 20px', fontFamily: 'monospace' }}>{vehicle.vin}</p>

        <h1 style={{ fontSize: 18, fontWeight: 700, color: MIDNIGHT, margin: '0 0 8px' }}>This record is closed</h1>
        <p style={{ fontSize: 14, color: '#64748B', margin: '0 0 24px' }}>
          {releasedDate ? `Released on ${releasedDate}.` : 'This vehicle has been released.'}
        </p>

        <Link href={`/inventory/${vehicle.id}`} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          height: 44, padding: '0 20px', borderRadius: 12, background: MIDNIGHT,
          color: '#FFFFFF', textDecoration: 'none', fontSize: 14, fontWeight: 700,
        }}>
          View Full Record
        </Link>
      </div>
    </div>
  )
}

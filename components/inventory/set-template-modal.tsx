'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { VehicleTemplate } from '@/lib/damage-actions'

const OPTIONS: { value: VehicleTemplate; label: string }[] = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
  { value: 'van', label: 'Van' },
]

interface Props {
  onClose: () => void
  onSelect: (template: VehicleTemplate) => Promise<void> | void
}

// The checkpoint/intake and checkpoint/outtake routes both dead-end with
// "no body-type template set" if vehicle_master.vehicle_template is unset —
// which is common, since nothing else in the app requires setting it. Rather
// than let Start Intake / Run Outtake hit that dead-end (now a primary hero
// action, so this would happen far more often), prompt for it inline first.
export default function SetTemplateModal({ onClose, onSelect }: Props) {
  const [saving, setSaving] = useState(false)

  const handlePick = async (t: VehicleTemplate) => {
    setSaving(true)
    await onSelect(t)
    setSaving(false)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(13,27,42,0.5)', padding: 20 }}>
      <div style={{ background: '#FFF', borderRadius: 16, width: '100%', maxWidth: 360, padding: 24, boxShadow: '0 16px 48px rgba(13,27,42,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Vehicle Body Type</h3>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 14, background: '#F0F4F8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color="#4A5568" />
          </button>
        </div>
        <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 18px', lineHeight: 1.5 }}>
          Needed once so the damage tagger knows which diagram to use. You can change this later.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {OPTIONS.map(o => (
            <button
              key={o.value}
              disabled={saving}
              onClick={() => handlePick(o.value)}
              style={{
                height: 46, borderRadius: 10, border: '1.5px solid #E1E8F0', background: '#FAFAFA',
                color: '#0D1B2A', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
                opacity: saving ? 0.6 : 1,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

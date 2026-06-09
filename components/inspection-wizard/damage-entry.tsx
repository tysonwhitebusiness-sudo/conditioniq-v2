'use client'

import { useState } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import PhotoField from '@/components/ui/photo-field'

const DAMAGE_TYPES = ['scratch', 'dent', 'rust', 'crack', 'missing_part', 'glass_damage', 'tire_damage', 'paint_damage', 'other']
const SEVERITIES = ['minor', 'moderate', 'major', 'critical']
const IMPACTS = ['cosmetic', 'functional', 'safety']

const EXTERIOR_LOCATIONS = [
  'hood', 'roof', 'trunk', 'front_bumper', 'rear_bumper',
  'driver_door_front', 'driver_door_rear', 'passenger_door_front', 'passenger_door_rear',
  'driver_fender', 'passenger_fender', 'driver_quarter_panel', 'passenger_quarter_panel',
  'windshield', 'rear_windshield', 'driver_window', 'passenger_window',
  'driver_mirror', 'passenger_mirror', 'driver_tire', 'passenger_tire', 'rear_driver_tire', 'rear_passenger_tire',
]

const INTERIOR_LOCATIONS = [
  'driver_seat', 'passenger_seat', 'rear_seat_left', 'rear_seat_right',
  'dashboard', 'center_console', 'headliner', 'carpet_floor',
  'door_panel_driver', 'door_panel_passenger', 'steering_wheel', 'trunk_interior',
]

interface Damage {
  id: string
  type: string
  severity: string
  location: string
  estimatedImpact: string
  description: string
  photo?: string
}

interface Props {
  damages: Damage[]
  onChange: (damages: Damage[]) => void
  locationType?: 'exterior' | 'interior'
}

const SEVERITY_COLORS: Record<string, string> = {
  minor: 'bg-yellow-100 text-yellow-700',
  moderate: 'bg-orange-100 text-orange-700',
  major: 'bg-red-100 text-red-700',
  critical: 'bg-red-900 text-white',
}

export default function DamageEntry({ damages, onChange, locationType = 'exterior' }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const locations = locationType === 'exterior' ? EXTERIOR_LOCATIONS : INTERIOR_LOCATIONS

  const addDamage = () => {
    const id = crypto.randomUUID()
    const newDamage: Damage = { id, type: 'scratch', severity: 'minor', location: locations[0], estimatedImpact: 'cosmetic', description: '' }
    onChange([...damages, newDamage])
    setExpanded(id)
  }

  const updateDamage = (id: string, updates: Partial<Damage>) => {
    onChange(damages.map(d => d.id === id ? { ...d, ...updates } : d))
  }

  const removeDamage = (id: string) => {
    onChange(damages.filter(d => d.id !== id))
  }

  const hasDuplicate = (d: Damage) =>
    damages.filter(x => x.id !== d.id && x.type === d.type && x.location === d.location).length > 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Damage Items ({damages.length})</h3>
        <button
          type="button"
          onClick={addDamage}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
        >
          <Plus size={16} /> Add Damage
        </button>
      </div>

      {damages.map(damage => (
        <div key={damage.id} className="border border-gray-200 rounded-xl overflow-hidden">
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
            onClick={() => setExpanded(expanded === damage.id ? null : damage.id)}
          >
            <div className="flex items-center gap-2">
              {hasDuplicate(damage) && <AlertTriangle size={14} className="text-yellow-500" />}
              <span className="text-sm font-medium capitalize">{damage.type.replace('_', ' ')}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${SEVERITY_COLORS[damage.severity] ?? 'bg-gray-100'}`}>
                {damage.severity}
              </span>
              <span className="text-xs text-gray-400 capitalize">{damage.location.replace(/_/g, ' ')}</span>
            </div>
            <button onClick={e => { e.stopPropagation(); removeDamage(damage.id) }} className="text-red-400 hover:text-red-600 p-1">
              <Trash2 size={14} />
            </button>
          </div>

          {expanded === damage.id && (
            <div className="p-4 space-y-3 border-t border-gray-100">
              {hasDuplicate(damage) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 text-xs text-yellow-700 flex gap-2">
                  <AlertTriangle size={14} /> Duplicate: same type and location already recorded
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Type</label>
                  <select
                    value={damage.type}
                    onChange={e => updateDamage(damage.id, { type: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {DAMAGE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Severity</label>
                  <select
                    value={damage.severity}
                    onChange={e => updateDamage(damage.id, { severity: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Location</label>
                  <select
                    value={damage.location}
                    onChange={e => updateDamage(damage.id, { location: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {locations.map(l => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Impact</label>
                  <select
                    value={damage.estimatedImpact}
                    onChange={e => updateDamage(damage.id, { estimatedImpact: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  >
                    {IMPACTS.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Description</label>
                <textarea
                  value={damage.description}
                  onChange={e => updateDamage(damage.id, { description: e.target.value })}
                  rows={2}
                  placeholder="Describe the damage..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
              <PhotoField
                label="Damage Photo"
                value={damage.photo}
                onChange={url => updateDamage(damage.id, { photo: url })}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

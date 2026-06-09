'use client'

import { Minus, Plus } from 'lucide-react'
import PhotoField from '@/components/ui/photo-field'

interface Props {
  data: Record<string, any>
  onChange: (data: Record<string, any>) => void
  onNext: () => void
  onBack: () => void
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
      <span className="font-medium text-gray-800">{label}</span>
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(0, value - 1))}
          className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300"
        >
          <Minus size={18} />
        </button>
        <span className="text-2xl font-bold text-gray-900 w-8 text-center">{value}</span>
        <button
          onClick={() => onChange(value + 1)}
          className="w-10 h-10 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center hover:bg-[#162d4a]"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  )
}

export default function StepKeys({ data, onChange, onNext, onBack }: Props) {
  return (
    <div className="space-y-5 pb-24">
      <Counter
        label="Mechanical Keys"
        value={data.mechanicalKeys ?? 0}
        onChange={v => onChange({ ...data, mechanicalKeys: v })}
      />
      <Counter
        label="Key FOBs"
        value={data.keyFobs ?? 0}
        onChange={v => onChange({ ...data, keyFobs: v })}
      />
      <PhotoField
        label="Keys Photo"
        value={data.keysPhoto}
        onChange={url => onChange({ ...data, keysPhoto: url })}
      />

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 flex gap-3">
        <button onClick={onBack} className="flex-1 py-4 rounded-2xl border border-gray-200 text-gray-700 font-semibold">Back</button>
        <button onClick={onNext} className="flex-1 py-4 rounded-2xl bg-[#1e3a5f] text-white font-semibold">
          Continue
        </button>
      </div>
    </div>
  )
}

'use client'

import { Ghost, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'

export default function GhostBanner() {
  const { impersonatedCompany, setImpersonatedCompany } = useAuth()
  if (!impersonatedCompany) return null

  return (
    <div className="bg-purple-600 text-white px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        <Ghost size={16} />
        <span>Ghost mode: viewing as <strong>{impersonatedCompany.name}</strong></span>
      </div>
      <button
        onClick={() => setImpersonatedCompany(null)}
        className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-xs"
      >
        <X size={12} /> Exit
      </button>
    </div>
  )
}

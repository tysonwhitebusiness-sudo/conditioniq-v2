'use client'

import { useState, useEffect } from 'react'
import { getCRMLeads, updateLeadStatus } from '@/lib/crm-actions'

const COLUMNS = [
  { key: 'new', label: 'New', color: 'border-gray-500' },
  { key: 'contacted', label: 'Contacted', color: 'border-blue-500' },
  { key: 'demo_sent', label: 'Demo Sent', color: 'border-purple-500' },
  { key: 'trial_active', label: 'Trial Active', color: 'border-green-500' },
  { key: 'converted', label: 'Converted', color: 'border-emerald-500' },
]

export default function PipelinePage() {
  const [leads, setLeads] = useState<any[]>([])
  const [dragging, setDragging] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCRMLeads({ limit: 500 }).then(({ leads: data }) => { setLeads(data); setLoading(false) })
  }, [])

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragging(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDrop = async (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault()
    if (!dragging) return
    const lead = leads.find(l => l.id === dragging)
    if (!lead || lead.status === targetStatus) return
    setLeads(prev => prev.map(l => l.id === dragging ? { ...l, status: targetStatus } : l))
    await updateLeadStatus(dragging, targetStatus)
    setDragging(null)
  }

  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>

  return (
    <div className="p-6 max-w-full">
      <h1 className="text-2xl font-bold text-white mb-6">Pipeline</h1>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(col => {
          const colLeads = leads.filter(l => l.status === col.key)
          return (
            <div
              key={col.key}
              className="flex-shrink-0 w-64"
              onDrop={e => handleDrop(e, col.key)}
              onDragOver={handleDragOver}
            >
              <div className={`flex items-center justify-between mb-3 pb-2 border-b-2 ${col.color}`}>
                <span className="text-sm font-semibold text-white">{col.label}</span>
                <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">{colLeads.length}</span>
              </div>
              <div className="space-y-2 min-h-24">
                {colLeads.map(lead => (
                  <a
                    key={lead.id}
                    href={`/admin/crm/leads/${lead.id}`}
                    draggable
                    onDragStart={e => handleDragStart(e, lead.id)}
                    className="block bg-gray-800 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:bg-gray-750 group"
                  >
                    <p className="text-sm font-medium text-white truncate">{lead.first_name} {lead.last_name}</p>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{lead.company}</p>
                    {lead.crm_email_touches?.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {Array.from({ length: Math.min(3, lead.crm_email_touches.length) }).map((_, i) => (
                          <div key={i} className={`w-2 h-2 rounded-full ${lead.crm_email_touches[i]?.replied ? 'bg-green-400' : 'bg-blue-400'}`} />
                        ))}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

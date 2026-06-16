'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { getPipelineLeads, updateLeadStatusAndLog } from '@/lib/crm-actions'

const STAGES = [
  { key: 'new',            label: 'New',            bg: '#F8FAFC', border: '#E1E8F0' },
  { key: 'contacted',      label: 'Contacted',      bg: '#F8FAFC', border: '#E1E8F0' },
  { key: 'demo_sent',      label: 'Demo Sent',      bg: '#F8FAFC', border: '#E1E8F0' },
  { key: 'trial_active',   label: 'Trial Active',   bg: '#F8FAFC', border: '#E1E8F0' },
  { key: 'proposal',       label: 'Proposal',       bg: '#F8FAFC', border: '#E1E8F0' },
  { key: 'converted',      label: 'Converted',      bg: '#F0FDF4', border: '#A7F3D0' },
  { key: 'not_interested', label: 'Not Interested', bg: '#F0F4F8', border: '#E1E8F0' },
]

const PRIORITY_CFG: Record<string, { bg: string; color: string }> = {
  P0: { bg: '#FEE2E2', color: '#DC2626' },
  P1: { bg: '#FEF3C7', color: '#D97706' },
  P2: { bg: '#F0F4F8', color: '#4A5568' },
}

interface PipelineLead {
  id: string
  first_name: string
  last_name: string
  company: string
  job_title: string
  priority: string
  status: string
  company_type: string
  pinned: boolean
}

function LeadCard({ lead, isDragging }: { lead: PipelineLead; isDragging?: boolean }) {
  const router = useRouter()
  const pc = PRIORITY_CFG[lead.priority] ?? PRIORITY_CFG.P2
  return (
    <div
      style={{
        background: '#FFF',
        border: '1px solid #E1E8F0',
        borderRadius: 12,
        padding: 12,
        cursor: 'grab',
        boxShadow: isDragging ? '0 8px 24px rgba(13,27,42,0.18)' : '0 1px 3px rgba(13,27,42,0.06)',
        opacity: isDragging ? 0.9 : 1,
        userSelect: 'none',
      }}
      onClick={() => router.push(`/admin/crm/leads/${lead.id}`)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0D1B2A', lineHeight: 1.3 }}>
          {lead.first_name} {lead.last_name}
        </p>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: pc.bg, color: pc.color, flexShrink: 0 }}>
          {lead.priority}
        </span>
      </div>
      {lead.company && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#4A5568', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.company}</p>}
      {lead.job_title && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.job_title}</p>}
    </div>
  )
}

function DraggableCard({ lead }: { lead: PipelineLead }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: { lead } })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <LeadCard lead={lead} isDragging={isDragging} />
    </div>
  )
}

function Column({ stage, leads }: { stage: typeof STAGES[number]; leads: PipelineLead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 220, flex: '0 0 220px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#4A5568' }}>{stage.label}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', background: '#F0F4F8', borderRadius: 10, padding: '1px 7px' }}>{leads.length}</span>
      </div>
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          minHeight: 200,
          background: isOver ? '#EFF8FF' : stage.bg,
          border: `1px solid ${isOver ? '#00B4D8' : stage.border}`,
          borderRadius: 14,
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          transition: 'background 150ms, border-color 150ms',
        }}
      >
        {leads.map(lead => <DraggableCard key={lead.id} lead={lead} />)}
      </div>
    </div>
  )
}

export default function Pipeline() {
  const [leads, setLeads] = useState<PipelineLead[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const load = useCallback(async () => {
    const data = await getPipelineLeads()
    setLeads((data as unknown as PipelineLead[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const byStage = (stageKey: string) => leads.filter(l => l.status === stageKey)
  const activeLead = leads.find(l => l.id === activeId)

  const handleDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string)

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const leadId = active.id as string
    const newStatus = over.id as string
    const lead = leads.find(l => l.id === leadId)
    if (!lead || lead.status === newStatus) return
    const oldStatus = lead.status
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l))
    await updateLeadStatusAndLog(leadId, newStatus, oldStatus)
  }

  if (loading) return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 16 }}>
        {STAGES.map(s => <div key={s.key} style={{ minWidth: 220, height: 400, background: '#E2E8F0', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
    </div>
  )

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>Pipeline</h1>
        <span style={{ fontSize: 12, color: '#94A3B8' }}>{leads.length} leads</span>
      </div>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 24, alignItems: 'flex-start' }}>
          {STAGES.map(stage => (
            <Column key={stage.key} stage={stage} leads={byStage(stage.key)} />
          ))}
        </div>
        <DragOverlay>
          {activeLead && <LeadCard lead={activeLead} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

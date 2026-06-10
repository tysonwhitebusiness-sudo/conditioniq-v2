'use client'

interface StatusBadgeProps {
  status: string
  className?: string
}

const CONFIGS: Record<string, { label: string; bg: string; text: string }> = {
  queued:           { label: 'Queued',          bg: '#F0F4F8', text: '#4A5568' },
  pending_arrival:  { label: 'Pending Arrival', bg: '#F0F4F8', text: '#4A5568' },
  in_progress: { label: 'In Progress', bg: '#FEF3C7', text: '#92400E' },
  completed:   { label: 'Completed',   bg: '#D1FAE5', text: '#065F46' },
  failed:      { label: 'Failed',      bg: '#FEE2E2', text: '#991B1B' },
  pending:     { label: 'Pending',     bg: '#E0F7FC', text: '#0097B2' },
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = CONFIGS[status] ?? { label: status, bg: '#F0F4F8', text: '#4A5568' }
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${className}`}
      style={{ background: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  )
}

export function ScoreBadge({ score }: { score: number }) {
  const bg = score >= 80 ? '#D1FAE5' : score >= 60 ? '#FEF3C7' : '#FEE2E2'
  const color = score >= 80 ? '#065F46' : score >= 60 ? '#92400E' : '#991B1B'
  return (
    <div
      className="w-11 h-11 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
      style={{ background: bg }}
    >
      <span className="text-base font-black leading-none" style={{ color }}>{score}</span>
      <span className="text-[8px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: '#94A3B8' }}>score</span>
    </div>
  )
}

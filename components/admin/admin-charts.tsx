'use client'

import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { PRIMARY, WHITE, GRAY_900, GRAY_500, GRAY_300 } from '@/lib/design-tokens'

// L3 · Bundle diet. Recharts is a large download that only these two panels
// need, so they live here and are loaded on demand by admin-overview.

export function MrrChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: GRAY_500 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: GRAY_500 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} width={52} />
        <Tooltip formatter={(v) => typeof v === 'number' ? [`$${v.toLocaleString()}`, 'MRR'] as [string, string] : ''} contentStyle={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 8, color: GRAY_900, fontSize: 12 }} />
        <Bar dataKey="mrr" fill={PRIMARY} activeBar={{ fill: '#0097B2' }} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function PlanBreakdownChart({ data, colors }: { data: any[]; colors: Record<string, string> }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65}>
          {data.map((entry, i) => <Cell key={i} fill={colors[entry.name] ?? GRAY_500} />)}
        </Pie>
        <Tooltip contentStyle={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 8, color: GRAY_900, fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

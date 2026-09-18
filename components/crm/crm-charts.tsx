'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { PRIMARY, SUCCESS, GRAY_500, WHITE, SKELETON_HEADER } from '@/lib/design-tokens'

// L3 · Bundle diet. Kept out of the CRM screen's own download; loaded when the
// dashboard renders.

export function WeeklyVolumeChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}>
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: GRAY_500 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: GRAY_500 }} axisLine={false} tickLine={false} width={30} />
        <Tooltip contentStyle={{ background: SKELETON_HEADER, border: 'none', borderRadius: 8, color: WHITE, fontSize: 12 }} />
        <Bar dataKey="count" fill={PRIMARY} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function ReplyRateChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={SUCCESS} stopOpacity={0.15} />
            <stop offset="95%" stopColor={SUCCESS} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: GRAY_500 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: GRAY_500 }} axisLine={false} tickLine={false} width={30} tickFormatter={v => `${v}%`} />
        <Tooltip formatter={(v) => typeof v === 'number' ? [`${v}%`, 'Reply Rate'] as [string, string] : ''} contentStyle={{ background: SKELETON_HEADER, border: 'none', borderRadius: 8, color: WHITE, fontSize: 12 }} />
        <Area type="monotone" dataKey="rate" stroke={SUCCESS} strokeWidth={2} fill="url(#rg)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

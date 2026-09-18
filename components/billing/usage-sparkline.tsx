'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { LEGACY_NAVY } from '@/lib/design-tokens'

// L3 · Bundle diet. The chart library is a large download and only this one
// block on the billing screen uses it, so it lives in its own file and is
// loaded on demand.
export default function UsageSparkline({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={data} barCategoryGap={2}>
        <Bar dataKey="count" fill={LEGACY_NAVY} radius={[2, 2, 0, 0]} />
        <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis hide />
        <Tooltip formatter={(v: any) => [`${v} reports`, '']} />
      </BarChart>
    </ResponsiveContainer>
  )
}

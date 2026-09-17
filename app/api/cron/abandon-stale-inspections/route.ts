import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { releaseInspectionOnlyVehicles } from '@/lib/inspection-vehicle'

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: stale, error } = await supabase
    .from('vehicle_inspections')
    .select('id')
    .eq('status', 'in_progress')
    .lt('last_active_at', cutoff)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!stale || stale.length === 0) {
    return NextResponse.json({ abandoned: 0 })
  }

  const ids = stale.map((r: { id: string }) => r.id)
  await supabase
    .from('vehicle_inspections')
    .update({ usage_status: 'abandoned', status: 'abandoned' })
    .in('id', ids)

  // Inspection-only accounts' vehicle records close out with the inspection.
  try {
    await releaseInspectionOnlyVehicles(supabase, ids)
  } catch (e) {
    console.error('[cron] release inspection-only vehicles failed', e)
  }

  return NextResponse.json({ abandoned: ids.length })
}

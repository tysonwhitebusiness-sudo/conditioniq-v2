'use client'

import { createClient } from '@/lib/supabase/client'
import { calculateVehicleScore } from '@/lib/vehicle-score'
import { logVehicleEvent } from '@/lib/vehicle-events-actions'

export async function checkAndAutoCompleteExpired(companyId: string): Promise<void> {
  try {
    const supabase = createClient()
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: expired, error } = await supabase
      .from('vehicle_inspections')
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'in_progress')
      .is('locked_at', null)
      .lt('last_active_at', cutoff)

    if (error || !expired?.length) return

    const now = new Date().toISOString()

    await Promise.all(
      expired.map(async (inspection) => {
        const scoreResult = calculateVehicleScore(inspection)
        const { error: updateError } = await supabase
          .from('vehicle_inspections')
          .update({
            status: 'completed',
            completed_at: now,
            locked_at: now,
            auto_completed: true,
            vehicle_score: scoreResult.score,
          })
          .eq('id', inspection.id)

        if (!updateError && inspection.vin) {
          const { data: vehicle } = await supabase
            .from('storage_vehicles')
            .select('id')
            .eq('company_id', companyId)
            .eq('vin', inspection.vin)
            .maybeSingle()
          if (vehicle) {
            logVehicleEvent({
              companyId, vehicleId: vehicle.id, eventType: 'inspection_completed',
              description: 'Inspection auto-completed (inactive 24h+)',
              metadata: { inspection_id: inspection.id, score: scoreResult.score, auto_completed: true },
            })
          }
        }
      })
    )
  } catch {
    // Silently skip if tracking columns don't exist yet
  }
}

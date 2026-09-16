'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { createClient } from '@/lib/supabase/client'
import CheckpointForm from '@/components/checkpoint/checkpoint-form'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import BottomNav from '@/components/ui/bottom-nav'
import type { CheckpointDirection } from '@/lib/checkpoint-actions'
import type { VehicleTemplate } from '@/lib/damage-actions'
import { resolveVehicleModelAssets } from '@/lib/vehicle-model-assets'

interface VehicleWithMaster {
  id: string
  vin: string
  vehicle_master_id: string
  vehicle_master: {
    vehicle_template: VehicleTemplate | null
    make: string | null
    model: string | null
    model_asset_2d_id: string | null
    model_asset_3d_id: string | null
  } | null
}

export default function CheckpointDirectionPage() {
  const params = useParams<{ vehicleId: string; direction: string }>()
  const router = useRouter()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const { user, effectiveCompany } = useAuth()

  const direction = params.direction as CheckpointDirection
  const validDirection = direction === 'intake' || direction === 'outtake'

  const [vehicle, setVehicle] = useState<VehicleWithMaster | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!validDirection) return
    const supabase = createClient()
    supabase
      .from('storage_vehicles')
      .select('id, vin, vehicle_master_id, vehicle_master:vehicle_master_id(vehicle_template, make, model, model_asset_2d_id, model_asset_3d_id)')
      .eq('id', params.vehicleId)
      .single()
      .then(async ({ data }) => {
        let v = data as unknown as VehicleWithMaster
        const vm = v?.vehicle_master
        // Vehicles created before Phase 9's asset catalog landed have
        // vehicle_template set but no resolved 2D/3D asset yet — resolve and
        // persist it here, once, the first time this page is visited (same
        // opportunistic-fill pattern vehicle_template itself already uses).
        if (vm?.vehicle_template && (!vm.model_asset_2d_id || !vm.model_asset_3d_id)) {
          const resolved = await resolveVehicleModelAssets(supabase, vm.vehicle_template, vm.make, vm.model)
          await supabase.from('vehicle_master').update({
            model_asset_2d_id: resolved.modelAsset2dId,
            model_asset_3d_id: resolved.modelAsset3dId,
          }).eq('id', v.vehicle_master_id)
          v = { ...v, vehicle_master: { ...vm, model_asset_2d_id: resolved.modelAsset2dId, model_asset_3d_id: resolved.modelAsset3dId } }
        }
        setVehicle(v)
        setLoading(false)
      })
  }, [params.vehicleId, validDirection])

  if (!validDirection) {
    return <p style={{ padding: 24, color: '#EF4444' }}>Unknown checkpoint direction.</p>
  }

  if (loading || !vehicle || !effectiveCompany || !user) {
    return <div style={{ padding: 60, textAlign: 'center' }}><Loader2 size={24} color="#94A3B8" className="animate-spin" /></div>
  }

  const vehicleTemplate = vehicle.vehicle_master?.vehicle_template ?? null

  if (!vehicleTemplate) {
    return (
      <div style={{ padding: 24, maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
          This vehicle doesn't have a body-type template set yet, so the damage tagger has nothing to render against.
        </p>
        <button
          onClick={() => router.push(`/inventory/${params.vehicleId}`)}
          style={{ height: 44, padding: '0 20px', borderRadius: 10, border: 'none', background: '#00B4D8', color: '#FFFFFF', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Back to Vehicle
        </button>
      </div>
    )
  }

  return (
    <>
      {!isDesktop && <MobilePageHeader />}
      <div style={{ paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))' }}>
        <div style={{ padding: '16px 20px 0', maxWidth: 560, margin: '0 auto' }}>
          <button
            onClick={() => router.push(`/inventory/${params.vehicleId}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: '#94A3B8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
          >
            <ArrowLeft size={14} /> Back to Vehicle
          </button>
        </div>
        <CheckpointForm
          vehicleId={vehicle.id}
          companyId={effectiveCompany.id}
          direction={direction}
          vehicleTemplate={vehicleTemplate}
          modelAsset2dId={vehicle.vehicle_master?.model_asset_2d_id ?? null}
          modelAsset3dId={vehicle.vehicle_master?.model_asset_3d_id ?? null}
          vin={vehicle.vin}
          inspectorId={user.id}
          onComplete={() => router.push(`/inventory/${params.vehicleId}`)}
        />
      </div>
      {!isDesktop && <BottomNav />}
    </>
  )
}

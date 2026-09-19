'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import DamageTaggerToggle from '@/components/damage/damage-tagger-toggle'
import type { DamagePrefill } from '@/components/damage/damage-tagger'
import DamageSuggestionPanel, { suggestionPlace } from './damage-suggestion-panel'
import { useDamageSuggestions, type DamageSuggestion } from '@/lib/damage-suggest-client'
import { suggestionTitle } from '@/lib/ai/damage-suggest-labels'
import { inspectionDamageStore } from '@/lib/damage-store'
import {
  getInspectionDamageContext, ensureInspectionVehicle, setInspectionVehicleTemplate,
  type InspectionDamageContext,
} from '@/lib/damage-server-actions'
import type { VehicleTemplate } from '@/lib/damage-actions'
import { PRIMARY, PRIMARY_LIGHT, PRIMARY_PILL_TEXT, WHITE, GRAY_900, GRAY_700, GRAY_500, GRAY_300, DANGER } from '@/lib/design-tokens'

const BODY_TYPES: { value: VehicleTemplate; label: string }[] = [
  { value: 'sedan', label: 'Sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'truck', label: 'Truck' },
  { value: 'van', label: 'Van' },
]

// Exterior damage for the full inspection: the same 2D/3D picker intake and
// outtake use, with pins saved to this inspection.
//
// Falls back to the older damage list (the `fallback` element) when the picker
// cannot be used: an inspection that already has list entries (started before
// the picker existed), or one whose vehicle cannot be set up.
export default function InspectionDamagePicker({
  inspectionId, vehicleInfo, hasLegacyDamages, fallback, photos = {},
}: {
  inspectionId: string
  vehicleInfo: Record<string, any>
  hasLegacyDamages: boolean
  fallback: React.ReactNode
  /** The step's answers, for the photo behind each damage suggestion. */
  photos?: Record<string, any>
}) {
  const { suggestions, checking, reject, settle } = useDamageSuggestions(inspectionId)
  const [prefill, setPrefill] = useState<DamagePrefill | null>(null)
  const [context, setContext] = useState<InspectionDamageContext | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const store = useMemo(() => inspectionDamageStore(inspectionId), [inspectionId])

  const vin: string = vehicleInfo?.vin ?? ''

  useEffect(() => {
    if (hasLegacyDamages) return
    let cancelled = false
    ;(async () => {
      try {
        let ctx = await getInspectionDamageContext(inspectionId)
        // Inspections that began without a VIN get their vehicle now.
        if (!ctx.vehicleId && vin.length === 17) {
          ctx = await ensureInspectionVehicle(inspectionId, {
            vin,
            year: vehicleInfo?.year ?? null,
            make: vehicleInfo?.make ?? null,
            model: vehicleInfo?.model ?? null,
            bodyClass: vehicleInfo?.advancedInfo?.bodyClass ?? null,
          })
        }
        if (!cancelled) setContext(ctx)
      } catch (e: any) {
        if (!cancelled) setFailed(e?.message ?? 'The damage diagram could not be loaded.')
      }
    })()
    return () => { cancelled = true }
  // The VIN is fixed by the time the inspector reaches this step.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId, hasLegacyDamages])

  if (hasLegacyDamages) return <>{fallback}</>

  if (failed || (context && !context.vehicleId)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>
          {failed ? `${failed} Record damage below instead.` : 'Enter the VIN on the first step to use the damage diagram. Until then, record damage below.'}
        </p>
        {fallback}
      </div>
    )
  }

  if (!context) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Loader2 size={20} color={GRAY_500} className="animate-spin" />
      </div>
    )
  }

  if (!context.vehicleTemplate) {
    const pick = async (template: VehicleTemplate) => {
      setSavingTemplate(true)
      setFailed(null)
      try {
        setContext(await setInspectionVehicleTemplate(inspectionId, template))
      } catch (e: any) {
        setFailed(e?.message ?? 'Could not save the body type.')
      } finally {
        setSavingTemplate(false)
      }
    }
    return (
      <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 12, padding: 16 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: GRAY_900, margin: '0 0 4px' }}>What body type is this vehicle?</p>
        <p style={{ fontSize: 12, color: GRAY_700, margin: '0 0 12px' }}>The VIN did not say. This picks the damage diagram.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {BODY_TYPES.map(t => (
            <button key={t.value} type="button" disabled={savingTemplate} onClick={() => pick(t.value)}
              style={{
                height: 44, borderRadius: 10, border: `1.5px solid ${GRAY_300}`, background: PRIMARY_LIGHT,
                color: PRIMARY_PILL_TEXT, fontSize: 14, fontWeight: 600, cursor: savingTemplate ? 'default' : 'pointer', fontFamily: 'inherit',
              }}>
              {t.label}
            </button>
          ))}
        </div>
        {savingTemplate && <p style={{ fontSize: 12, color: PRIMARY, margin: '10px 0 0' }}>Saving…</p>}
        {failed && <p style={{ fontSize: 12, color: DANGER, margin: '10px 0 0' }}>{failed}</p>}
      </div>
    )
  }

  // F · Suggestions are placed on the 2D diagram; without one they are not offered.
  const canSuggest = context.editable && !!context.modelAsset2dId
  const add = (s: DamageSuggestion) => setPrefill({
    suggestionId: s.id,
    areaCodeId: s.areaCodeId,
    typeCodeId: s.typeCodeId,
    view: s.view ?? 'top',
    title: s.kind === 'new_since_checkin' ? `${suggestionTitle(s.damageGroup)}, new since check-in` : suggestionTitle(s.damageGroup),
    placeLabel: suggestionPlace(s),
  })

  return (
    <>
      {canSuggest && (
        <DamageSuggestionPanel
          suggestions={suggestions}
          checking={checking}
          photos={photos}
          placingId={prefill?.suggestionId ?? null}
          onAdd={add}
          onReject={s => reject(s.id)}
        />
      )}
      <DamageTaggerToggle
        store={store}
        editable={context.editable}
        vehicleTemplate={context.vehicleTemplate}
        modelAsset2dId={context.modelAsset2dId}
        modelAsset3dId={context.modelAsset3dId}
        prefill={prefill}
        onPrefillDone={id => { setPrefill(null); settle(id) }}
        onPrefillCancel={() => setPrefill(null)}
      />
    </>
  )
}

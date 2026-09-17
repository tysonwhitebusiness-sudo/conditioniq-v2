'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getVehicle2dAssetViews, type VehicleAssetViews } from '@/lib/vehicle-model-assets'
import { composeDamageLabel } from '@/lib/damage-actions'
import type { DamageMarkerView, VehicleTemplate } from '@/lib/damage-actions'
import type { DamageStore, DamageMarkerWithPhoto } from '@/lib/damage-store'
import { PRIMARY, GRAY_900, GRAY_500, GRAY_300, DANGER, WHITE } from '@/lib/design-tokens'
import DamageTagger from './damage-tagger'

// Phase 10 (2D Damage Picker): orchestrates the 5-view switcher (Top/Front/
// Side/Rear/All) on top of Phase 9's split 2D asset — resolves the 4 view
// image URLs once from modelAsset2dId, mounts a single DamageTagger instance
// for whichever of the 4 tappable views is active (it already owns all the
// tap/pin/picker/save machinery, unchanged), and renders a separate,
// non-tappable "All" grid that groups every view's markers into their own
// quadrant using their already-view-relative percentage coordinates — no
// remap math, since each view is its own independent coordinate space.

export interface Damage2DTaggerProps {
  store: DamageStore
  vehicleTemplate: VehicleTemplate
  modelAsset2dId: string
  editable?: boolean
}

type ActiveTab = DamageMarkerView | 'all'

const VIEW_TABS: { id: DamageMarkerView; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'rear', label: 'Rear' },
]

export default function Damage2DTagger({
  store, vehicleTemplate, modelAsset2dId, editable = true,
}: Damage2DTaggerProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('top')
  const [urls, setUrls] = useState<VehicleAssetViews | null>(null)
  const [loadingUrls, setLoadingUrls] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoadingUrls(true)
    getVehicle2dAssetViews(createClient(), modelAsset2dId).then(result => {
      if (!cancelled) { setUrls(result); setLoadingUrls(false) }
    })
    return () => { cancelled = true }
  }, [modelAsset2dId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${GRAY_300}`, overflowX: 'auto' }}>
        {([...VIEW_TABS, { id: 'all' as const, label: 'All' }]).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 14px', background: 'none', border: 'none', whiteSpace: 'nowrap',
              borderBottom: activeTab === t.id ? `2px solid ${PRIMARY}` : '2px solid transparent',
              color: activeTab === t.id ? GRAY_900 : GRAY_500,
              fontWeight: activeTab === t.id ? 700 : 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {loadingUrls ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Loader2 size={22} color={GRAY_500} className="animate-spin" />
        </div>
      ) : !urls ? (
        <p style={{ fontSize: 13, color: DANGER, margin: 0 }}>Could not load the diagram for this vehicle.</p>
      ) : activeTab === 'all' ? (
        <DamageAllView store={store} modelAssetId={modelAsset2dId} urls={urls} />
      ) : (
        <DamageTagger
          key={activeTab}
          store={store}
          editable={editable}
          vehicleTemplate={vehicleTemplate}
          backgroundImageUrl={urls[activeTab]}
          view={activeTab}
          modelAssetId={modelAsset2dId}
          assetType="2d"
        />
      )}
    </div>
  )
}

// ── "All" — static 2x2 grid of the 4 view images, each showing its own
// markers at their unmodified view-relative percentage position. Not
// tappable: no onClick anywhere in this tree, pins are hover-only (title).
function DamageAllView({
  store, modelAssetId, urls,
}: { store: DamageStore; modelAssetId: string; urls: VehicleAssetViews }) {
  const [markers, setMarkers] = useState<DamageMarkerWithPhoto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    store.listMarkers({ modelAssetId }).then(result => {
      if (!cancelled) { setMarkers(result); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.key, modelAssetId])

  const byView = (v: DamageMarkerView) => markers.filter(m => m.view === v)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {loading && <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>Loading markers…</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: 10, justifyContent: 'center' }}>
        {VIEW_TABS.map(t => (
          <AllQuadrant key={t.id} label={t.label} url={urls[t.id]} markers={byView(t.id)} />
        ))}
      </div>
    </div>
  )
}

function AllQuadrant({ label, url, markers }: { label: string; url: string; markers: DamageMarkerWithPhoto[] }) {
  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${GRAY_300}` }}>
      <img src={url} alt={label} draggable={false} style={{ width: 200, height: 'auto', display: 'block', userSelect: 'none' }} />
      {markers.map(m => (
        <div
          key={m.id}
          title={composeDamageLabel(m.area, m.type, m.severity)}
          style={{
            position: 'absolute',
            left: `${m.x_position}%`,
            top: `${m.y_position}%`,
            transform: 'translate(-50%, -50%)',
            width: 12, height: 12, borderRadius: '50%',
            background: PRIMARY, border: `2px solid ${WHITE}`,
            boxShadow: '0 1px 4px rgba(13,27,42,0.3)',
          }}
        />
      ))}
    </div>
  )
}

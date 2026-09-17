'use client'

import { useState, useEffect, useRef, useMemo, Suspense } from 'react'
import * as THREE from 'three'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'
import { Loader2, Camera } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getVehicle3dAssetUrl } from '@/lib/vehicle-model-assets'
import {
  getDamageAreaCodes, getDamageTypeCodes, getDamageSeverityCodes,
  composeDamageLabel,
} from '@/lib/damage-actions'
import type {
  DamageAreaCode, DamageTypeCode, DamageSeverityCode,
  VehicleTemplate,
} from '@/lib/damage-actions'
import { PRIMARY, PRIMARY_LIGHT, AMBER, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100, DANGER, WHITE } from '@/lib/design-tokens'
import DamagePickerSheet, { type PickerStep } from './damage-picker-sheet'
import DamageMarkerDetail from './damage-marker-detail'
import type { DamageStore, DamageMarkerWithPhoto } from '@/lib/damage-store'

// Phase 11 (3D Damage Picker): a standalone GLB viewer + raycast tap-to-tag,
// fully separate from the 2D system (components/damage/damage-tagger.tsx /
// damage-2d-tagger.tsx) — Phase 10's tagger is structurally 2D-only (its tap
// math is percentage-of-a-flat-image), so there's nothing to extend there.
// The only shared piece is DamagePickerSheet (Area -> Type -> Severity),
// reused verbatim so 3D's picker behaves "exactly like 2D" per spec, not a
// re-implementation that could drift from it.
//
// No panel segmentation: raycasting finds WHERE in 3D space was tapped
// (react-three-fiber's built-in pointer events already do real triangle-level
// raycasting against the loaded geometry) but only event.point is used —
// event.object/mesh identity is never inspected, so no zone/part is ever
// identified from a tap.

export type RecolorTheme = 'white' | 'black' | 'blue'

const THEME_COLORS: Record<RecolorTheme, string> = { white: WHITE, black: GRAY_900, blue: PRIMARY }

export interface Damage3DTaggerProps {
  store: DamageStore
  vehicleTemplate: VehicleTemplate
  modelAsset3dId: string
  editable?: boolean
  recolorTheme?: RecolorTheme
}

type NormalizedPoint = { x: number; y: number; z: number }

function clamp100(n: number): number {
  return Math.min(100, Math.max(0, n))
}

export default function Damage3DTagger({
  store, vehicleTemplate, modelAsset3dId, editable = true,
  recolorTheme = 'white',
}: Damage3DTaggerProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [loadingUrl, setLoadingUrl] = useState(true)
  const [modelReady, setModelReady] = useState(false)

  const [areaCodes, setAreaCodes] = useState<DamageAreaCode[]>([])
  const [typeCodes, setTypeCodes] = useState<DamageTypeCode[]>([])
  const [severityCodes, setSeverityCodes] = useState<DamageSeverityCode[]>([])
  const [markers, setMarkers] = useState<DamageMarkerWithPhoto[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null)

  const [pendingPin, setPendingPin] = useState<NormalizedPoint | null>(null)
  const [pickerStep, setPickerStep] = useState<PickerStep>(null)
  const [pickedArea, setPickedArea] = useState<DamageAreaCode | null>(null)
  const [pickedType, setPickedType] = useState<DamageTypeCode | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadingUrl(true)
    setModelReady(false)
    getVehicle3dAssetUrl(createClient(), modelAsset3dId).then(result => {
      if (!cancelled) { setUrl(result); setLoadingUrl(false) }
    })
    return () => { cancelled = true }
  }, [modelAsset3dId])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getDamageAreaCodes(),
      getDamageTypeCodes(),
      getDamageSeverityCodes(),
      store.listMarkers({ modelAssetId: modelAsset3dId }),
    ]).then(([areas, types, severities, existing]) => {
      if (cancelled) return
      setAreaCodes(areas)
      setTypeCodes(types)
      setSeverityCodes(severities)
      setMarkers(existing)
    }).catch(e => {
      if (!cancelled) setSaveError(e?.message ?? 'Could not load damage pins')
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.key, modelAsset3dId])

  const handleTap = (point: NormalizedPoint) => {
    if (!editable || saving || pickerStep) return
    setSelectedMarkerId(null)
    setPendingPin(point)
    setPickedArea(null)
    setPickedType(null)
    setPickerStep('area')
  }

  const cancelPicker = () => {
    setPendingPin(null)
    setPickerStep(null)
    setPickedArea(null)
    setPickedType(null)
  }

  const backPicker = () => {
    if (pickerStep === 'type') { setPickerStep('area'); setPickedType(null) }
    else if (pickerStep === 'severity') { setPickerStep('type') }
  }

  const pickArea = (area: DamageAreaCode) => { setPickedArea(area); setPickerStep('type') }
  const pickType = (type: DamageTypeCode) => { setPickedType(type); setPickerStep('severity') }

  const pickSeverity = async (severity: DamageSeverityCode) => {
    if (!pendingPin || !pickedArea || !pickedType) return
    setSaving(true)
    setSaveError(null)
    try {
      const created = await store.createMarker({
        areaCodeId: pickedArea.id,
        typeCodeId: pickedType.id,
        severityCodeId: severity.id,
        xPosition: pendingPin.x,
        yPosition: pendingPin.y,
        zPosition: pendingPin.z,
        modelAssetId: modelAsset3dId,
        assetType: '3d',
      })
      if (created) {
        setMarkers(prev => [created, ...prev])
        setSelectedMarkerId(created.id)
      } else {
        setSaveError('The damage pin was not saved. Try again.')
      }
    } catch (e: any) {
      setSaveError(e?.message ?? 'The damage pin was not saved. Try again.')
    } finally {
      setSaving(false)
      cancelPicker()
    }
  }

  const removeMarker = async (id: string) => {
    const previous = markers
    setSelectedMarkerId(null)
    setMarkers(prev => prev.filter(m => m.id !== id))
    try {
      await store.deleteMarker(id)
    } catch (e: any) {
      setMarkers(previous)
      setSaveError(e?.message ?? 'Could not remove the damage pin')
    }
  }

  const updatePhoto = (id: string, photoUrl: string | null, photoPath: string | null) =>
    setMarkers(prev => prev.map(m => (m.id === id ? { ...m, photo_url: photoUrl, photo_path: photoPath } : m)))

  const selectedMarker = markers.find(m => m.id === selectedMarkerId) ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        data-model-ready={modelReady ? 'true' : 'false'}
        style={{
          position: 'relative', width: '100%', aspectRatio: '4 / 3',
          background: GRAY_100, borderRadius: 12, overflow: 'hidden',
        }}
      >
        {loadingUrl ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Loader2 size={22} color={GRAY_500} className="animate-spin" />
          </div>
        ) : !url ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 13, color: DANGER, margin: 0 }}>Could not load the 3D model for this vehicle.</p>
          </div>
        ) : (
          <Canvas camera={{ fov: 40 }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 10, 5]} intensity={1} />
            <Suspense fallback={null}>
              <Scene
                url={url}
                recolorTheme={recolorTheme}
                markers={markers}
                pendingPin={pendingPin}
                disabled={saving || !!pickerStep}
                onTap={handleTap}
                onReady={() => setModelReady(true)}
              />
            </Suspense>
          </Canvas>
        )}
      </div>

      {saveError && <p role="alert" style={{ fontSize: 12, color: DANGER, margin: 0 }}>{saveError}</p>}

      {/* ── Selected pin: label, optional photo, remove ── */}
      {selectedMarker && (
        <DamageMarkerDetail
          key={selectedMarker.id}
          marker={selectedMarker}
          store={store}
          editable={editable}
          onRemove={removeMarker}
          onPhotoChange={updatePhoto}
        />
      )}

      {/* ── Marker list ── */}
      {markers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            {markers.length} {markers.length === 1 ? 'marker' : 'markers'}
          </p>
          {markers.map(m => (
            <div key={m.id}
              onClick={() => setSelectedMarkerId(id => id === m.id ? null : m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                background: selectedMarkerId === m.id ? PRIMARY_LIGHT : GRAY_100,
                border: `1px solid ${GRAY_300}`, borderRadius: 8, cursor: 'pointer',
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIMARY, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: GRAY_700, flex: 1 }}>
                {composeDamageLabel(m.area, m.type, m.severity)}
              </span>
              {m.photo_url && <Camera size={13} color={GRAY_500} aria-label="Has photo" />}
            </div>
          ))}
        </div>
      )}

      <DamagePickerSheet
        pickerStep={pickerStep}
        areaCodes={areaCodes}
        typeCodes={typeCodes}
        severityCodes={severityCodes}
        pickedArea={pickedArea}
        pickedType={pickedType}
        saving={saving}
        onPickArea={pickArea}
        onPickType={pickType}
        onPickSeverity={pickSeverity}
        onBack={backPicker}
        onCancel={cancelPicker}
      />
    </div>
  )
}

// ── Scene — lives inside <Canvas>: GLTF load, recolor override, bounding-box
// normalization, raycast tap handling, and pin rendering. ───────────────────

interface SceneProps {
  url: string
  recolorTheme: RecolorTheme
  markers: DamageMarkerWithPhoto[]
  pendingPin: NormalizedPoint | null
  disabled: boolean
  onTap: (point: NormalizedPoint) => void
  onReady: () => void
}

function Scene({ url, recolorTheme, markers, pendingPin, disabled, onTap, onReady }: SceneProps) {
  const { scene: cachedScene } = useGLTF(url)
  const readyFired = useRef(false)

  // Clone so we never mutate drei's cached-by-URL scene (materials are
  // replaced wholesale below, not shared with other consumers of this URL).
  const scene = useMemo(() => cachedScene.clone(true), [cachedScene])

  const bbox = useMemo(() => {
    // Full material swap — a brand-new material instance per mesh, not a
    // tint of the original (mesh.material = new MeshStandardMaterial(...),
    // never material.color.set(...)). This is what makes the two
    // non-100%-flat files in the library (ford_f150.glb's textured interior,
    // ford_transit_connect.glb's one textured material) a non-issue: the new
    // material carries no texture maps regardless of what the original had.
    // Applied uniformly to every mesh (glass, wheels included) — there's no
    // reliable way to exempt specific parts without per-mesh classification,
    // which the no-panel-segmentation requirement rules out building here.
    const color = new THREE.Color(THEME_COLORS[recolorTheme])
    scene.traverse(obj => {
      const mesh = obj as THREE.Mesh
      if (mesh.isMesh) {
        mesh.material = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.5 })
      }
    })
    return new THREE.Box3().setFromObject(scene)
  }, [scene, recolorTheme])

  const center = useMemo(() => bbox.getCenter(new THREE.Vector3()), [bbox])
  const radius = useMemo(() => bbox.getSize(new THREE.Vector3()).length() || 1, [bbox])
  const pinRadius = radius * 0.012

  // Auto-frame the camera on the model's actual bounding box rather than a
  // fixed hardcoded position — these GLBs vary in scale and pivot/origin
  // placement (confirmed during Phase 9's asset vetting), so a fixed camera
  // position looking at world-origin can end up pointed at empty space for
  // any file whose geometry isn't centered near (0,0,0).
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(center.x + radius * 0.9, center.y + radius * 0.6, center.z + radius * 0.9)
    camera.lookAt(center)
    if (camera instanceof THREE.PerspectiveCamera) camera.updateProjectionMatrix()
  }, [camera, center, radius])

  useEffect(() => {
    if (!readyFired.current) { readyFired.current = true; onReady() }
  }, [onReady])

  const denormalize = (p: { x: number; y: number; z: number }): THREE.Vector3 => {
    const size = bbox.getSize(new THREE.Vector3())
    return new THREE.Vector3(
      bbox.min.x + (p.x / 100) * size.x,
      bbox.min.y + (p.y / 100) * size.y,
      bbox.min.z + (p.z / 100) * size.z,
    )
  }

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (disabled) return
    e.stopPropagation()
    const size = bbox.getSize(new THREE.Vector3())
    onTap({
      x: clamp100(((e.point.x - bbox.min.x) / size.x) * 100),
      y: clamp100(((e.point.y - bbox.min.y) / size.y) * 100),
      z: clamp100(((e.point.z - bbox.min.z) / size.z) * 100),
    })
  }

  return (
    <>
      <group onClick={handleClick}>
        <primitive object={scene} />

        {markers.filter(m => m.z_position != null).map(m => (
          <mesh key={m.id} position={denormalize({ x: m.x_position, y: m.y_position, z: m.z_position! })}>
            <sphereGeometry args={[pinRadius, 16, 16]} />
            <meshBasicMaterial color={PRIMARY} />
          </mesh>
        ))}

        {pendingPin && (
          <mesh position={denormalize(pendingPin)}>
            <sphereGeometry args={[pinRadius * 1.15, 16, 16]} />
            <meshBasicMaterial color={AMBER} />
          </mesh>
        )}
      </group>

      <OrbitControls
        target={[center.x, center.y, center.z]}
        enablePan={false}
        minDistance={radius * 0.3}
        maxDistance={radius * 4}
      />
    </>
  )
}

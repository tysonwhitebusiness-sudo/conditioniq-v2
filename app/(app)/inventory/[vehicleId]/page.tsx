'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { createClient } from '@/lib/supabase/client'
import { updateVehicleLifecycleStatus, releaseVehicle, markVehicleOnLot } from '@/lib/storage-actions'
import { fetchInspectionsByIds, fetchInspectionsByVin, fetchInspectorNames } from '@/lib/inspection-server-actions'
import InspectionWizard from '@/components/inspection-wizard/inspection-wizard'
import BottomNav from '@/components/ui/bottom-nav'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import {
  ArrowLeft, Play, Send, ExternalLink, Download,
  Camera, Loader2, X, CheckCircle, LogOut,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type LifecycleStatus = 'pending_arrival' | 'in_progress' | 'on_lot' | 'releasing' | 'released' | 'one_off'
type AppStep = 'view' | 'inspecting'

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectiveStatus(v: any): LifecycleStatus {
  if (v.lifecycle_status) return v.lifecycle_status as LifecycleStatus
  switch (v.status) {
    case 'released': return 'released'
    case 'releasing': return 'releasing'
    case 'inspected': return 'on_lot'
    case 'pending_inspection': return 'in_progress'
    case 'active': return v.checkin_inspection_id ? 'on_lot' : 'pending_arrival'
    default: return 'pending_arrival'
  }
}

const STATUS_CFG: Record<LifecycleStatus, { label: string; bg: string; color: string; pulse?: boolean }> = {
  pending_arrival: { label: 'PENDING ARRIVAL', bg: '#F0F4F8', color: '#4A5568' },
  in_progress: { label: 'IN PROGRESS', bg: '#FEF3C7', color: '#92400E', pulse: true },
  on_lot:      { label: 'ON LOT',      bg: '#E0F7FC', color: '#0097B2' },
  releasing:   { label: 'RELEASING',   bg: '#FEF3C7', color: '#92400E' },
  released:    { label: 'RELEASED',    bg: '#D1FAE5', color: '#065F46' },
  one_off:     { label: 'ONE-OFF',     bg: '#F0F4F8', color: '#4A5568' },
}

function daysOnLot(arrivedAt: string, releasedAt: string | null, status: LifecycleStatus): number | null {
  if (status === 'one_off') return null
  if (!arrivedAt) return null
  const end = releasedAt ? new Date(releasedAt) : new Date()
  return Math.max(0, Math.floor((end.getTime() - new Date(arrivedAt).getTime()) / 86400000))
}

function daysColor(d: number) { return d < 30 ? '#059669' : d < 60 ? '#D97706' : '#DC2626' }

function scoreStyle(score: number | null) {
  if (score == null) return null
  if (score >= 90) return { color: '#065F46', bg: '#D1FAE5' }
  if (score >= 80) return { color: '#0369A1', bg: '#DBEAFE' }
  if (score >= 70) return { color: '#92400E', bg: '#FEF3C7' }
  if (score >= 60) return { color: '#9A3412', bg: '#FED7AA' }
  return { color: '#991B1B', bg: '#FEE2E2' }
}

function parseNotes(raw: string | null): { date: string; text: string }[] {
  if (!raw) return []
  return raw.split('\n').filter(l => l.trim()).map(l => {
    const m = l.match(/^\[([^\]]+)\]\s(.+)$/)
    return m ? { date: m[1], text: m[2] } : { date: '', text: l }
  }).reverse()
}

function extractPhotos(insp: any): { url: string; label: string; date: string }[] {
  const date = insp.created_at ? new Date(insp.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''
  const LABEL: Record<string, string> = {
    exteriorFrontPhoto: 'Front', exteriorRearPhoto: 'Rear',
    exteriorDriverPhoto: 'Driver Side', exteriorDriverSidePhoto: 'Driver Side',
    exteriorPassengerPhoto: 'Passenger Side', exteriorPassengerSidePhoto: 'Passenger Side',
    tireFrontLeft: 'Tire FL', tireFrontRight: 'Tire FR',
    tireRearLeft: 'Tire RL', tireRearRight: 'Tire RR',
    interiorDriverDoorPhoto: 'Driver Door', interiorPassengerDoorPhoto: 'Passenger Door',
    interiorRearDriverDoorPhoto: 'Rear Driver Door', interiorRearPassengerDoorPhoto: 'Rear Pass. Door',
    dashboardPhoto: 'Dashboard', interiorTrunkPhoto: 'Trunk', trunkPhoto: 'Trunk',
    engineBayPhoto: 'Engine Bay',
  }
  const SECTION: Record<string, string> = {}
  for (const key of Object.keys(LABEL)) {
    if (key.startsWith('exterior') || key.startsWith('tire')) SECTION[key] = 'Exterior'
    else if (key.startsWith('interior') || key === 'dashboardPhoto' || key === 'trunkPhoto') SECTION[key] = 'Interior'
    else SECTION[key] = 'Engine'
  }
  const out: { url: string; label: string; date: string }[] = []
  for (const src of [insp.exterior_data, insp.interior_data, insp.engine_data]) {
    if (!src || typeof src !== 'object') continue
    for (const [key, val] of Object.entries(src)) {
      if (typeof val === 'string' && val.startsWith('data:image')) {
        const nice = LABEL[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/Photo$/, '').trim()
        const section = SECTION[key] ?? ''
        out.push({ url: val, label: section ? `${section} – ${nice}` : nice, date })
      }
    }
  }
  return out
}

// ── Section card wrapper ───────────────────────────────────────────────────────

function SectionCard({ title, count, action, children }: {
  title: string; count?: number; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #F0F4F8', display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, flex: 1 }}>
          {title}{count != null ? <span style={{ marginLeft: 6, background: '#F0F4F8', color: '#4A5568', fontSize: 11, padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>{count}</span> : null}
        </h2>
        {action}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function Lightbox({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <button onClick={onClose}
        style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <X size={20} color="#FFF" />
      </button>
      <img src={url} alt={label} onClick={e => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '88vh', objectFit: 'contain', borderRadius: 10 }} />
      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', padding: '5px 14px', borderRadius: 8 }}>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', margin: 0, whiteSpace: 'nowrap' }}>{label}</p>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VehicleDetailPage({ params }: { params: { vehicleId: string } }) {
  const router = useRouter()
  const { effectiveCompany, user } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const companyId = effectiveCompany?.id ?? ''
  const isFMC = effectiveCompany?.account_type === 'fmc'

  // Core data
  const [vehicle, setVehicle] = useState<any>(null)
  const [loadingVehicle, setLoadingVehicle] = useState(true)
  const [inspections, setInspections] = useState<any[]>([])
  const [loadingInspections, setLoadingInspections] = useState(false)

  // Photos (lazy)
  const [photos, setPhotos] = useState<{ url: string; label: string; date: string }[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photosLoaded, setPhotosLoaded] = useState(false)
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)

  // Notes
  const [rawNotes, setRawNotes] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // Status action state
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [actionSaving, setActionSaving] = useState(false)

  // Wizard
  const [appStep, setAppStep] = useState<AppStep>('view')
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null)

  // ── Fetch inspections via server action (bypasses RLS, handles company_id mismatches)
  const fetchInspections = useCallback(async (vin: string, knownIds?: string[]) => {
    setLoadingInspections(true)
    const rows = knownIds?.length
      ? await fetchInspectionsByIds(knownIds)
      : await fetchInspectionsByVin(companyId, vin)
    const inspectorIds = [...new Set(rows.filter(r => r.inspector_id).map(r => r.inspector_id))]
    const nameMap = await fetchInspectorNames(inspectorIds)
    setInspections(rows.map(r => ({ ...r, inspector: { full_name: r.inspector_id ? (nameMap[r.inspector_id] ?? 'Unknown') : null } })))
    setLoadingInspections(false)
  }, [companyId])

  // ── Fetch vehicle (then fetch inspections by known IDs or VIN)
  const fetchVehicle = useCallback(async () => {
    if (!companyId || !params.vehicleId) return
    setLoadingVehicle(true)
    const { data } = await createClient()
      .from('storage_vehicles')
      .select('*, location:location_id(id, name, city, state)')
      .eq('id', params.vehicleId)
      .eq('company_id', companyId)
      .single()
    setVehicle(data ?? null)
    setRawNotes(data?.notes ?? null)
    setLoadingVehicle(false)
    if (data) {
      const ids = [...new Set([data.checkin_inspection_id, data.checkout_inspection_id, ...(data.inspection_ids ?? [])].filter(Boolean))]
      fetchInspections(data.vin ?? '', ids.length ? ids : undefined)
    }
  }, [companyId, params.vehicleId, fetchInspections])

  useEffect(() => { fetchVehicle() }, [fetchVehicle])

  // ── Lazy load photos
  const loadPhotos = async () => {
    if (!companyId || !vehicle?.vin || photosLoaded || loadingPhotos) return
    setLoadingPhotos(true)
    const { data } = await createClient()
      .from('vehicle_inspections')
      .select('id, created_at, exterior_data, interior_data, engine_data')
      .eq('company_id', companyId)
      .eq('vin', vehicle.vin)
      .eq('status', 'completed')
    setPhotos(data?.flatMap(i => extractPhotos(i)) ?? [])
    setPhotosLoaded(true)
    setLoadingPhotos(false)
  }

  // ── Notes
  const saveNote = async () => {
    if (!newNote.trim() || !vehicle) return
    setSavingNote(true)
    const ts = new Date().toLocaleDateString()
    const updated = rawNotes ? `${rawNotes}\n[${ts}] ${newNote.trim()}` : `[${ts}] ${newNote.trim()}`
    await createClient().from('storage_vehicles').update({ notes: updated }).eq('id', vehicle.id)
    setRawNotes(updated)
    setNewNote('')
    setSavingNote(false)
  }

  // ── Start / resume inspection
  const handleStart = async () => {
    if (!effectiveCompany || !user || !vehicle) return
    try {
      const [{ getDeviceId }, { initiateInspection }] = await Promise.all([
        import('@/lib/device-id'),
        import('@/lib/usage-actions'),
      ])
      const { inspectionId } = await initiateInspection({
        companyId: effectiveCompany.id, inspectorId: user.id,
        initialData: { vin: vehicle.vin, year: vehicle.year, make: vehicle.make, model: vehicle.model },
        deviceId: getDeviceId(),
      })
      setCurrentInspectionId(inspectionId)
      setAppStep('inspecting')
    } catch (e: any) { alert('Failed to start: ' + e.message) }
  }

  const handleMarkOnLot = async () => {
    if (!vehicle) return
    setActionSaving(true)
    await markVehicleOnLot(vehicle.id)
    await fetchVehicle()
    setActionSaving(false)
  }

  const handleRelease = async () => {
    if (!vehicle) return
    setActionSaving(true)
    await releaseVehicle(vehicle.id)
    setConfirmRelease(false)
    await fetchVehicle()
    setActionSaving(false)
  }

  const handleWizardComplete = useCallback(async (data: any) => {
    if (effectiveCompany?.id && vehicle?.vin) {
      updateVehicleLifecycleStatus(effectiveCompany.id, vehicle.vin, data.inspectionId, data.vehicleInfo?.inspectionType ?? 'standard', data.scoreResult?.score ?? null).catch(console.error)
    }
    setAppStep('view')
    setCurrentInspectionId(null)
    await fetchVehicle()
  }, [effectiveCompany?.id, vehicle?.vin, fetchVehicle])

  // ── PDF download for a single inspection
  const downloadPDF = async (inspId: string) => {
    try {
      const { data } = await createClient().from('vehicle_inspections').select('*').eq('id', inspId).single()
      if (!data) return
      const [{ calculateVehicleScore }, { generateInspectionPDF }] = await Promise.all([
        import('@/lib/vehicle-score'),
        import('@/lib/pdf-generator'),
      ])
      await generateInspectionPDF(data, calculateVehicleScore(data), data.signature_url ?? '')
    } catch (e: any) { alert('PDF failed: ' + e.message) }
  }

  // ── Wizard mode
  if (appStep === 'inspecting' && currentInspectionId) {
    return (
      <InspectionWizard
        inspectionId={currentInspectionId}
        initialData={{ vehicleInfo: { vin: vehicle?.vin, year: vehicle?.year, make: vehicle?.make, model: vehicle?.model } }}
        inspectorId={user?.id}
        onComplete={handleWizardComplete}
        onCancel={() => { setAppStep('view'); setCurrentInspectionId(null) }}
      />
    )
  }

  // ── Loading skeleton
  if (loadingVehicle) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <Loader2 size={28} color="#00B4D8" style={{ animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!vehicle) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: '#94A3B8', fontSize: 15 }}>Vehicle not found.</p>
        <button onClick={() => router.push('/vehicles')}
          style={{ marginTop: 12, height: 42, padding: '0 20px', borderRadius: 10, border: 'none', background: '#0D1B2A', color: '#FFF', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
          Back to Vehicles
        </button>
      </div>
    )
  }

  const status = effectiveStatus(vehicle)
  const sc = STATUS_CFG[status]
  const days = daysOnLot(vehicle.arrived_at, vehicle.released_at, status)
  const vehicleTitle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Unknown Vehicle'
  const parsedNotes = parseNotes(rawNotes)

  const canStart = ['pending_arrival', 'on_lot', 'in_progress', 'releasing'].includes(status)
  const canDispatch = ['pending_arrival', 'on_lot', 'in_progress'].includes(status)
  const isResume = status === 'in_progress' || status === 'releasing'

  return (
    <>
    {!isDesktop && <MobilePageHeader />}
    <div style={{
      padding: isDesktop ? '24px 28px' : '16px',
      paddingBottom: isDesktop ? 40 : 'calc(80px + env(safe-area-inset-bottom))',
      maxWidth: 960, margin: '0 auto',
    }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
      `}</style>

      {/* ── Back + heading ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => router.push('/vehicles')}
          style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, marginTop: 2 }}>
          <ArrowLeft size={16} color="#0D1B2A" />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: isDesktop ? 24 : 20, fontWeight: 900, color: '#0D1B2A', margin: '0 0 2px', lineHeight: 1.2 }}>
            {vehicleTitle}
          </h1>
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, fontFamily: 'monospace', letterSpacing: '0.04em' }}>
            {vehicle.vin || '—'}
          </p>
        </div>
      </div>

      {/* ── Stats header ────────────────────────────────────────────────────── */}
      <div style={{
        background: '#0D1B2A', borderRadius: 16, padding: isDesktop ? '20px 24px' : '16px',
        marginBottom: 16,
        display: 'grid',
        gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
        gap: 20,
      }}>
        {/* Status */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>Status</p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: sc.bg, color: sc.color, borderRadius: 20, padding: '5px 12px', fontSize: 11, fontWeight: 700 }}>
            {sc.pulse && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#F59E0B', animation: 'pulse 1.5s ease-in-out infinite', display: 'inline-block' }} />}
            {sc.label}
          </span>
        </div>

        {/* Days on lot */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>Days on Lot</p>
          {days !== null
            ? <span style={{ fontSize: 22, fontWeight: 800, color: daysColor(days) }}>{days}<span style={{ fontSize: 13, marginLeft: 2, color: 'rgba(255,255,255,0.4)' }}>d</span></span>
            : <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.25)' }}>—</span>}
        </div>

        {/* Intake date */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>Intake Date</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', margin: 0 }}>
            {vehicle.arrived_at
              ? new Date(vehicle.arrived_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
              : '—'}
          </p>
        </div>

        {/* Location (FMC) | Released date | Report count */}
        {isFMC && vehicle.location ? (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>Location</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#00B4D8', margin: '0 0 2px' }}>{vehicle.location.name}</p>
            {vehicle.location.city && (
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
                {vehicle.location.city}{vehicle.location.state ? `, ${vehicle.location.state}` : ''}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>Released Date</p>
            {(vehicle.released_date || vehicle.released_at) ? (
              <p style={{ fontSize: 14, fontWeight: 600, color: '#10B981', margin: 0 }}>
                {new Date(vehicle.released_date ?? vehicle.released_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            ) : (
              <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.25)' }}>—</span>
            )}
          </div>
        )}
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────────── */}
      {(canStart || canDispatch || status === 'pending_arrival' || status === 'on_lot' || status === 'in_progress') && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {canStart && (
            <button onClick={handleStart}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: isResume ? '#00B4D8' : '#F4A62A', color: isResume ? '#FFF' : '#0D1B2A', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Play size={15} />{isResume ? 'Resume Inspection' : 'Start Inspection'}
            </button>
          )}
          {canDispatch && (
            <button onClick={() => router.push(`/storage/dispatch?vin=${vehicle.vin}`)}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Send size={15} />Dispatch
            </button>
          )}
          {status === 'pending_arrival' && (
            <button onClick={handleMarkOnLot} disabled={actionSaving}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, opacity: actionSaving ? 0.6 : 1 }}>
              <CheckCircle size={15} />Mark as On Lot
            </button>
          )}
          {(status === 'on_lot' || status === 'in_progress') && (
            <button onClick={() => setConfirmRelease(true)} disabled={actionSaving}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#10B981', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, opacity: actionSaving ? 0.6 : 1 }}>
              <LogOut size={15} />Release Vehicle
            </button>
          )}
        </div>
      )}

      {/* ── Inspection History ──────────────────────────────────────────────── */}
      <SectionCard title="Inspection History" count={inspections.length}>
        {loadingInspections ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <Loader2 size={20} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : inspections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 10px' }}><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="2"/><circle cx="12" cy="16" r="1"/></svg>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No inspections recorded yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {inspections.map(insp => {
              const ss = scoreStyle(insp.vehicle_score)
              const rawDate = insp.completed_at ?? insp.created_at
              const dateStr = new Date(rawDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
              const inspector = (insp.inspector as any)?.full_name ?? 'Unknown'
              const shortId = String(insp.id).slice(0, 6).toUpperCase()
              const usageStatus: string = insp.usage_status ?? insp.status ?? 'queued'
              const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
                queued:           { label: 'Queued',          bg: '#F0F4F8', color: '#94A3B8' },
                pending_arrival:  { label: 'Pending Arrival', bg: '#F0F4F8', color: '#94A3B8' },
                on_lot:      { label: 'On Lot',      bg: '#E0F7FC', color: '#00B4D8' },
                in_progress: { label: 'In Progress', bg: '#EDE9FE', color: '#8B5CF6' },
                one_off:     { label: 'One-Off',     bg: '#FFF0E8', color: '#F97316' },
                released:    { label: 'Released',    bg: '#D1FAE5', color: '#10B981' },
              }
              const badge = STATUS_BADGE[usageStatus] ?? STATUS_BADGE.queued
              const reportUrl: string | null = (insp as any).report_url ?? null
              const hasReport = !!(reportUrl || insp.status === 'completed')

              return (
                <div key={insp.id}
                  style={{ background: '#F8FAFC', border: '1px solid #E1E8F0', borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {/* Report ID */}
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#0D1B2A', minWidth: 110, flexShrink: 0 }}>
                      Report #{shortId}
                    </span>

                    {/* Date + inspector */}
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>{dateStr}</p>
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{inspector}</p>
                    </div>

                    {/* Status badge */}
                    <span style={{ background: badge.bg, color: badge.color, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {badge.label}
                    </span>

                    {/* View / Download — use report_url directly for instant open */}
                    {hasReport && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => reportUrl ? window.open(reportUrl, '_blank') : downloadPDF(insp.id)}
                          style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid #E1E8F0', background: '#FFF', color: '#00B4D8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                          View <ExternalLink size={11} />
                        </button>
                        <button
                          onClick={() => reportUrl ? window.open(reportUrl, '_blank') : downloadPDF(insp.id)}
                          style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Download size={11} /> PDF
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* ── Photos ──────────────────────────────────────────────────────────── */}
      <SectionCard
        title="Photos"
        count={photosLoaded ? photos.length : undefined}
        action={
          !photosLoaded ? (
            <button
              onClick={loadPhotos}
              disabled={loadingPhotos}
              style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid #E1E8F0', background: '#FFF', color: '#00B4D8', fontSize: 12, fontWeight: 600, cursor: loadingPhotos ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
              {loadingPhotos
                ? <><Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />Loading…</>
                : <><Camera size={13} />Load Photos</>}
            </button>
          ) : undefined
        }
      >
        {!photosLoaded ? (
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, textAlign: 'center', padding: '12px 0' }}>
            Click <strong>Load Photos</strong> to display all photos captured during inspections.
          </p>
        ) : photos.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
            No photos found in completed inspections.
          </p>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
            gap: 8,
          }}>
            {photos.map((p, i) => (
              <div key={i}
                onClick={() => setLightbox(p)}
                style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: '1px solid #E1E8F0', background: '#F0F4F8' }}>
                <img src={p.url} alt={p.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(13,27,42,0.72))', padding: '16px 8px 7px' }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: '#FFFFFF', margin: 0, lineHeight: 1.3 }}>{p.label}</p>
                  {p.date && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', margin: 0 }}>{p.date}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Notes ───────────────────────────────────────────────────────────── */}
      <SectionCard title="Notes" count={parsedNotes.length || undefined}>
        {/* New note input */}
        <div style={{ display: 'flex', gap: 8, marginBottom: parsedNotes.length > 0 ? 16 : 0 }}>
          <input
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveNote()}
            placeholder="Add a note…"
            style={{ flex: 1, height: 40, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit', background: '#FAFAFA' }}
          />
          <button
            onClick={saveNote}
            disabled={!newNote.trim() || savingNote}
            style={{ height: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: newNote.trim() ? '#0D1B2A' : '#E1E8F0', color: newNote.trim() ? '#FFF' : '#94A3B8', fontSize: 13, fontWeight: 600, cursor: newNote.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {savingNote ? '…' : 'Save'}
          </button>
        </div>

        {parsedNotes.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
            No notes yet. Add one above.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {parsedNotes.map((n, i) => (
              <div key={i}
                style={{ background: '#F8FAFC', border: '1px solid #E1E8F0', borderRadius: 10, padding: '10px 14px' }}>
                {n.date && (
                  <p style={{ fontSize: 11, color: '#94A3B8', margin: '0 0 4px', fontWeight: 600 }}>{n.date}</p>
                )}
                <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.6 }}>{n.text}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Lightbox */}
      {lightbox && <Lightbox url={lightbox.url} label={lightbox.label} onClose={() => setLightbox(null)} />}

      {/* Release confirmation modal */}
      {confirmRelease && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.5)' }} onClick={() => setConfirmRelease(false)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <LogOut size={24} color="#10B981" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0D1B2A', textAlign: 'center', margin: '0 0 8px' }}>Release Vehicle?</h2>
            <p style={{ fontSize: 14, color: '#4A5568', textAlign: 'center', lineHeight: 1.6, margin: '0 0 24px' }}>
              Are you sure you want to release this vehicle? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmRelease(false)}
                style={{ flex: 1, height: 46, borderRadius: 12, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={handleRelease} disabled={actionSaving}
                style={{ flex: 1, height: 46, borderRadius: 12, border: 'none', background: '#10B981', color: '#FFF', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: actionSaving ? 0.7 : 1 }}>
                {actionSaving ? 'Releasing…' : 'Yes, Release'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
    </>
  )
}

'use client'

import dynamic from 'next/dynamic'
import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Search, Plus, Upload, Download, MoreVertical, X, Loader2, CheckCircle, Car, Receipt, Lock, UserPlus, LayoutGrid, Columns3, MapPin, AlertTriangle, DollarSign, Camera } from 'lucide-react'
import BottomNav from '@/components/ui/bottom-nav'
import { createClient } from '@/lib/supabase/client'
import {
  addVehicleToSystem, getVehicleInspectionHistory,
  getStorageLocations, bulkInsertVehicles, deleteStorageVehicle,
} from '@/lib/storage-actions'
import { getCustomers, createCustomer, type Customer } from '@/lib/customer-actions'
import { getReportSignedUrlAction, fetchInspectionsByIds } from '@/lib/inspection-server-actions'
import SendLinkSheet from '@/components/dispatch/send-link-sheet'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import BulkBillingModal, { type BulkVehicle } from '@/components/billing/bulk-billing-modal'
import { calculateVehicleBilling, getLotOccupancy } from '@/lib/lot-actions'
import type { SpotSizeClass } from '@/lib/lot-actions'
import type { VehicleTemplate } from '@/lib/damage-actions'
import LoadingOverlay from '@/components/ui/loading-overlay'
import EmptyState from '@/components/ui/empty-state'
import CapacityBar from '@/components/ui/capacity-bar'
import ChangeStatus from '@/components/status/change-status'
import BoardView from '@/components/vehicles/board-view'
import { getArrivalsTodayCount, getNeedsAttentionCount, getTodaysQueue, type TodaysQueue } from '@/lib/dashboard-stats'
import { getBillingKPIs } from '@/lib/billing-dashboard-actions'
import { getSpotPinColor, WORK_ORDER_STATUS_LABEL, WORK_ORDER_STATUSES, type WorkOrderStatus } from '@/lib/work-order-status'
import { defaultSizeClassForTemplate } from '@/lib/work-order-status'
import { createCheckpoint } from '@/lib/checkpoint-actions'
import { uploadCheckpointPhoto } from '@/lib/checkpoint-server-actions'
import { checkUsageState } from '@/lib/usage-actions'
// The camera pulls in the capture and barcode code; it loads when it opens.
const CameraCapture = dynamic(() => import('@/components/ui/camera-capture'), { ssr: false })
import AddVehicleChoice from '@/components/inventory/add-vehicle-choice'
import { PRIMARY, PRIMARY_LIGHT, PRIMARY_PILL_TEXT, WHITE, DANGER, DANGER_TEXT, DANGER_LIGHT, DANGER_BORDER, SUCCESS, SUCCESS_LIGHT, SUCCESS_DARK, WARN, WARN_LIGHT, WARN_DARK, AMBER_DARK, PURPLE_LIGHT, PURPLE_DARK, INFO_LIGHT, INFO_DARK, GRAY_900, GRAY_700, GRAY_500, GRAY_300, GRAY_100 } from '@/lib/design-tokens'

// ── Types ─────────────────────────────────────────────────────────────────────

// Display bucket this page renders — unchanged since before the work_order_status
// migration. work_order_status has 10 values now; this page still shows the same
// 5 buckets it always has, so effectiveStatus below collapses the new authoritative
// column back onto them. The one unavoidable change: the old model had two separate
// terminal buckets (picked_up / completed) which the new model correctly merges into
// a single "Released" status (see the picked_up/completed bug fix from the schema
// migration) — both now render as the old "PICKED UP" bucket/label.
type LifecycleStatus = 'pending_arrival' | 'on_lot' | 'pending_pickup' | 'picked_up' | 'completed'

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectiveStatus(v: any): LifecycleStatus {
  switch (v.work_order_status as WorkOrderStatus) {
    case 'pending_arrival': return 'pending_arrival'
    case 'pending_release':
    case 'ready_for_release': return 'pending_pickup'
    case 'released': return 'picked_up'
    default: return 'on_lot'
  }
}

// Colors sourced from design-tokens.ts, matching getSpotPinColor()'s semantic
// language (cyan = occupied, amber = attention) even though this is a
// separate, coarser 5-bucket display — see the design-consistency audit for
// why this stays a token-only pass rather than switching to real work-order
// status granularity here.
const STATUS_CFG: Record<LifecycleStatus, { label: string; bg: string; color: string; pulse?: boolean }> = {
  pending_arrival: { label: 'PENDING ARRIVAL', bg: GRAY_100,       color: GRAY_700 },
  on_lot:          { label: 'ON LOT',          bg: PRIMARY_LIGHT,  color: PRIMARY_PILL_TEXT },
  pending_pickup:  { label: 'PENDING PICKUP',  bg: WARN_LIGHT,     color: WARN_DARK, pulse: true },
  picked_up:       { label: 'PICKED UP',       bg: SUCCESS_LIGHT,  color: SUCCESS_DARK },
  completed:       { label: 'COMPLETED',       bg: PURPLE_LIGHT,   color: PURPLE_DARK },
}

const STATUS_BORDER: Record<LifecycleStatus, string> = {
  pending_arrival: GRAY_500, on_lot: PRIMARY,
  pending_pickup: WARN, picked_up: SUCCESS, completed: PURPLE_DARK,
}

const STATUS_SORT: Record<string, number> = {
  pending_arrival: 0, on_lot: 1, pending_pickup: 2, picked_up: 3, completed: 4,
}

const INSP_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  check_in:  { label: 'CHECK-IN',    bg: SUCCESS_LIGHT, color: SUCCESS_DARK },
  check_out: { label: 'CHECK-OUT',   bg: WARN_LIGHT, color: WARN_DARK },
  standard:  { label: 'MID-STORAGE', bg: INFO_LIGHT, color: INFO_DARK },
}

function daysOnLot(arrivedAt: string, releasedAt: string | null, status: LifecycleStatus): number | null {
  if (status === 'completed' || status === 'pending_arrival') return null
  const end = releasedAt ? new Date(releasedAt) : new Date()
  return Math.max(0, Math.floor((end.getTime() - new Date(arrivedAt).getTime()) / 86400000))
}

const DAYS_ON_LOT_COLOR = GRAY_700

function BilledThroughValue({ date }: { date: string | null | undefined }) {
  if (!date) {
    return (
      <span style={{ background: WARN_LIGHT, color: WARN_DARK, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
        Unbilled
      </span>
    )
  }
  return (
    <span style={{ color: GRAY_900, fontWeight: 600, fontSize: 13 }}>
      {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
    </span>
  )
}

function SpotBadge({ label }: { label: string | null | undefined }) {
  if (!label) return <span style={{ color: GRAY_300, fontSize: 13 }}>—</span>
  return (
    <span style={{ background: GRAY_100, color: GRAY_700, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
      {label}
    </span>
  )
}

// ── Expanded Row ──────────────────────────────────────────────────────────────

function ExpandedRow({ vehicle, spotLabel, onDispatch, onCheckIn, onAssignSpot, onAddCharge }: {
  vehicle: any
  spotLabel: string | null
  onDispatch: () => void
  onCheckIn: () => void
  onAssignSpot: () => void
  onAddCharge: () => void
}) {
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [localNotes, setLocalNotes] = useState(vehicle.notes ?? '')
  const isPendingArrival = effectiveStatus(vehicle) === 'pending_arrival'

  const saveNote = async () => {
    if (!note.trim()) return
    setSavingNote(true)
    const ts = new Date().toLocaleDateString()
    const updated = localNotes ? `${localNotes}\n[${ts}] ${note.trim()}` : `[${ts}] ${note.trim()}`
    await createClient().from('storage_vehicles').update({ notes: updated }).eq('id', vehicle.id)
    setLocalNotes(updated)
    setNote('')
    setSavingNote(false)
  }

  const actionBtnStyle = { height: 32, padding: '0 12px', borderRadius: 8, border: `1px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 } as const

  return (
    <div style={{ background: GRAY_100, borderTop: `1px solid ${GRAY_300}`, padding: '20px 24px' }}>

      {/* Spot / Billed Through */}
      <div style={{ display: 'flex', gap: 32, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Spot</p>
          {spotLabel ? <SpotBadge label={spotLabel} /> : <span style={{ fontSize: 13, color: GRAY_500 }}>Not assigned</span>}
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>Billed Through</p>
          <BilledThroughValue date={vehicle.billed_through_date} />
        </div>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={onAssignSpot} style={actionBtnStyle}>Assign Spot</button>
        <button onClick={onAddCharge} style={actionBtnStyle}>Add Charge</button>
        {isPendingArrival ? (
          <button onClick={onCheckIn} style={actionBtnStyle}>Check In</button>
        ) : (
          <button onClick={onDispatch} style={actionBtnStyle}>
            Send to Inspector
          </button>
        )}
      </div>

      {/* Notes */}
      <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Notes</p>
      {localNotes && (
        <pre style={{ fontSize: 12, color: GRAY_700, background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 8, padding: '10px 12px', marginBottom: 8, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0 0 8px' }}>
          {localNotes}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…"
          onKeyDown={e => e.key === 'Enter' && saveNote()}
          style={{ flex: 1, height: 38, border: `1px solid ${GRAY_300}`, borderRadius: 8, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={saveNote} disabled={!note.trim() || savingNote}
          style={{ height: 38, padding: '0 14px', borderRadius: 8, border: 'none', background: GRAY_900, color: WHITE, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {savingNote ? '…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Add Existing Vehicle (backfill) Slide-Over ───────────────────────────────
// Phase 13: repurposed from the old AddVehicleSlideOver, which let someone
// silently mark a vehicle checked_in via a 2-option status toggle with no
// checkpoint, no photos, ever run. This is now specifically the one-time
// backfill path (New Arrival — the live intake path — routes to
// /vehicles/intake instead, reusing that page as-is): status is a full,
// never-defaulted picker, and 5 condition photos are required before submit.

const BACKFILL_PHOTO_SLOTS: { key: string; label: string }[] = [
  { key: 'front', label: 'Front' },
  { key: 'rear', label: 'Rear' },
  { key: 'driver_side', label: 'Driver Side' },
  { key: 'passenger_side', label: 'Passenger Side' },
  { key: 'interior_dash', label: 'Interior / Dash' },
]

function AddExistingVehicleSlideOver({ companyId, userId, isFMC, locations, onClose, onAdded, onAddAndDispatch }: {
  companyId: string; userId: string; isFMC: boolean; locations: any[]; onClose: () => void; onAdded: () => void; onAddAndDispatch: (vin: string) => void
}) {
  const router = useRouter()
  // Never defaulted — the whole point of this picker is reflecting whatever
  // state the vehicle is actually already in, not assuming one.
  const [status, setStatus] = useState<WorkOrderStatus | ''>('')
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [sequenceActive, setSequenceActive] = useState(false)
  const [activePhotoKey, setActivePhotoKey] = useState<string | null>(null)
  const [vin, setVin] = useState('')
  const [year, setYear] = useState(''); const [make, setMake] = useState(''); const [model, setModel] = useState('')
  const [bodyClass, setBodyClass] = useState('')
  const [vehicleTemplate, setVehicleTemplate] = useState<VehicleTemplate | ''>('')
  const [sizeClass, setSizeClass] = useState<SpotSizeClass>('standard')
  const [sizeTouched, setSizeTouched] = useState(false)
  const [locationId, setLocationId] = useState('')
  const [arrivedAt, setArrivedAt] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [decoding, setDecoding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dupeVehicleId, setDupeVehicleId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string>('')
  const [quickAddName, setQuickAddName] = useState('')
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [creatingCustomer, setCreatingCustomer] = useState(false)

  useEffect(() => {
    getCustomers(companyId).then(setCustomers).catch(() => {})
  }, [companyId])

  const cleanVin = vin.trim().toUpperCase()

  const decode = async () => {
    if (cleanVin.length !== 17) return
    setDecoding(true)
    try {
      const { decodeVIN } = await import('@/lib/vin-decode')
      const r = await decodeVIN(cleanVin)
      if (r) { setYear(r.year ?? ''); setMake(r.make ?? ''); setModel(r.model ?? ''); setBodyClass(r.bodyClass ?? '') }
    } finally { setDecoding(false) }
  }

  const checkDupe = async () => {
    if (cleanVin.length < 3) return
    const { data } = await createClient().from('storage_vehicles').select('id').eq('company_id', companyId).eq('vin', cleanVin).neq('work_order_status', 'released').maybeSingle()
    setDupeVehicleId(data?.id ?? null)
  }

  const applyTemplate = (t: VehicleTemplate) => {
    setVehicleTemplate(t)
    if (!sizeTouched) setSizeClass(defaultSizeClassForTemplate(t))
  }

  // vehicle_master persists across visits (even released ones), so this looks
  // up by VIN directly rather than through the active-work-order check above —
  // a returning vehicle's known template/size should prefill even if its prior
  // storage_vehicles row is long since released.
  const lookupVehicleMasterDefaults = async () => {
    if (cleanVin.length !== 17) return
    const { data } = await createClient().from('vehicle_master')
      .select('vehicle_template, size_class')
      .eq('company_id', companyId).eq('vin', cleanVin).maybeSingle()
    if (data?.vehicle_template) applyTemplate(data.vehicle_template as VehicleTemplate)
    if (data?.size_class) { setSizeClass(data.size_class as SpotSizeClass); setSizeTouched(true) }
  }

  const allPhotosReady = BACKFILL_PHOTO_SLOTS.every(s => photos[s.key])

  const save = async (andDispatch = false) => {
    if (!cleanVin || dupeVehicleId || !status || !allPhotosReady) return
    setSaving(true)
    setSaveError(null)
    // Checked before anything is written: the vehicle is created before its
    // photos upload, so refusing only at upload would leave a vehicle with no
    // condition record behind.
    try {
      const { blockReason } = await checkUsageState(companyId)
      if (blockReason) { setSaveError(blockReason); setSaving(false); return }
    } catch { /* fall through; the upload action enforces the rule server-side */ }
    try {
      const vehicleId = await addVehicleToSystem(companyId, {
        vin: cleanVin, year, make, model,
        locationId: locationId || undefined,
        arrivedAt: status !== 'pending_arrival' && arrivedAt ? new Date(arrivedAt).toISOString() : undefined,
        notes,
        workOrderStatus: status,
        customerId: customerId || undefined,
        sizeClass,
        vehicleTemplate: vehicleTemplate || undefined,
        bodyClass: bodyClass || undefined,
      })
      if (!vehicleId) throw new Error('Could not create vehicle')
      // Photos can't upload until the vehicle (and its id) exists, unlike the
      // real checkpoint flow where the vehicle is already there — so these
      // were only held as local data URLs until now, uploaded as one batch.
      const uploadedUrls = await Promise.all(
        BACKFILL_PHOTO_SLOTS.map(slot => uploadCheckpointPhoto(vehicleId, companyId, 'backfill', photos[slot.key], slot.key))
      )
      const checkpoint = await createCheckpoint(companyId, {
        vehicleId,
        direction: 'backfill',
        photos: uploadedUrls,
        notes: notes || undefined,
        inspectorId: userId,
      })
      if (!checkpoint) throw new Error('Vehicle was created but its condition photos could not be saved')
      if (andDispatch) onAddAndDispatch(cleanVin)
      else onAdded()
    } catch (e: any) {
      setSaveError('Failed to add vehicle. This may be a database constraint — run the VIN partial-index migration in Supabase.')
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ width: 'min(480px,100vw)', background: WHITE, display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${GRAY_300}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: GRAY_900, margin: 0 }}>Add Existing Vehicle</h2>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} color={GRAY_500} /></button>
          </div>
          <p style={{ fontSize: 12, color: GRAY_500, margin: '4px 0 0', lineHeight: 1.5 }}>
            For a vehicle already on the lot that was never logged. A vehicle that&apos;s returning always goes through a full Intake instead.
          </p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {/* Status — full picker, never defaulted */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 6 }}>Status *</label>
            <select value={status} onChange={e => setStatus(e.target.value as WorkOrderStatus)}
              style={{ width: '100%', height: 44, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: GRAY_100, fontFamily: 'inherit' }}>
              <option value="">Select this vehicle&apos;s actual current status…</option>
              {WORK_ORDER_STATUSES.map(s => <option key={s} value={s}>{WORK_ORDER_STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          {/* VIN */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 6 }}>VIN *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={vin} onChange={e => { setVin(e.target.value.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase().slice(0, 17)); setDupeVehicleId(null) }}
                onBlur={() => { checkDupe(); if (cleanVin.length === 17) { decode(); lookupVehicleMasterDefaults() } }}
                placeholder="17-character VIN" maxLength={17}
                style={{ flex: 1, height: 44, border: `1px solid ${dupeVehicleId ? DANGER : GRAY_300}`, borderRadius: 10, padding: '0 12px', fontSize: 14, fontFamily: 'monospace', outline: 'none', background: GRAY_100 }} />
              <button onClick={decode} disabled={cleanVin.length !== 17 || decoding}
                style={{ height: 44, padding: '0 14px', borderRadius: 10, background: PRIMARY, color: WHITE, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: cleanVin.length !== 17 ? 0.5 : 1, fontFamily: 'inherit' }}>
                {decoding ? '…' : 'Decode'}
              </button>
            </div>
            {dupeVehicleId && (
              <p style={{ fontSize: 12, color: DANGER, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                This VIN already exists.{' '}
                <button onClick={() => { onClose(); router.push(`/inventory/${dupeVehicleId}`) }}
                  style={{ background: 'none', border: 'none', color: PRIMARY, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}>
                  View vehicle →
                </button>
              </p>
            )}
          </div>
          {/* Year / Make / Model */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
            {([['Year', year, setYear], ['Make', make, setMake], ['Model', model, setModel]] as const).map(([lbl, val, setter]) => (
              <div key={lbl as string}>
                <label style={{ fontSize: 12, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 4 }}>{lbl as string}</label>
                <input value={val as string} onChange={e => (setter as any)(e.target.value)}
                  style={{ width: '100%', height: 42, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '0 10px', fontSize: 14, outline: 'none', background: GRAY_100, boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
            ))}
          </div>
          {/* Vehicle Template / Size — durable identity data on vehicle_master, set once,
              always editable. Template drives the size default until Size is touched directly. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 4 }}>Vehicle Template</label>
              <select value={vehicleTemplate} onChange={e => applyTemplate(e.target.value as VehicleTemplate)}
                style={{ width: '100%', height: 42, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '0 10px', fontSize: 14, outline: 'none', background: GRAY_100, boxSizing: 'border-box', fontFamily: 'inherit' }}>
                <option value="">Not set</option>
                <option value="sedan">Sedan</option>
                <option value="suv">SUV</option>
                <option value="truck">Truck</option>
                <option value="van">Van</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 4 }}>Size</label>
              <select value={sizeClass} onChange={e => { setSizeClass(e.target.value as SpotSizeClass); setSizeTouched(true) }}
                style={{ width: '100%', height: 42, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '0 10px', fontSize: 14, outline: 'none', background: GRAY_100, boxSizing: 'border-box', fontFamily: 'inherit' }}>
                <option value="compact">Compact</option>
                <option value="standard">Standard</option>
                <option value="oversized">Oversized</option>
              </select>
            </div>
          </div>
          {/* Location */}
          {isFMC && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 6 }}>Location</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)}
                style={{ width: '100%', height: 44, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: GRAY_100, fontFamily: 'inherit' }}>
                <option value="">No location</option>
                {locations.filter(l => l.active !== false).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          {/* Arrival Date — not shown for Pending Arrival, since that status means it hasn't arrived yet */}
          {status !== '' && status !== 'pending_arrival' && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 6 }}>Arrival Date *</label>
              <input type="date" value={arrivedAt} onChange={e => setArrivedAt(e.target.value)}
                style={{ width: '100%', height: 44, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: GRAY_100, boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
          )}
          {/* Condition Photos — required, one-time continuous capture like the real checkpoint flow */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 6 }}>Condition Photos *</label>
            {!allPhotosReady && (
              <button
                type="button"
                onClick={() => setSequenceActive(true)}
                style={{
                  width: '100%', height: 44, borderRadius: 10, border: 'none', background: PRIMARY, color: WHITE,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Camera size={15} />
                {Object.keys(photos).length === 0 ? 'Start Photos' : 'Continue Photos'} ({Object.keys(photos).length}/{BACKFILL_PHOTO_SLOTS.length})
              </button>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {BACKFILL_PHOTO_SLOTS.map(slot => (
                <button key={slot.key} type="button" onClick={() => setActivePhotoKey(slot.key)}
                  style={{
                    height: 80, borderRadius: 10, border: `1.5px solid ${photos[slot.key] ? SUCCESS : GRAY_300}`,
                    background: photos[slot.key] ? `url(${photos[slot.key]}) center/cover` : GRAY_100,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                    cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  }}>
                  {!photos[slot.key] && <Camera size={18} color={GRAY_500} />}
                  <span style={{ fontSize: 11, fontWeight: 600, color: photos[slot.key] ? WHITE : GRAY_700, textShadow: photos[slot.key] ? '0 1px 3px rgba(0,0,0,0.6)' : 'none' }}>
                    {slot.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {/* Customer */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 6 }}>Customer</label>
            {!showQuickAdd ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                  style={{ flex: 1, height: 44, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: GRAY_100, fontFamily: 'inherit' }}>
                  <option value="">— No customer —</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => setShowQuickAdd(true)}
                  style={{ height: 44, padding: '0 12px', borderRadius: 10, border: `1px solid ${GRAY_300}`, background: GRAY_100, color: GRAY_700, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', flexShrink: 0 }}>
                  <UserPlus size={14} /> New
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={quickAddName} onChange={e => setQuickAddName(e.target.value)} placeholder="Customer name…"
                    style={{ flex: 1, height: 44, border: `1px solid ${PRIMARY}`, borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: GRAY_100, fontFamily: 'inherit' }} />
                  <button onClick={async () => {
                    if (!quickAddName.trim()) return
                    setCreatingCustomer(true)
                    try {
                      const c = await createCustomer(companyId, {
                        name: quickAddName.trim(), phone: null, email: null, billing_address: null,
                        account_number: null, payment_terms: null, tax_exempt: false,
                        secondary_contact_name: null, secondary_contact_phone: null,
                        secondary_contact_email: null, notes: null,
                      })
                      setCustomers(cs => [...cs, c].sort((a, b) => a.name.localeCompare(b.name)))
                      setCustomerId(c.id)
                      setQuickAddName('')
                      setShowQuickAdd(false)
                    } catch (e: any) { alert(e.message) }
                    finally { setCreatingCustomer(false) }
                  }} disabled={!quickAddName.trim() || creatingCustomer}
                    style={{ height: 44, padding: '0 14px', borderRadius: 10, border: 'none', background: PRIMARY, color: WHITE, fontWeight: 700, fontSize: 13, cursor: quickAddName.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                    {creatingCustomer ? '…' : 'Create'}
                  </button>
                  <button onClick={() => { setShowQuickAdd(false); setQuickAddName('') }}
                    style={{ width: 44, height: 44, borderRadius: 10, border: `1px solid ${GRAY_300}`, background: WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={14} color={GRAY_500} />
                  </button>
                </div>
                <p style={{ fontSize: 11, color: GRAY_500, margin: '5px 0 0' }}>Creates a new customer record and links it to this vehicle</p>
              </div>
            )}
          </div>
          {/* Notes */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_700, display: 'block', marginBottom: 6 }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional…"
              style={{ width: '100%', border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '10px 12px', fontSize: 14, resize: 'vertical', outline: 'none', background: GRAY_100, boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${GRAY_300}` }}>
          {saveError && (
            <p style={{ fontSize: 12, color: DANGER, margin: '0 0 10px', lineHeight: 1.5 }}>{saveError}</p>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => save(false)} disabled={!cleanVin || !!dupeVehicleId || !status || !allPhotosReady || saving}
            style={{ flex: 1, height: 48, borderRadius: 12, border: 'none', background: cleanVin && !dupeVehicleId && status && allPhotosReady ? PRIMARY : GRAY_300, color: cleanVin && !dupeVehicleId && status && allPhotosReady ? WHITE : GRAY_500, fontWeight: 700, fontSize: 15, cursor: cleanVin && !dupeVehicleId && status && allPhotosReady ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {saving ? 'Adding…' : 'Add Vehicle'}
          </button>
          <button onClick={() => save(true)} disabled={!cleanVin || !!dupeVehicleId || !status || !allPhotosReady || saving}
            style={{ flex: 1, height: 48, borderRadius: 12, border: 'none', background: cleanVin && !dupeVehicleId && status && allPhotosReady ? PRIMARY : GRAY_300, color: WHITE, fontWeight: 700, fontSize: 15, cursor: cleanVin && !dupeVehicleId && status && allPhotosReady ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            Add & Dispatch
          </button>
          </div>
        </div>
      </div>

      {sequenceActive && (
        <CameraCapture
          photoSequence={BACKFILL_PHOTO_SLOTS.map(s => s.label)}
          currentSequenceIndex={(() => { const i = BACKFILL_PHOTO_SLOTS.findIndex(s => !photos[s.key]); return i === -1 ? 0 : i })()}
          onSequenceCapture={(index, dataUrl) => setPhotos(prev => ({ ...prev, [BACKFILL_PHOTO_SLOTS[index].key]: dataUrl }))}
          onClose={() => setSequenceActive(false)}
        />
      )}
      {activePhotoKey && (
        <CameraCapture
          onCapture={dataUrl => { setPhotos(prev => ({ ...prev, [activePhotoKey]: dataUrl })); setActivePhotoKey(null) }}
          onClose={() => setActivePhotoKey(null)}
          title={BACKFILL_PHOTO_SLOTS.find(s => s.key === activePhotoKey)?.label}
        />
      )}
    </div>
  )
}

// ── CSV Import Modal ──────────────────────────────────────────────────────────

function CSVImportModal({ companyId, existingVins, onClose, onImported }: {
  companyId: string; existingVins: Set<string>; onClose: () => void; onImported: () => void
}) {
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [rows, setRows] = useState<any[]>([])
  const [skipDupes, setSkipDupes] = useState(true)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; skipped: string[] } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const parse = (text: string) => {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const hdrs = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/^"|"$/g, ''))
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row: any = {}
      hdrs.forEach((h, i) => { row[h] = vals[i] ?? '' })
      return { vin: row.vin ?? '', make: row.make ?? '', model: row.model ?? '', year: row.year ?? '', notes: row.notes ?? '', arrived_at: row.arrived_at ?? row.arrival_date ?? '' }
    }).filter(r => r.vin)
  }

  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => { setRows(parse(e.target?.result as string)); setStep('preview') }
    reader.readAsText(file)
  }

  const newRows = rows.filter(r => !existingVins.has(r.vin.toUpperCase()))
  const dupeRows = rows.filter(r => existingVins.has(r.vin.toUpperCase()))
  const toImport = skipDupes ? newRows : rows

  const doImport = async () => {
    setImporting(true)
    try {
      const res = await bulkInsertVehicles(toImport, companyId, null)
      setResult(res); setStep('done'); onImported()
    } finally { setImporting(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}>
      <div style={{ background: WHITE, borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${GRAY_300}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: GRAY_900, margin: 0 }}>Import CSV</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color={GRAY_500} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {step === 'upload' && (
            <>
              <div onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                style={{ border: `2px dashed ${GRAY_300}`, borderRadius: 12, padding: 40, textAlign: 'center', cursor: 'pointer', background: GRAY_100 }}>
                <Upload size={28} color={GRAY_500} style={{ margin: '0 auto 10px', display: 'block' }} />
                <p style={{ fontSize: 14, color: GRAY_700, margin: '0 0 4px', fontWeight: 600 }}>Drop CSV or click to browse</p>
                <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>Required: VIN — Optional: Make, Model, Year, Notes, Arrived At</p>
              </div>
              <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              <div style={{ marginTop: 14, background: GRAY_100, borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', margin: '0 0 4px' }}>Expected format</p>
                <code style={{ fontSize: 11, color: GRAY_700 }}>VIN,Make,Model,Year,Notes,Arrived At</code>
              </div>
            </>
          )}
          {step === 'preview' && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, background: SUCCESS_LIGHT, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: SUCCESS_DARK, margin: 0 }}>{newRows.length}</p>
                  <p style={{ fontSize: 11, color: SUCCESS_DARK, margin: 0 }}>New</p>
                </div>
                <div style={{ flex: 1, background: WARN_LIGHT, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: WARN_DARK, margin: 0 }}>{dupeRows.length}</p>
                  <p style={{ fontSize: 11, color: WARN_DARK, margin: 0 }}>Duplicates</p>
                </div>
              </div>
              {dupeRows.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, color: GRAY_700 }}>
                  <input type="checkbox" checked={skipDupes} onChange={e => setSkipDupes(e.target.checked)} />
                  Skip duplicate VINs
                </label>
              )}
              <div style={{ maxHeight: 260, overflowY: 'auto', border: `1px solid ${GRAY_300}`, borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: GRAY_100 }}>
                      {['VIN', 'Make', 'Model', 'Year', ''].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: GRAY_500, borderBottom: `1px solid ${GRAY_300}`, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isDupe = existingVins.has(r.vin.toUpperCase())
                      return (
                        <tr key={i} style={{ background: isDupe ? WARN_LIGHT : WHITE }}>
                          <td style={{ padding: '7px 12px', fontFamily: 'monospace', borderBottom: `1px solid ${GRAY_100}` }}>{r.vin}</td>
                          <td style={{ padding: '7px 12px', color: GRAY_700, borderBottom: `1px solid ${GRAY_100}` }}>{r.make}</td>
                          <td style={{ padding: '7px 12px', color: GRAY_700, borderBottom: `1px solid ${GRAY_100}` }}>{r.model}</td>
                          <td style={{ padding: '7px 12px', color: GRAY_700, borderBottom: `1px solid ${GRAY_100}` }}>{r.year}</td>
                          <td style={{ padding: '7px 12px', borderBottom: `1px solid ${GRAY_100}` }}>
                            <span style={{ background: isDupe ? WARN_LIGHT : SUCCESS_LIGHT, color: isDupe ? WARN_DARK : SUCCESS_DARK, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
                              {isDupe ? 'DUPE' : 'NEW'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {step === 'done' && result && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: 30, background: SUCCESS_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <CheckCircle size={28} color={SUCCESS} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: GRAY_900, margin: '0 0 6px' }}>{result.inserted} vehicles imported</h3>
              {result.skipped.length > 0 && <p style={{ fontSize: 13, color: GRAY_500, margin: 0 }}>{result.skipped.length} duplicates skipped</p>}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${GRAY_300}`, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {step !== 'done' && <button onClick={onClose} style={{ height: 42, padding: '0 18px', borderRadius: 10, border: `1px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>}
          {step === 'preview' && (
            <button onClick={doImport} disabled={importing || toImport.length === 0}
              style={{ height: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: PRIMARY, color: WHITE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {importing ? 'Importing…' : `Import ${toImport.length} Vehicle${toImport.length !== 1 ? 's' : ''}`}
            </button>
          )}
          {step === 'done' && <button onClick={onClose} style={{ height: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: GRAY_900, color: WHITE, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'all',            label: 'All' },
  { id: 'pending_arrival', label: 'Pending Arrival' },
  { id: 'on_lot',         label: 'On Lot' },
  { id: 'pending_pickup', label: 'Pending Pickup' },
  { id: 'picked_up',      label: 'Picked Up' },
  { id: 'completed',      label: 'Completed' },
]

export default function VehiclesPage() {
  const router = useRouter()
  const { effectiveCompany, user } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isFMC = effectiveCompany?.account_type === 'fmc'
  const companyId = effectiveCompany?.id ?? ''

  // Table state
  const [vehicles, setVehicles] = useState<any[]>([])
  const [spotLabels, setSpotLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [openKebab, setOpenKebab] = useState<string | null>(null)
  const [locations, setLocations] = useState<any[]>([])

  // Modals
  // showAddVehicle now opens the New Arrival / Add Existing Vehicle choice;
  // showAddExisting opens the Add Existing Vehicle (backfill) form itself.
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [showAddExisting, setShowAddExisting] = useState(false)
  const [showCSV, setShowCSV] = useState(false)
  const [dispatchSheet, setDispatchSheet] = useState<{ open: boolean; vin?: string; year?: string; make?: string; model?: string }>({ open: false })

  // Reports popover
  const [reportsVehicle, setReportsVehicle] = useState<any | null>(null)
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsList, setReportsList] = useState<any[]>([])

  // Bulk billing
  const lotMapEnabled = useFeatureFlag('lot_map')
  const reportingExportEnabled = useFeatureFlag('reporting_export')
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<string>>(new Set())
  const [showBulkBilling, setShowBulkBilling] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // View toggle + dashboard-style stats
  const [view, setView] = useState<'table' | 'board'>('table')
  const [occupancy, setOccupancy] = useState<{ occupied: number; total: number } | null>(null)
  const [arrivalsToday, setArrivalsToday] = useState(0)
  const [needsAttention, setNeedsAttention] = useState(0)
  const [unbilledCount, setUnbilledCount] = useState(0)
  const [todaysQueue, setTodaysQueue] = useState<TodaysQueue | null>(null)
  const [statFilter, setStatFilter] = useState<'arrivals_today' | 'needs_attention' | 'unbilled' | null>(null)

  const ATTENTION_STATUSES = new Set<WorkOrderStatus>(['on_lot_pending_repairs', 'on_hold', 'pending_release'])
  const isArrivingToday = (v: any) => {
    if (v.work_order_status !== 'pending_arrival' || !v.arrived_at) return false
    const start = new Date(); start.setHours(0, 0, 0, 0)
    return new Date(v.arrived_at) >= start
  }

  function toggleVehicleSelect(id: string) {
    setSelectedVehicleIds(prev => {
      const next = new Set<string>(Array.from(prev))
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function clearSelection() { setSelectedVehicleIds(new Set<string>()) }

  const loadVehicles = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const { data, error } = await createClient()
      .from('storage_vehicles')
      .select(`*, location:location_id(id, name, city, state)`)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    if (error) console.error('[vehicles] load error:', error)
    setVehicles(data ?? [])
    setLoading(false)

    const ids = (data ?? []).map(v => v.id)
    if (ids.length > 0) {
      const { data: assignments, error: assignError } = await createClient()
        .from('lot_vehicle_assignments')
        .select('vehicle_id, spot:lot_spots(label)')
        .in('vehicle_id', ids)
        .is('unassigned_at', null)
      if (assignError) console.error('[vehicles] spot load error:', assignError)
      const labels: Record<string, string> = {}
      for (const a of (assignments ?? [])) {
        const spot = a.spot as unknown as { label: string } | null
        if (spot?.label) labels[a.vehicle_id] = spot.label
      }
      setSpotLabels(labels)
    } else {
      setSpotLabels({})
    }
  }, [companyId])

  useEffect(() => { loadVehicles() }, [loadVehicles])

  const loadStats = useCallback(async () => {
    if (!companyId) return
    const [arrivals, attention, queue] = await Promise.all([
      getArrivalsTodayCount(companyId),
      getNeedsAttentionCount(companyId),
      getTodaysQueue(companyId),
    ])
    setArrivalsToday(arrivals)
    setNeedsAttention(attention)
    setTodaysQueue(queue)
    if (lotMapEnabled) {
      const [occ, kpis] = await Promise.all([getLotOccupancy(companyId), getBillingKPIs(companyId)])
      setOccupancy(occ)
      setUnbilledCount(kpis.unbilledCount)
    }
  }, [companyId, lotMapEnabled])
  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { if (isFMC && companyId) getStorageLocations(companyId).then(setLocations) }, [isFMC, companyId])

  // Derived
  const allTagged = vehicles.map(v => ({ ...v, _status: effectiveStatus(v) }))
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const filtered = allTagged.filter(v => {
    const s = search.toLowerCase()
    if (s && !v.vin?.toLowerCase().includes(s) && !v.make?.toLowerCase().includes(s) && !v.model?.toLowerCase().includes(s)) return false
    if (locationFilter && v.location_id !== locationFilter) return false
    if (activeTab !== 'all' && v._status !== activeTab) return false
    if (statFilter === 'arrivals_today' && !isArrivingToday(v)) return false
    if (statFilter === 'needs_attention' && !ATTENTION_STATUSES.has(v.work_order_status)) return false
    if (statFilter === 'unbilled' && v.billed_through_date) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const pa = STATUS_SORT[a._status] ?? 5
    const pb = STATUS_SORT[b._status] ?? 5
    return pa - pb
  })

  const counts: Record<string, number> = {
    all: allTagged.length,
    pending_arrival: allTagged.filter(v => v._status === 'pending_arrival').length,
    on_lot: allTagged.filter(v => v._status === 'on_lot').length,
    pending_pickup: allTagged.filter(v => v._status === 'pending_pickup').length,
    picked_up: allTagged.filter(v => v._status === 'picked_up').length,
    completed: allTagged.filter(v => v._status === 'completed').length,
  }

  const statsOnLot = allTagged.filter(v => ['pending_arrival', 'on_lot', 'pending_pickup'].includes(v._status)).length
  const statsUninspected = allTagged.filter(v => ['pending_arrival', 'on_lot', 'pending_pickup'].includes(v._status) && !v.latest_inspection_id).length
  const statsReleasedMonth = allTagged.filter(v => v._status === 'picked_up' && v.released_at >= monthStart).length
  const existingVins = new Set(allTagged.filter(v => v._status !== 'completed').map(v => v.vin?.toUpperCase() ?? ''))


  const handleOpenReports = async (v: any) => {
    setReportsVehicle(v)
    setReportsLoading(true)
    setReportsList([])
    const ids = Array.from(new Set([v.checkin_inspection_id, v.checkout_inspection_id, ...(v.inspection_ids ?? [])].filter(Boolean)))
    if (!ids.length) { setReportsList([]); setReportsLoading(false); return }
    const data = await fetchInspectionsByIds(ids)
    setReportsList(data)
    setReportsLoading(false)
  }

  const exportCSV = async () => {
    if (!reportingExportEnabled) return
    // Wrap in quotes if value contains commas, quotes, or newlines
    const esc = (val: string | number | null | undefined): string => {
      if (val === null || val === undefined) return ''
      const s = String(val)
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s
    }

    // Collect inspection IDs needed for check-in / check-out scores
    const inspIds = new Set<string>()
    for (const v of filtered) {
      if (v.checkin_inspection_id) inspIds.add(v.checkin_inspection_id)
      if (v.checkout_inspection_id) inspIds.add(v.checkout_inspection_id)
    }

    // Batch-fetch scores and dates in a single query
    const scoreMap = new Map<string, { score: number | null; date: string | null }>()
    if (inspIds.size > 0) {
      const { data: inspRows } = await createClient()
        .from('vehicle_inspections')
        .select('id, vehicle_score, created_at')
        .in('id', Array.from(inspIds))
      for (const row of (inspRows ?? [])) {
        scoreMap.set(row.id, { score: row.vehicle_score ?? null, date: row.created_at ?? null })
      }
    }

    // Fetch company billing defaults for accrued-amount calculation
    const { data: companyData } = await createClient()
      .from('companies')
      .select('default_billing_type, default_daily_rate, default_monthly_rate')
      .eq('id', companyId)
      .single()
    const companyBilling = companyData ?? { default_billing_type: null, default_daily_rate: null, default_monthly_rate: null }

    const headers = [
      'VIN', 'Year', 'Make', 'Model', 'Status', 'Intake Date', 'Picked Up Date', 'Days on Lot',
      'Billing Type', 'Rate', 'Accrued Amount', 'Sub Client Name',
      'Check-In Score', 'Check-In Date', 'Check-Out Score', 'Check-Out Date',
    ]

    // checkin_inspection_id / checkout_inspection_id are updated to the most recent inspection
    // of each type on every completion, so these already reflect the latest check-in / check-out.
    // If a different rule is wanted (e.g. first check-in, not most recent), revisit here.
    const rows = filtered.map(v => {
      const days = daysOnLot(v.arrived_at, v.released_at, v._status)
      const billing = calculateVehicleBilling(v, companyBilling)
      const statusLabel = STATUS_CFG[v._status as LifecycleStatus]?.label ?? v._status ?? ''
      const intakeDate = v.arrived_at ? new Date(v.arrived_at).toLocaleDateString() : ''
      const pickedUpDate = (v.released_date || v.released_at)
        ? new Date(v.released_date ?? v.released_at).toLocaleDateString() : ''

      const ciInsp = v.checkin_inspection_id ? scoreMap.get(v.checkin_inspection_id) : undefined
      const coInsp = v.checkout_inspection_id ? scoreMap.get(v.checkout_inspection_id) : undefined

      return [
        esc(v.vin),
        esc(v.year),
        esc(v.make),
        esc(v.model),
        esc(statusLabel),
        esc(intakeDate),
        esc(pickedUpDate),
        esc(days),
        esc(billing.billingType === 'daily' ? 'Daily' : 'Monthly'),
        esc(billing.rate),
        esc(billing.accruedAmount !== null ? billing.accruedAmount.toFixed(2) : null),
        esc(v.sub_client_name),
        esc(ciInsp?.score ?? null),
        esc(ciInsp?.date ? new Date(ciInsp.date).toLocaleDateString() : null),
        esc(coInsp?.score ?? null),
        esc(coInsp?.date ? new Date(coInsp.date).toLocaleDateString() : null),
      ].join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')
    const date = new Date().toISOString().slice(0, 10)
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
      download: `condition-iq-vehicles-${date}.csv`,
    })
    a.click()
  }

  // ── Browse mode ────────────────────────────────────────────────────────────
  return (
    <>
    <LoadingOverlay show={loading && vehicles.length === 0 && !showAddVehicle} fullScreen />
    {!isDesktop && <MobilePageHeader />}
    <div style={{ padding: isDesktop ? '24px 28px' : '16px', paddingTop: isDesktop ? '24px' : '16px', paddingBottom: isDesktop ? undefined : 'calc(80px + env(safe-area-inset-bottom))', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}.veh-row:hover{background:${GRAY_100}!important}`}</style>

      {/* Stat row — clickable, filters the table */}
      {isDesktop && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 12 }}>
          {[
            { key: 'free_spots' as const, label: 'Free Spots', value: occupancy ? occupancy.total - occupancy.occupied : '—', color: PRIMARY_PILL_TEXT, icon: MapPin },
            { key: 'arrivals_today' as const, label: 'Arriving Today', value: arrivalsToday, color: PRIMARY_PILL_TEXT, icon: Car },
            { key: 'needs_attention' as const, label: 'Needs Attention', value: needsAttention, color: AMBER_DARK, icon: AlertTriangle },
            { key: 'unbilled' as const, label: 'Unbilled', value: unbilledCount, color: AMBER_DARK, icon: DollarSign },
          ].map(s => {
            const Icon = s.icon
            const clickable = s.key !== 'free_spots'
            const active = clickable && statFilter === s.key
            return (
              <button key={s.key}
                onClick={() => s.key === 'free_spots' ? router.push('/lot') : setStatFilter(f => f === s.key ? null : s.key as any)}
                style={{
                  background: active ? GRAY_900 : WHITE, border: `1px solid ${active ? GRAY_900 : GRAY_300}`,
                  borderRadius: 14, padding: '14px 18px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                <div>
                  <p style={{ fontSize: 12, color: active ? 'rgba(240,244,248,0.6)' : GRAY_500, margin: '0 0 4px', fontWeight: 500 }}>{s.label}</p>
                  <p style={{ fontSize: 26, fontWeight: 800, color: active ? WHITE : s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
                </div>
                <Icon size={18} color={active ? 'rgba(240,244,248,0.4)' : GRAY_300} />
              </button>
            )
          })}
        </div>
      )}

      {/* Capacity bar */}
      {isDesktop && lotMapEnabled && occupancy && (
        <div style={{ marginBottom: 20 }}>
          <CapacityBar occupied={occupancy.occupied} total={occupancy.total} />
        </div>
      )}

      {/* Today strip */}
      {isDesktop && todaysQueue && (todaysQueue.arrivingToday.length > 0 || todaysQueue.readyForRelease.length > 0 || todaysQueue.needsStatusUpdate.length > 0) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, overflowX: 'auto' }}>
          {todaysQueue.arrivingToday.map(v => (
            <button key={`arr-${v.id}`} onClick={() => router.push(`/inventory/${v.id}`)}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 20, border: `1px solid ${PRIMARY_LIGHT}`, background: PRIMARY_LIGHT, color: PRIMARY_PILL_TEXT, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Arriving: {v.vin.slice(-6)}
            </button>
          ))}
          {todaysQueue.readyForRelease.map(v => (
            <button key={`ready-${v.id}`} onClick={() => router.push(`/inventory/${v.id}`)}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 20, border: `1px solid ${SUCCESS_LIGHT}`, background: SUCCESS_LIGHT, color: SUCCESS_DARK, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Ready for Release: {v.vin.slice(-6)}
            </button>
          ))}
          {todaysQueue.needsStatusUpdate.map(v => (
            <button key={`stale-${v.id}`} onClick={() => router.push(`/inventory/${v.id}`)}
              style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 20, border: `1px solid ${WARN_LIGHT}`, background: WARN_LIGHT, color: WARN_DARK, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Needs Update: {v.vin.slice(-6)}
            </button>
          ))}
        </div>
      )}

      {/* FMC location pills */}
      {isFMC && locations.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {[{ id: null, name: 'All Locations' }, ...locations.filter(l => l.active !== false)].map(l => (
            <button key={l.id ?? 'all'} onClick={() => setLocationFilter(l.id)}
              style={{ height: 30, padding: '0 14px', borderRadius: 20, border: `1px solid ${locationFilter === l.id ? PRIMARY : GRAY_300}`, background: locationFilter === l.id ? PRIMARY_LIGHT : WHITE, color: locationFilter === l.id ? PRIMARY_PILL_TEXT : GRAY_700, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              {l.name}
            </button>
          ))}
        </div>
      )}

      {/* Mobile filter tab scroll strip */}
      {!isDesktop && (
        <div style={{ display: 'flex', overflowX: 'auto', gap: 8, marginBottom: 12, marginLeft: -16, marginRight: -16, padding: '0 16px 4px', scrollbarWidth: 'none' } as React.CSSProperties}>
          <style>{`.veh-tab-scroll::-webkit-scrollbar{display:none}`}</style>
          {TABS.map(tab => {
            const active = activeTab === tab.id
            const c = counts[tab.id] ?? 0
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ height: 30, padding: '0 14px', borderRadius: 20, border: 'none', flexShrink: 0, background: active ? GRAY_900 : GRAY_100, color: active ? WHITE : GRAY_700, fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                {tab.label}
                {c > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'rgba(255,255,255,0.2)' : GRAY_300, color: active ? WHITE : GRAY_700, borderRadius: 8, padding: '1px 5px' }}>{c}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Controls */}
      {isDesktop ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 140 }}>
            <Search size={14} color={GRAY_500} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search VIN, make, model…"
              style={{ width: '100%', height: 38, border: `1px solid ${GRAY_300}`, borderRadius: 10, paddingLeft: 32, paddingRight: 10, fontSize: 13, outline: 'none', background: WHITE, boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 3, background: GRAY_100, borderRadius: 10, padding: 3 }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id
              const c = counts[tab.id] ?? 0
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  style={{ height: 32, padding: '0 10px', borderRadius: 7, border: 'none', background: active ? GRAY_900 : 'transparent', color: active ? WHITE : GRAY_700, fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  {tab.label}
                  {c > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'rgba(255,255,255,0.2)' : GRAY_300, color: active ? WHITE : GRAY_700, borderRadius: 8, padding: '1px 5px' }}>{c}</span>}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <div style={{ display: 'flex', gap: 2, background: GRAY_100, borderRadius: 10, padding: 2 }}>
              <button onClick={() => setView('table')} title="Table view"
                style={{ height: 34, width: 34, borderRadius: 8, border: 'none', background: view === 'table' ? WHITE : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LayoutGrid size={15} color={view === 'table' ? GRAY_900 : GRAY_500} />
              </button>
              <button onClick={() => setView('board')} title="Board view"
                style={{ height: 34, width: 34, borderRadius: 8, border: 'none', background: view === 'board' ? WHITE : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Columns3 size={15} color={view === 'board' ? GRAY_900 : GRAY_500} />
              </button>
            </div>
            <button onClick={reportingExportEnabled ? exportCSV : undefined} title={reportingExportEnabled === false ? 'Pro feature' : undefined}
              style={{ height: 38, padding: '0 12px', borderRadius: 10, border: `1px solid ${GRAY_300}`, background: reportingExportEnabled === false ? GRAY_100 : WHITE, color: reportingExportEnabled === false ? GRAY_500 : GRAY_700, fontSize: 13, fontWeight: 500, cursor: reportingExportEnabled === false ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
              {reportingExportEnabled === false ? <Lock size={14} color={GRAY_300} /> : <Download size={14} />}Export
            </button>
            <button onClick={() => setShowCSV(true)} style={{ height: 38, padding: '0 12px', borderRadius: 10, border: `1px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><Upload size={14} />Import CSV</button>
            <button onClick={() => setShowAddVehicle(true)} style={{ height: 38, padding: '0 14px', borderRadius: 10, border: 'none', background: PRIMARY, color: WHITE, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><Plus size={14} />Add Vehicle</button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {/* Mobile search */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} color={GRAY_500} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search VIN, make, model…"
              style={{ width: '100%', height: 44, border: `1px solid ${GRAY_300}`, borderRadius: 12, paddingLeft: 34, paddingRight: 10, fontSize: 14, outline: 'none', background: WHITE, boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          {/* Mobile action row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowCSV(true)} style={{ flex: 1, height: 44, borderRadius: 12, border: `1px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: 'inherit' }}><Upload size={14} />Import CSV</button>
            <button onClick={() => setShowAddVehicle(true)} style={{ flex: 1, height: 44, borderRadius: 12, border: 'none', background: PRIMARY, color: WHITE, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: 'inherit' }}><Plus size={14} />Add Vehicle</button>
          </div>
        </div>
      )}

      {/* Board view */}
      {view === 'board' && isDesktop && (
        <BoardView vehicles={sorted} userId={user?.id ?? ''} onChanged={loadVehicles} />
      )}

      {/* Table */}
      {(view === 'table' || !isDesktop) && (
      <div style={{ background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 14, overflow: 'hidden' }}>
        {isDesktop ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: GRAY_100, borderBottom: `1px solid ${GRAY_300}` }}>
                {lotMapEnabled && (
                  <th style={{ padding: '11px 10px 11px 14px', width: 36 }}>
                    <input type="checkbox" checked={sorted.length > 0 && sorted.every(v => selectedVehicleIds.has(v.id))}
                      onChange={e => setSelectedVehicleIds(e.target.checked ? new Set(sorted.map(v => v.id)) : new Set())}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: PRIMARY }} />
                  </th>
                )}
                {[
                  { label: 'Vehicle', align: 'left' },
                  { label: 'Spot', align: 'left' },
                  { label: 'Status', align: 'left' },
                  { label: 'Days on Lot', align: 'right' },
                  { label: 'Billed Through', align: 'right' },
                  { label: 'Reports', align: 'right' },
                  { label: 'Actions', align: 'left' },
                ].map(h => (
                  <th key={h.label} style={{ padding: '11px 14px', textAlign: h.align as 'left' | 'right', fontSize: 11, fontWeight: 700, color: GRAY_500, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={lotMapEnabled ? 8 : 7} style={{ padding: '40px 0', textAlign: 'center' }}><Loader2 size={20} color={GRAY_500} style={{ animation: 'spin 0.8s linear infinite' }} /></td></tr>}
              {!loading && sorted.length === 0 && <tr><td colSpan={lotMapEnabled ? 8 : 7} style={{ padding: '40px 0', textAlign: 'center', fontSize: 14, color: GRAY_500 }}>No vehicles found</td></tr>}
              {!loading && sorted.map(v => {
                const sc = STATUS_CFG[v._status as LifecycleStatus] ?? STATUS_CFG.on_lot
                const rowAccent = getSpotPinColor(v.work_order_status) ?? GRAY_500
                const days = daysOnLot(v.arrived_at, v.released_at, v._status)
                const isExp = expandedId === v.id
                const reportCount = v.inspection_ids?.length ?? ([v.checkin_inspection_id, v.checkout_inspection_id].filter(Boolean).length)
                const isTerminal = v._status === 'picked_up' || v._status === 'completed'
                const tertiaryDate = v._status === 'pending_arrival' ? null : isTerminal ? (v.released_date ?? v.released_at) : v.arrived_at
                const tertiaryLabel = isTerminal ? 'Picked up' : 'Arrived'
                return (
                  <Fragment key={v.id}>
                    <tr className="veh-row" onClick={() => { setExpandedId(isExp ? null : v.id); setOpenKebab(null) }}
                      style={{ borderLeft: `3px solid ${rowAccent}`, borderBottom: isExp ? 'none' : `1px solid ${GRAY_100}`, cursor: 'pointer', background: selectedVehicleIds.has(v.id) ? PRIMARY_LIGHT : isExp ? GRAY_100 : undefined }}>
                      {/* Checkbox */}
                      {lotMapEnabled && (
                        <td style={{ padding: '13px 10px 13px 14px', width: 36 }} onClick={e => { e.stopPropagation(); toggleVehicleSelect(v.id) }}>
                          <input type="checkbox" checked={selectedVehicleIds.has(v.id)} onChange={() => toggleVehicleSelect(v.id)}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: PRIMARY }} />
                        </td>
                      )}
                      {/* Vehicle */}
                      <td style={{ padding: '13px 14px' }}>
                        {(v.make || v.model)
                          ? <><p style={{ fontSize: 13, fontWeight: 600, color: GRAY_900, margin: 0 }}>{[v.year, v.make, v.model].filter(Boolean).join(' ')}</p><p style={{ fontSize: 11, color: GRAY_500, margin: 0, fontFamily: 'monospace' }}>{v.vin}</p></>
                          : <p style={{ fontSize: 13, fontWeight: 600, color: GRAY_900, margin: 0, fontFamily: 'monospace' }}>{v.vin}</p>}
                        {tertiaryDate && (
                          <p style={{ fontSize: 10, color: GRAY_300, margin: 0 }}>
                            {tertiaryLabel} {new Date(tertiaryDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                        {v.location?.name && <p style={{ fontSize: 10, color: GRAY_300, margin: 0 }}>{v.location.name}</p>}
                      </td>
                      {/* Spot */}
                      <td style={{ padding: '13px 14px' }}>
                        <SpotBadge label={spotLabels[v.id]} />
                      </td>
                      {/* Status */}
                      <td style={{ padding: '13px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: sc.bg, color: sc.color, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                          {sc.pulse && <span style={{ width: 6, height: 6, borderRadius: 3, background: WARN, animation: 'pulse 1.5s ease-in-out infinite', display: 'inline-block' }} />}
                          {sc.label}
                        </span>
                      </td>
                      {/* Days on Lot */}
                      <td style={{ padding: '13px 14px', fontSize: 13, textAlign: 'right' }}>
                        {v._status === 'pending_arrival'
                          ? <span style={{ color: GRAY_500, fontStyle: 'italic' }}>Pending</span>
                          : days !== null
                            ? <span style={{ color: DAYS_ON_LOT_COLOR, fontWeight: 600 }}>{days}d</span>
                            : <span style={{ color: GRAY_300 }}>—</span>}
                      </td>
                      {/* Billed Through */}
                      <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                        <BilledThroughValue date={v.billed_through_date} />
                      </td>
                      {/* Reports */}
                      <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                        <span style={{ background: GRAY_100, color: GRAY_700, borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>{reportCount} report{reportCount !== 1 ? 's' : ''}</span>
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '13px 14px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          {v.work_order_status === 'pending_arrival' ? (
                            <button onClick={() => router.push(`/inventory/${v.id}/checkpoint/intake`)}
                              style={{ height: 28, padding: '0 12px', borderRadius: 7, border: 'none', background: PRIMARY, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                              Check In
                            </button>
                          ) : (
                            <ChangeStatus vehicleId={v.id} currentStatus={v.work_order_status} userId={user?.id ?? ''} onChanged={loadVehicles} variant="compact" />
                          )}
                          {/* Kebab */}
                          <div style={{ position: 'relative' }}>
                            <button onClick={e => { e.stopPropagation(); setOpenKebab(openKebab === v.id ? null : v.id) }}
                              style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${GRAY_300}`, background: WHITE, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <MoreVertical size={13} color={GRAY_700} />
                            </button>
                            {openKebab === v.id && (
                              <div style={{ position: 'absolute', right: 0, top: 32, background: WHITE, border: `1px solid ${GRAY_300}`, borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 150, padding: '4px 0' }}>
                                <button onClick={() => { router.push(`/inventory/${v.id}`); setOpenKebab(null) }} style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: GRAY_900, cursor: 'pointer', fontFamily: 'inherit' }}>View</button>
                                {v._status !== 'pending_arrival' && v._status !== 'picked_up' && v._status !== 'completed' && (
                                  <button onClick={() => { router.push(`/inventory/${v.id}`); setOpenKebab(null) }} style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: GRAY_900, cursor: 'pointer', fontFamily: 'inherit' }}>Start Inspection</button>
                                )}
                                <button onClick={() => { setConfirmDeleteId(v.id); setOpenKebab(null) }}
                                  style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: DANGER, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {isExp && (
                      <tr>
                        <td colSpan={lotMapEnabled ? 8 : 7} style={{ padding: 0, borderBottom: `1px solid ${GRAY_300}` }}>
                          <ExpandedRow
                            vehicle={v}
                            spotLabel={spotLabels[v.id] ?? null}
                            onDispatch={() => setDispatchSheet({ open: true, vin: v.vin, year: v.year, make: v.make, model: v.model })}
                            onCheckIn={() => router.push(`/inventory/${v.id}/checkpoint/intake`)}
                            onAssignSpot={() => router.push('/lot')}
                            onAddCharge={() => router.push(`/inventory/${v.id}`)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        ) : (
          // Mobile cards
          <div>
            {loading && <div style={{ padding: '40px 0', textAlign: 'center' }}><Loader2 size={20} color={GRAY_500} style={{ animation: 'spin 0.8s linear infinite' }} /></div>}
            {!loading && sorted.length === 0 && <p style={{ padding: '40px 20px', textAlign: 'center', fontSize: 14, color: GRAY_500, margin: 0 }}>No vehicles found</p>}
            {!loading && sorted.map(v => {
              const sc = STATUS_CFG[v._status as LifecycleStatus] ?? STATUS_CFG.on_lot
              const rowAccent = getSpotPinColor(v.work_order_status) ?? GRAY_500
              const days = daysOnLot(v.arrived_at, v.released_at, v._status)
              const isExp = expandedId === v.id
              return (
                <div key={v.id} style={{ borderBottom: `1px solid ${GRAY_100}` }}>
                  <div onClick={() => setExpandedId(isExp ? null : v.id)}
                    style={{ padding: '13px 14px', borderLeft: `4px solid ${rowAccent}`, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        {(v.make || v.model)
                          ? <><p style={{ fontSize: 14, fontWeight: 700, color: GRAY_900, margin: 0 }}>{[v.year, v.make, v.model].filter(Boolean).join(' ')}</p><p style={{ fontSize: 11, color: GRAY_500, margin: 0, fontFamily: 'monospace' }}>{v.vin}</p></>
                          : <p style={{ fontSize: 13, fontWeight: 700, color: GRAY_900, margin: 0, fontFamily: 'monospace' }}>{v.vin}</p>}
                      </div>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>{sc.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                      {v._status === 'pending_arrival'
                        ? <span style={{ fontSize: 12, color: GRAY_500, fontStyle: 'italic' }}>Pending</span>
                        : days !== null && <span style={{ fontSize: 12, color: DAYS_ON_LOT_COLOR, fontWeight: 600 }}>{days}d on lot</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      {v.work_order_status === 'pending_arrival' ? (
                        <button onClick={() => router.push(`/inventory/${v.id}/checkpoint/intake`)}
                          style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: PRIMARY, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Check In
                        </button>
                      ) : (
                        <ChangeStatus vehicleId={v.id} currentStatus={v.work_order_status} userId={user?.id ?? ''} onChanged={loadVehicles} variant="compact" />
                      )}
                      <button onClick={() => router.push(`/inventory/${v.id}`)} style={{ height: 30, padding: '0 12px', borderRadius: 8, border: `1px solid ${PRIMARY}`, background: WHITE, color: PRIMARY, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>View</button>
                    </div>
                  </div>
                  {isExp && (
                    <ExpandedRow
                      vehicle={v}
                      spotLabel={spotLabels[v.id] ?? null}
                      onDispatch={() => setDispatchSheet({ open: true, vin: v.vin, year: v.year, make: v.make, model: v.model })}
                      onCheckIn={() => router.push(`/inventory/${v.id}/checkpoint/intake`)}
                      onAssignSpot={() => router.push('/lot')}
                      onAddCharge={() => router.push(`/inventory/${v.id}`)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
      )}

      {/* Modals */}
      {showAddVehicle && (
        <AddVehicleChoice
          onClose={() => setShowAddVehicle(false)}
          onNewArrival={() => { setShowAddVehicle(false); router.push('/vehicles/intake') }}
          onAddExisting={() => { setShowAddVehicle(false); setShowAddExisting(true) }}
        />
      )}
      {showAddExisting && (
        <AddExistingVehicleSlideOver companyId={companyId} userId={user?.id ?? ''} isFMC={isFMC} locations={locations} onClose={() => setShowAddExisting(false)}
          onAdded={() => { setShowAddExisting(false); loadVehicles() }}
          onAddAndDispatch={vin => { setShowAddExisting(false); setDispatchSheet({ open: true, vin }) }} />
      )}
      {showCSV && <CSVImportModal companyId={companyId} existingVins={existingVins} onClose={() => setShowCSV(false)} onImported={loadVehicles} />}
      {openKebab && <div onClick={() => setOpenKebab(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}

      {/* Reports Modal */}
      {reportsVehicle && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', padding: 16 }}>
          <div style={{ background: WHITE, borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: `1px solid ${GRAY_300}` }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: GRAY_900, margin: 0 }}>Reports</h3>
                <p style={{ fontSize: 12, color: GRAY_500, margin: '2px 0 0', fontFamily: 'monospace' }}>
                  {[reportsVehicle.year, reportsVehicle.make, reportsVehicle.model].filter(Boolean).join(' ') || reportsVehicle.vin}
                </p>
              </div>
              <button onClick={() => setReportsVehicle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <X size={18} color={GRAY_500} />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              {reportsLoading ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <Loader2 size={20} color={GRAY_500} style={{ animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : reportsList.length === 0 ? (
                <p style={{ fontSize: 13, color: GRAY_500, textAlign: 'center', padding: '16px 0', margin: 0 }}>No completed reports found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {reportsList.map((r, i) => {
                    const usageLbl = r.usage_status === 'checkin' ? 'Check-In'
                      : r.usage_status === 'checkout' ? 'Check-Out'
                      : i === 0 ? 'Check-In' : 'Check-Out'
                    const label = `${usageLbl} Report`
                    const dateStr = new Date(r.report_generated_at ?? r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                    const pdfUrl: string | null = r.report_url ?? null
                    return (
                      <div key={r.id} style={{ background: GRAY_100, border: `1px solid ${GRAY_300}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: GRAY_900, margin: '0 0 2px' }}>{label}</p>
                          <p style={{ fontSize: 12, color: GRAY_500, margin: 0 }}>{dateStr}</p>
                          {r.status === 'in_progress' && <p style={{ fontSize: 11, color: WARN, margin: '2px 0 0', fontWeight: 600 }}>In Progress</p>}
                        </div>
                        {pdfUrl ? (
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={async () => {
                                const url = pdfUrl.startsWith('http') ? pdfUrl : await getReportSignedUrlAction(pdfUrl)
                                if (url) window.open(url, '_blank')
                              }}
                              style={{ height: 28, padding: '0 10px', borderRadius: 7, border: 'none', background: PRIMARY, color: WHITE, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                            >View PDF</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: GRAY_300 }}>No report yet</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <SendLinkSheet
        isOpen={dispatchSheet.open}
        onClose={() => setDispatchSheet({ open: false })}
        prefilledVin={dispatchSheet.vin}
        prefilledYear={dispatchSheet.year}
        prefilledMake={dispatchSheet.make}
        prefilledModel={dispatchSheet.model}
      />

      {/* Bulk billing selection bar */}
      {lotMapEnabled && selectedVehicleIds.size > 0 && (
        <div style={{ position: 'fixed', bottom: isDesktop ? 24 : 'calc(72px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: GRAY_900, borderRadius: 16, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.35)', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: WHITE }}>
            {selectedVehicleIds.size} vehicle{selectedVehicleIds.size !== 1 ? 's' : ''} selected
          </span>
          <button onClick={() => setShowBulkBilling(true)}
            style={{ height: 36, padding: '0 16px', borderRadius: 10, border: 'none', background: PRIMARY, color: WHITE, fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            <Receipt size={14} /> Bulk Bill
          </button>
          <button onClick={clearSelection}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color={GRAY_500} />
          </button>
        </div>
      )}

      {showBulkBilling && (
        <BulkBillingModal
          companyId={companyId}
          companyName={effectiveCompany?.name ?? 'Your Company'}
          userId={user?.id ?? null}
          vehicles={allTagged.filter(v => selectedVehicleIds.has(v.id)) as BulkVehicle[]}
          onClose={() => setShowBulkBilling(false)}
          onSuccess={() => { setShowBulkBilling(false); clearSelection() }}
        />
      )}

      {confirmDeleteId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setConfirmDeleteId(null)} />
          <div style={{ position: 'relative', background: WHITE, borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: GRAY_900, margin: '0 0 12px' }}>Delete Vehicle</h3>
            <p style={{ fontSize: 14, color: GRAY_700, lineHeight: 1.6, margin: '0 0 24px' }}>Are you sure you want to delete this vehicle? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDeleteId(null)} style={{ flex: 1, height: 44, borderRadius: 10, border: `1px solid ${GRAY_300}`, background: WHITE, color: GRAY_700, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={() => { deleteStorageVehicle(confirmDeleteId).then(loadVehicles); setConfirmDeleteId(null) }} style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: DANGER, color: WHITE, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setErrorMsg(null)} />
          <div style={{ position: 'relative', background: WHITE, borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: GRAY_900, margin: '0 0 12px' }}>Something went wrong</h3>
            <p style={{ fontSize: 14, color: GRAY_700, lineHeight: 1.6, margin: '0 0 24px' }}>{errorMsg}</p>
            <button onClick={() => setErrorMsg(null)} style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: GRAY_900, color: WHITE, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>OK</button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
    </>
  )
}

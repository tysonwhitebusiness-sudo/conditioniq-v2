'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { createClient } from '@/lib/supabase/client'
import { releaseVehicle, markVehicleOnLot, markVehiclePendingPickup } from '@/lib/storage-actions'
import { fetchInspectionsByIds, fetchInspectionsByVin, fetchInspectorNames, updateVehicleLifecycleStatusAction, getReportSignedUrlAction, fetchFullInspectionAction, loadInspectionForResume, findInProgressInspection, markStaleInProgressAsAbandoned } from '@/lib/inspection-server-actions'
import { checkUsageState, abandonInspection, type UsageState } from '@/lib/usage-actions'
import UsageConfirmationModal from '@/components/ui/usage-confirmation-modal'
import { type StepId } from '@/components/inspection-wizard/inspection-wizard'
import { calculateVehicleBilling, type BillingType } from '@/lib/lot-actions'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import InspectionWizard from '@/components/inspection-wizard/inspection-wizard'
import BottomNav from '@/components/ui/bottom-nav'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import {
  ArrowLeft, Play, Send, ExternalLink, Download, Eye, ClipboardList, Plus,
  Camera, Loader2, X, CheckCircle, LogOut, DollarSign, Lock, Users, Pencil, Trash2,
  Car, MapPin, RefreshCw, FileText,
} from 'lucide-react'
import { logVehicleEvent, getVehicleEvents, type VehicleEvent, type VehicleEventType } from '@/lib/vehicle-events-actions'
import { linkVehicleToCustomer, getCustomers, type Customer } from '@/lib/customer-actions'
import {
  getVehicleCharges, applyFeeToVehicle, applyReportCostToVehicle, updateCharge, deleteCharge,
  getFeeTypes, getReportCosts, type VehicleCharge, type FeeType, type ReportCosts,
} from '@/lib/lot-fee-actions'
import { getBilledChargeIds } from '@/lib/invoice-charge-actions'
import LoadingOverlay from '@/components/ui/loading-overlay'
import VehicleInvoiceHistory from '@/components/billing/vehicle-invoice-history'
import SectionCard from '@/components/ui/section-card'

// ── Types ─────────────────────────────────────────────────────────────────────

type LifecycleStatus = 'pending_arrival' | 'on_lot' | 'pending_pickup' | 'picked_up' | 'completed'
type AppStep = 'view' | 'inspecting'

// ── Helpers ───────────────────────────────────────────────────────────────────

function effectiveStatus(v: any): LifecycleStatus {
  const ls = v.lifecycle_status as string | null | undefined
  if (ls && !['in_progress', 'releasing', 'released', 'one_off'].includes(ls)) return ls as LifecycleStatus
  if (ls === 'releasing') return 'pending_pickup'
  if (ls === 'released') return 'picked_up'
  if (ls === 'one_off') return 'completed'
  switch (v.status) {
    case 'released':           return 'picked_up'
    case 'releasing':          return 'pending_pickup'
    case 'inspected':          return 'on_lot'
    case 'pending_inspection': return 'pending_arrival'
    case 'active':             return v.checkin_inspection_id ? 'on_lot' : 'pending_arrival'
    default:                   return 'pending_arrival'
  }
}

const STATUS_CFG: Record<LifecycleStatus, { label: string; bg: string; color: string; pulse?: boolean }> = {
  pending_arrival: { label: 'PENDING ARRIVAL', bg: '#F0F4F8',  color: '#4A5568' },
  on_lot:          { label: 'ON LOT',          bg: '#E0F7FC',  color: '#0097B2' },
  pending_pickup:  { label: 'PENDING PICKUP',  bg: '#FEF3C7',  color: '#92400E', pulse: true },
  picked_up:       { label: 'PICKED UP',       bg: '#D1FAE5',  color: '#065F46' },
  completed:       { label: 'COMPLETED',       bg: '#F3E8FF',  color: '#7E22CE' },
}

function daysOnLot(arrivedAt: string, releasedAt: string | null, status: LifecycleStatus): number | null {
  if (status === 'completed') return null
  if (!arrivedAt) return null
  const end = releasedAt ? new Date(releasedAt) : new Date()
  return Math.max(0, Math.floor((end.getTime() - new Date(arrivedAt).getTime()) / 86400000))
}

function daysColor(d: number) { return d < 30 ? '#059669' : d < 60 ? '#D97706' : '#DC2626' }

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateOnly(s: string): Date {
  return new Date(s + 'T00:00:00')
}

function daysBetween(startStr: string, endStr: string): number {
  return Math.max(0, Math.floor((parseDateOnly(endStr).getTime() - parseDateOnly(startStr).getTime()) / 86400000))
}

const REPORT_TYPE_TAG_CFG: Record<string, { label: string; bg: string; color: string }> = {
  checkin:  { label: 'CHECK-IN',  bg: '#E0F7FC', color: '#0097B2' },
  checkout: { label: 'CHECK-OUT', bg: '#EDE9FE', color: '#7C3AED' },
  one_off:  { label: 'ONE-OFF',   bg: '#FEF3C7', color: '#92400E' },
}

function reportTypeTag(type: string) {
  const c = REPORT_TYPE_TAG_CFG[type] ?? { label: type.toUpperCase(), bg: '#F0F4F8', color: '#4A5568' }
  return <span style={{ fontSize: 9, fontWeight: 700, background: c.bg, color: c.color, borderRadius: 5, padding: '2px 6px', marginLeft: 6 }}>{c.label}</span>
}

function billedTag() {
  return <span style={{ fontSize: 9, fontWeight: 700, background: '#F0F4F8', color: '#94A3B8', borderRadius: 5, padding: '2px 6px', marginLeft: 6 }}>BILLED</span>
}

function reportBillingStatusBadge(status: 'billed' | 'unbilled') {
  const cfg = status === 'billed'
    ? { bg: 'rgba(46, 158, 109, 0.15)', color: '#2E9E6D', label: 'Billed' }
    : { bg: 'rgba(244, 166, 42, 0.15)', color: '#B67516', label: 'Unbilled' }
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase', borderRadius: 20, padding: '3px 8px', background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function FieldDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 10px' }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#E1E8F0' }} />
    </div>
  )
}

const REPORT_COST_LABELS: Record<'checkin' | 'checkout' | 'one_off', string> = {
  checkin: 'Check-In Report',
  checkout: 'Check-Out Report',
  one_off: 'One-Off Report',
}

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

const EVENT_ICON: Record<VehicleEventType, { icon: typeof Car; color: string }> = {
  intake:                { icon: Car,          color: '#00B4D8' },
  spot_assigned:         { icon: MapPin,       color: '#00B4D8' },
  spot_unassigned:       { icon: MapPin,       color: '#00B4D8' },
  status_changed:        { icon: RefreshCw,    color: '#00B4D8' },
  inspection_completed:  { icon: ClipboardList, color: '#00B4D8' },
  invoice_generated:     { icon: FileText,     color: '#00B4D8' },
  invoice_sent:          { icon: Send,         color: '#00B4D8' },
  invoice_paid:          { icon: DollarSign,   color: '#00B4D8' },
  payment_logged:        { icon: DollarSign,   color: '#00B4D8' },
  note_added:            { icon: Pencil,       color: '#00B4D8' },
  released:              { icon: LogOut,       color: '#00B4D8' },
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

type PhotoSection = 'Exterior' | 'Interior' | 'Engine'

function extractPhotos(insp: any): { url: string; label: string; date: string; section: PhotoSection }[] {
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
  const SOURCES: [any, PhotoSection][] = [
    [insp.exterior_data, 'Exterior'],
    [insp.interior_data, 'Interior'],
    [insp.engine_data, 'Engine'],
  ]
  const out: { url: string; label: string; date: string; section: PhotoSection }[] = []
  for (const [src, section] of SOURCES) {
    if (!src || typeof src !== 'object') continue
    for (const [key, val] of Object.entries(src)) {
      if (typeof val === 'string' && val.startsWith('data:image')) {
        const nice = LABEL[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/Photo$/, '').trim()
        out.push({ url: val, label: `${section} – ${nice}`, date, section })
      }
    }
  }
  return out
}

const RESUME_STEP_ORDER: Array<{ dataKey: string; nextStep: StepId }> = [
  { dataKey: 'engine_data',           nextStep: 'review' },
  { dataKey: 'interior_data',         nextStep: 'engine' },
  { dataKey: 'exterior_data',         nextStep: 'interior' },
  { dataKey: 'documentation_data',    nextStep: 'exterior' },
  { dataKey: 'vehicle_function_data', nextStep: 'documentation' },
  { dataKey: 'keys_data',             nextStep: 'function' },
  { dataKey: 'bol_data',              nextStep: 'keys' },
  { dataKey: 'vehicleInfo',           nextStep: 'bol' },
]
function inferResumeStep(row: Record<string, any>): StepId {
  for (const { dataKey, nextStep } of RESUME_STEP_ORDER) {
    const val = row[dataKey]
    if (val && typeof val === 'object' && Object.keys(val).length > 0) return nextStep
  }
  return 'vehicle-info'
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
  const lotMapEnabled = useFeatureFlag('lot_map')
  const dispatchEnabled = useFeatureFlag('dispatch')
  const companyId = effectiveCompany?.id ?? ''
  const isFMC = effectiveCompany?.account_type === 'fmc'

  // Core data
  const [vehicle, setVehicle] = useState<any>(null)
  const [loadingVehicle, setLoadingVehicle] = useState(true)
  const [inspections, setInspections] = useState<any[]>([])
  const [loadingInspections, setLoadingInspections] = useState(false)

  // Billing (lot_map gated)
  const [companyBillingDefaults, setCompanyBillingDefaults] = useState<any>(null)
  const [billingType, setBillingType] = useState<BillingType>('daily')
  const [rateOverride, setRateOverride] = useState('')
  const [billToName, setBillToName] = useState('')
  const [billToContact, setBillToContact] = useState('')
  const [savingBilling, setSavingBilling] = useState(false)
  const [billingSaved, setBillingSaved] = useState(false)

  // Invoice generation (inline in Charges section, lot_map gated)
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [invoiceDueDate, setInvoiceDueDate] = useState('')
  const [generatingInvoice, setGeneratingInvoice] = useState(false)

  // Photos (lazy)
  const [photos, setPhotos] = useState<{ url: string; label: string; date: string; section: PhotoSection }[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photosLoaded, setPhotosLoaded] = useState(false)
  const [photoFilter, setPhotoFilter] = useState<'All' | PhotoSection>('All')
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)

  // Charges
  const [charges, setCharges] = useState<VehicleCharge[]>([])
  const [loadingCharges, setLoadingCharges] = useState(false)
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([])
  const [showAddCharge, setShowAddCharge] = useState(false)
  const [addChargeTab, setAddChargeTab] = useState<'fee' | 'report'>('fee')
  const [applyFeeTypeId, setApplyFeeTypeId] = useState('')
  const [applyFeeLabel, setApplyFeeLabel] = useState('')
  const [applyFeeAmount, setApplyFeeAmount] = useState('')
  const [applyingFee, setApplyingFee] = useState(false)
  const [editingChargeId, setEditingChargeId] = useState<string | null>(null)
  const [editChargeLabel, setEditChargeLabel] = useState('')
  const [editChargeAmount, setEditChargeAmount] = useState('')
  const [savingCharge, setSavingCharge] = useState(false)
  const [confirmDeleteChargeId, setConfirmDeleteChargeId] = useState<string | null>(null)
  const [billedChargeIds, setBilledChargeIds] = useState<Set<string>>(new Set())
  const [reportCosts, setReportCosts] = useState<ReportCosts | null>(null)
  const [reportCostType, setReportCostType] = useState<'checkin' | 'checkout' | 'one_off'>('checkin')
  const [reportCostLabel, setReportCostLabel] = useState('')
  const [reportCostAmount, setReportCostAmount] = useState('')
  const [applyingReportCost, setApplyingReportCost] = useState(false)
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set())
  const [storageChecked, setStorageChecked] = useState(true)
  const [storageStartDate, setStorageStartDate] = useState('')
  const [storageEndDate, setStorageEndDate] = useState('')

  // Customer
  const [customers, setCustomers] = useState<Customer[]>([])
  const [editingCustomer, setEditingCustomer] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [savingCustomer, setSavingCustomer] = useState(false)

  // Notes
  const [rawNotes, setRawNotes] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const [events, setEvents] = useState<(VehicleEvent & { created_by_name: string | null })[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [newTimelineNote, setNewTimelineNote] = useState('')
  const [savingTimelineNote, setSavingTimelineNote] = useState(false)

  // Status action state
  const [confirmRelease, setConfirmRelease] = useState(false)
  const [actionSaving, setActionSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Wizard
  const [appStep, setAppStep] = useState<AppStep>('view')
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null)
  const [usageState, setUsageState] = useState<UsageState | null>(null)
  const [showUsageModal, setShowUsageModal] = useState(false)
  const [initiatingInspection, setInitiatingInspection] = useState(false)
  const [inProgressInsp, setInProgressInsp] = useState<{ id: string; created_at: string; usage_status: string | null } | null>(null)
  const [showResumeConfirm, setShowResumeConfirm] = useState(false)
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false)
  const [wizardInitialData, setWizardInitialData] = useState<Record<string, any> | undefined>(undefined)
  const [wizardInitialStep, setWizardInitialStep] = useState<StepId | undefined>(undefined)

  // ── Fetch inspections via server action (bypasses RLS, handles company_id mismatches)
  const fetchInspections = useCallback(async (vin: string, knownIds?: string[]) => {
    setLoadingInspections(true)
    try {
      const rows = knownIds?.length
        ? await fetchInspectionsByIds(knownIds)
        : await fetchInspectionsByVin(companyId, vin)
      const inspectorIds = Array.from(new Set(rows.filter(r => r.inspector_id).map(r => r.inspector_id)))
      const nameMap = await fetchInspectorNames(inspectorIds)
      setInspections(rows.map(r => ({ ...r, inspector: { full_name: r.inspector_id ? (nameMap[r.inspector_id] ?? 'Unknown') : null } })))
    } catch (e) {
      console.error('[fetchInspections]', e)
    } finally {
      setLoadingInspections(false)
    }
  }, [companyId])

  // ── Fetch vehicle (then fetch inspections by known IDs or VIN)
  const fetchVehicle = useCallback(async () => {
    if (!companyId || !params.vehicleId) return
    setLoadingVehicle(true)
    const { data } = await createClient()
      .from('storage_vehicles')
      .select('*, location:location_id(id, name, city, state), customer:customer_id(id, name, phone, email)')
      .eq('id', params.vehicleId)
      .eq('company_id', companyId)
      .single()
    setVehicle(data ?? null)
    setRawNotes(data?.notes ?? null)
    setLoadingVehicle(false)
    if (data) {
      const ids = Array.from(new Set([data.checkin_inspection_id, data.checkout_inspection_id, ...(data.inspection_ids ?? [])].filter(Boolean)))
      fetchInspections(data.vin ?? '', ids.length ? ids : undefined)
    }
  }, [companyId, params.vehicleId, fetchInspections])

  useEffect(() => { fetchVehicle() }, [fetchVehicle])

  // ── Load billing defaults once lot_map flag resolves
  useEffect(() => {
    if (!lotMapEnabled || !companyId) return
    createClient()
      .from('companies')
      .select('default_daily_rate, default_monthly_rate, default_billing_type')
      .eq('id', companyId)
      .single()
      .then(({ data }) => setCompanyBillingDefaults(data ?? {}))
  }, [lotMapEnabled, companyId])

  // ── Populate billing state from vehicle once loaded
  useEffect(() => {
    if (!vehicle) return
    setBillingType((vehicle.billing_type as BillingType) ?? 'daily')
    setRateOverride(vehicle.daily_rate != null ? String(vehicle.daily_rate) : vehicle.monthly_rate != null ? String(vehicle.monthly_rate) : '')
    setBillToName(vehicle.bill_to_name ?? '')
    setBillToContact(vehicle.bill_to_contact ?? '')
    setSelectedCustomerId(vehicle.customer_id ?? '')
  }, [vehicle?.id])

  // ── Load company customers for customer selector
  useEffect(() => {
    if (!companyId) return
    getCustomers(companyId).then(setCustomers).catch(() => {})
  }, [companyId])

  // ── Load vehicle charges + available fee types + billed/report state
  useEffect(() => {
    if (!vehicle?.id || !companyId || !lotMapEnabled) return
    setLoadingCharges(true)
    Promise.all([
      getVehicleCharges(vehicle.id),
      getFeeTypes(companyId),
      getBilledChargeIds(vehicle.id),
      getReportCosts(companyId),
    ]).then(([c, f, billed, costs]) => {
      setCharges(c)
      setFeeTypes(f)
      setBilledChargeIds(billed)
      setReportCosts(costs)
      const unbilled = c.filter(x => !billed.has(x.id))
      setSelectedChargeIds(new Set(unbilled.map(x => x.id)))
      const startBase = vehicle.billed_through_date ? parseDateOnly(vehicle.billed_through_date) : new Date(vehicle.arrived_at)
      const endBase = vehicle.released_at ? new Date(vehicle.released_at) : new Date()
      setStorageStartDate(toDateInputValue(startBase))
      setStorageEndDate(toDateInputValue(endBase))
      setStorageChecked(true)
    }).catch(() => {}).finally(() => setLoadingCharges(false))
  }, [vehicle?.id, companyId, lotMapEnabled])

  // ── Load in-progress inspection; mark stale (>48h) ones abandoned on first load
  useEffect(() => {
    if (!companyId || !vehicle?.vin) return
    markStaleInProgressAsAbandoned(companyId).catch(() => {})
    findInProgressInspection(companyId, vehicle.vin).then(setInProgressInsp).catch(() => {})
  }, [companyId, vehicle?.vin])

  // ── Load activity timeline
  const loadEvents = useCallback(() => {
    if (!vehicle?.id) return
    setLoadingEvents(true)
    getVehicleEvents(vehicle.id).then(setEvents).catch(() => {}).finally(() => setLoadingEvents(false))
  }, [vehicle?.id])
  useEffect(() => { loadEvents() }, [loadEvents])

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

  // ── Timeline: manual note
  const saveTimelineNote = async () => {
    if (!newTimelineNote.trim() || !vehicle || !companyId) return
    setSavingTimelineNote(true)
    await logVehicleEvent({
      companyId, vehicleId: vehicle.id, eventType: 'note_added',
      description: newTimelineNote.trim(), createdBy: user?.id ?? null,
    })
    setNewTimelineNote('')
    setSavingTimelineNote(false)
    loadEvents()
  }

  // ── Start / resume inspection
  const handleStart = async () => {
    if (!effectiveCompany || !user || !vehicle) return
    if (inProgressInsp) {
      setShowAbandonConfirm(true)
      return
    }
    try {
      const usage = await checkUsageState(effectiveCompany.id)
      setUsageState(usage)
      setShowUsageModal(true)
    } catch (e: any) {
      setErrorMsg('Failed to check usage: ' + e.message)
    }
  }

  const handleResumeClick = () => setShowResumeConfirm(true)

  const handleConfirmResume = async () => {
    if (!inProgressInsp) return
    setShowResumeConfirm(false)
    try {
      const row = await loadInspectionForResume(inProgressInsp.id)
      if (row) {
        setWizardInitialData({
          vehicleInfo: row.vehicleInfo ?? {},
          bol_data: row.bol_data ?? {},
          keys_data: row.keys_data ?? {},
          vehicle_function_data: row.vehicle_function_data ?? {},
          documentation_data: row.documentation_data ?? {},
          exterior_data: row.exterior_data ?? {},
          interior_data: row.interior_data ?? {},
          engine_data: row.engine_data ?? {},
        })
        setWizardInitialStep(inferResumeStep(row))
      }
      setCurrentInspectionId(inProgressInsp.id)
      setAppStep('inspecting')
    } catch (e: any) {
      setErrorMsg('Failed to resume: ' + e.message)
    }
  }

  const handleConfirmAbandon = async () => {
    if (!inProgressInsp || !effectiveCompany) return
    setShowAbandonConfirm(false)
    try {
      await abandonInspection(inProgressInsp.id)
      setInProgressInsp(null)
      const usage = await checkUsageState(effectiveCompany.id)
      setUsageState(usage)
      setShowUsageModal(true)
    } catch (e: any) {
      setErrorMsg('Failed to abandon inspection: ' + e.message)
    }
  }

  const handleConfirmStart = async () => {
    if (!effectiveCompany || !user || !vehicle) return
    setInitiatingInspection(true)
    try {
      const [{ getDeviceId }, { initiateInspection }] = await Promise.all([
        import('@/lib/device-id'),
        import('@/lib/usage-actions'),
      ])
      const { inspectionId } = await initiateInspection({
        companyId: effectiveCompany.id,
        inspectorId: user.id,
        initialData: { vin: vehicle.vin, year: vehicle.year, make: vehicle.make, model: vehicle.model },
        deviceId: getDeviceId(),
      })
      setShowUsageModal(false)
      setUsageState(null)
      setWizardInitialData(undefined)
      setWizardInitialStep(undefined)
      setCurrentInspectionId(inspectionId)
      setAppStep('inspecting')
    } catch (e: any) {
      setErrorMsg('Failed to start: ' + e.message)
    } finally {
      setInitiatingInspection(false)
    }
  }

  const handleMarkOnLot = async () => {
    if (!vehicle) return
    setActionSaving(true)
    try {
      await markVehicleOnLot(vehicle.id)
      await fetchVehicle()
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Failed to update status')
    } finally {
      setActionSaving(false)
    }
  }

  const handleMarkPendingPickup = async () => {
    if (!vehicle) return
    setActionSaving(true)
    try {
      await markVehiclePendingPickup(vehicle.id)
      await fetchVehicle()
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Failed to update status')
    } finally {
      setActionSaving(false)
    }
  }

  const handleRelease = async () => {
    if (!vehicle) return
    setActionSaving(true)
    try {
      await releaseVehicle(vehicle.id)
      setConfirmRelease(false)
      await fetchVehicle()
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Failed to update status')
    } finally {
      setActionSaving(false)
    }
  }

  const handleWizardComplete = useCallback(async (data: any) => {
    if (effectiveCompany?.id && vehicle?.vin) {
      await updateVehicleLifecycleStatusAction(effectiveCompany.id, vehicle.vin, data.inspectionId, data.vehicleInfo?.inspectionType ?? 'standard', data.scoreResult?.score ?? null, params.vehicleId).catch(console.error)
    }
    setInProgressInsp(null)
    setAppStep('view')
    setCurrentInspectionId(null)
    await fetchVehicle()
  }, [effectiveCompany?.id, vehicle?.vin, fetchVehicle])

  // ── Save vehicle billing overrides
  const saveBilling = async () => {
    if (!vehicle) return
    setSavingBilling(true)
    const rateVal = rateOverride ? parseFloat(rateOverride) : null
    await createClient()
      .from('storage_vehicles')
      .update({
        billing_type: billingType,
        daily_rate: billingType === 'daily' ? rateVal : null,
        monthly_rate: billingType === 'monthly' ? rateVal : null,
        bill_to_name: billToName || null,
        bill_to_contact: billToContact || null,
      })
      .eq('id', vehicle.id)
    setSavingBilling(false)
    setBillingSaved(true)
    setTimeout(() => setBillingSaved(false), 2500)
  }

  // ── Generate lot invoice
  const handleGenerateInvoice = async () => {
    if (!vehicle || !effectiveCompany || !user) return
    const billingResult = calculateVehicleBilling(
      { ...vehicle, billing_type: billingType, daily_rate: billingType === 'daily' && rateOverride ? parseFloat(rateOverride) : null, monthly_rate: billingType === 'monthly' && rateOverride ? parseFloat(rateOverride) : null },
      companyBillingDefaults ?? {},
    )
    const days = daysBetween(storageStartDate, storageEndDate)
    const storageIncluded = storageChecked && billingResult.rate !== null && days > 0
    const storageAmount = storageIncluded
      ? (billingType === 'daily' ? days * (billingResult.rate as number) : (days / 30) * (billingResult.rate as number))
      : 0
    const unbilledCharges = charges.filter(c => !billedChargeIds.has(c.id))
    const selectedCharges = unbilledCharges.filter(c => selectedChargeIds.has(c.id))
    const chargesTotal = selectedCharges.reduce((s, c) => s + Number(c.amount), 0)
    const totalAmount = storageAmount + chargesTotal

    if (!storageIncluded && selectedCharges.length === 0) {
      setErrorMsg('Select at least one item to include on this invoice.')
      return
    }

    setGeneratingInvoice(true)
    try {
      const { getNextInvoiceNumber } = await import('@/lib/invoice-actions')
      const { generateAndSaveInvoice } = await import('@/lib/invoice-generator')
      const invoiceNumber = await getNextInvoiceNumber(effectiveCompany.id)
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      const vehicleTitle = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'
      await generateAndSaveInvoice({
        companyId: effectiveCompany.id,
        vehicleId: vehicle.id,
        invoiceNumber,
        userId: user.id,
        invoiceDate: today,
        dueDate: invoiceDueDate || undefined,
        companyName: effectiveCompany.name ?? 'Company',
        billToName,
        billToContact,
        vehicleYear: vehicle.year,
        vehicleMake: vehicle.make,
        vehicleModel: vehicle.model,
        vehicleVin: vehicle.vin,
        vehicleDescription: vehicleTitle,
        intakeDate: vehicle.arrived_at ? new Date(vehicle.arrived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
        includeStorage: storageIncluded,
        daysOnLot: days,
        storagePeriodStart: storageIncluded ? storageStartDate : null,
        storagePeriodEnd: storageIncluded ? storageEndDate : null,
        billingType,
        rate: billingResult.rate ?? 0,
        storageAmount,
        charges: selectedCharges.map(c => ({ id: c.id, label: c.label, amount: Number(c.amount) })),
        totalAmount,
        notes: invoiceNotes || undefined,
      })
      setBilledChargeIds(prev => {
        const next = new Set(prev)
        selectedCharges.forEach(c => next.add(c.id))
        return next
      })
      if (storageIncluded) {
        const newEndBase = vehicle.released_at ? new Date(vehicle.released_at) : new Date()
        setVehicle((v: any) => v ? { ...v, billed_through_date: storageEndDate } : v)
        setStorageStartDate(storageEndDate)
        setStorageEndDate(toDateInputValue(newEndBase))
      }
      setInvoiceNotes('')
      setInvoiceDueDate('')
    } catch (e: any) {
      setErrorMsg('Failed to generate invoice: ' + e.message)
    } finally {
      setGeneratingInvoice(false)
    }
  }

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
    } catch (e: any) { setErrorMsg('PDF failed: ' + e.message) }
  }

  // ── Wizard mode
  if (appStep === 'inspecting' && currentInspectionId) {
    return (
      <InspectionWizard
        inspectionId={currentInspectionId}
        initialData={wizardInitialData ?? { vehicleInfo: { vin: vehicle?.vin, year: vehicle?.year, make: vehicle?.make, model: vehicle?.model } }}
        initialStep={wizardInitialStep}
        inspectorId={user?.id}
        onComplete={handleWizardComplete}
        onCancel={() => {
          setAppStep('view'); setCurrentInspectionId(null); setWizardInitialData(undefined); setWizardInitialStep(undefined)
          if (companyId && vehicle?.vin) findInProgressInspection(companyId, vehicle.vin).then(setInProgressInsp).catch(() => {})
        }}
      />
    )
  }

  if (loadingVehicle) return <LoadingOverlay show fullScreen />

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

  const canStart = ['pending_arrival', 'on_lot', 'pending_pickup'].includes(status)
  const canDispatch = ['pending_arrival', 'on_lot'].includes(status)

  // Report type availability, scoped to this vehicle's actual inspections
  const reportTypeCounts: Record<'checkin' | 'checkout' | 'one_off', number> = {
    checkin: inspections.filter(i => i.usage_status === 'checkin').length,
    checkout: inspections.filter(i => i.usage_status === 'checkout').length,
    one_off: inspections.filter(i => i.usage_status !== 'checkin' && i.usage_status !== 'checkout').length,
  }
  const availableReportTypes = (['checkin', 'checkout', 'one_off'] as const).filter(t => reportTypeCounts[t] > 0)

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
            <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>Picked Up</p>
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
      {(canStart || canDispatch || status === 'pending_arrival' || status === 'on_lot' || status === 'pending_pickup') && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {canStart && (
            inProgressInsp ? (
              <button onClick={handleResumeClick}
                style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#00B4D8', color: '#FFFFFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Play size={15} />Resume Inspection
              </button>
            ) : (
              <button onClick={handleStart}
                style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Play size={15} />Start Inspection
              </button>
            )
          )}
          {canDispatch && (
            <button onClick={() => router.push(dispatchEnabled ? `/storage/dispatch?vin=${vehicle.vin}` : '/storage/dispatch')}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, opacity: dispatchEnabled === false ? 0.6 : 1 }}>
              {dispatchEnabled === false ? <Lock size={15} /> : <Send size={15} />}Dispatch
            </button>
          )}
          {status === 'pending_arrival' && (
            <button onClick={handleMarkOnLot} disabled={actionSaving}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, opacity: actionSaving ? 0.6 : 1 }}>
              <CheckCircle size={15} />Mark as On Lot
            </button>
          )}
          {status === 'on_lot' && (
            <button onClick={handleMarkPendingPickup} disabled={actionSaving}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#F59E0B', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, opacity: actionSaving ? 0.6 : 1 }}>
              <LogOut size={15} />Mark Pending Pickup
            </button>
          )}
          {status === 'pending_pickup' && (
            <button onClick={() => setConfirmRelease(true)} disabled={actionSaving}
              style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#10B981', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, opacity: actionSaving ? 0.6 : 1 }}>
              <CheckCircle size={15} />Mark Picked Up
            </button>
          )}
        </div>
      )}

      {/* ── Inspection History ──────────────────────────────────────────────── */}
      <SectionCard title="Inspection History" count={inspections.length}>
        {loadingInspections ? (
          <div style={{ position: 'relative', minHeight: 80 }}>
            <LoadingOverlay show />
          </div>
        ) : inspections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', margin: '0 auto 10px' }}><path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="2"/><circle cx="12" cy="16" r="1"/></svg>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>No inspections recorded yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Completed inspections */}
            {inspections.map((insp, idx) => {
              const rawDate = insp.report_generated_at ?? insp.created_at
              const ts = rawDate ? new Date(rawDate) : null
              const dateStr = ts ? ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
              const timeStr = ts ? ts.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''
              const inspector = (insp.inspector as any)?.full_name ?? null
              const usage: string = insp.usage_status ?? ''
              const typeLabel = usage === 'checkin' ? 'Check-In' : usage === 'checkout' ? 'Check-Out' : 'Standard'
              const typeColor = usage === 'checkin' ? '#0369A1' : usage === 'checkout' ? '#065F46' : '#4A5568'
              const typeBg   = usage === 'checkin' ? '#DBEAFE' : usage === 'checkout' ? '#D1FAE5' : '#F0F4F8'
              const reportUrl: string | null = (insp as any).report_url ?? null
              const inspNum = inspections.length - idx

              // Billing status — mirrors the report-cost charges already tracked in the Charges section.
              // vehicle_charges has no per-inspection link, only a report_type, so this reflects the
              // billed/unbilled state of that report type's charge(s) for this vehicle, not this exact inspection.
              const reportTypeForBilling: 'checkin' | 'checkout' | 'one_off' = usage === 'checkin' ? 'checkin' : usage === 'checkout' ? 'checkout' : 'one_off'
              const matchingReportCharges = charges.filter(c => c.charge_type === 'report' && c.report_type === reportTypeForBilling)
              const billingStatus: 'billed' | 'unbilled' | null = matchingReportCharges.length === 0
                ? null
                : matchingReportCharges.every(c => billedChargeIds.has(c.id)) ? 'billed' : 'unbilled'

              return (
                <div key={insp.id}
                  style={{ background: '#F8FAFC', border: '1px solid #E1E8F0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <ClipboardList size={15} color="#0D1B2A" />
                  </div>
                  <span style={{ background: typeBg, color: typeColor, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {typeLabel}
                  </span>
                  {billingStatus && reportBillingStatusBadge(billingStatus)}
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>Report #{inspNum} · {dateStr}{timeStr ? ` at ${timeStr}` : ''}</p>
                    {inspector && <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{inspector}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {reportUrl && (
                      <button
                        onClick={async () => {
                          try {
                            const url = reportUrl.startsWith('http') ? reportUrl : await getReportSignedUrlAction(reportUrl)
                            if (url) window.open(url, '_blank')
                          } catch (e: any) { setErrorMsg('View failed: ' + e.message) }
                        }}
                        style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid #E1E8F0', background: '#FFF', color: '#0D1B2A', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Eye size={12} />View
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        try {
                          if (reportUrl) {
                            const url = reportUrl.startsWith('http') ? reportUrl : await getReportSignedUrlAction(reportUrl)
                            if (url) { window.open(url, '_blank'); return }
                          }
                          const full = await fetchFullInspectionAction(insp.id)
                          if (!full) { setErrorMsg('Inspection data not found'); return }
                          const [{ calculateVehicleScore }, { generateInspectionPDF }] = await Promise.all([
                            import('@/lib/vehicle-score'),
                            import('@/lib/pdf-generator'),
                          ])
                          await generateInspectionPDF(full, calculateVehicleScore(full), full.signature_url ?? '')
                        } catch (e: any) { setErrorMsg('PDF failed: ' + e.message) }
                      }}
                      style={{ height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Download size={12} />Download PDF
                    </button>
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
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F0F4F8', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
              <Camera size={18} color="#94A3B8" />
            </div>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              Click <strong>Load Photos</strong> to display all photos captured during inspections.
            </p>
          </div>
        ) : photos.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, textAlign: 'center', padding: '12px 0', fontStyle: 'italic' }}>
            No photos found in completed inspections.
          </p>
        ) : (
          <>
            {(() => {
              const sections: PhotoSection[] = ['Exterior', 'Interior', 'Engine']
              const counts: Record<string, number> = { All: photos.length }
              for (const s of sections) counts[s] = photos.filter(p => p.section === s).length
              return (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {(['All', ...sections] as const).map(f => (
                    <button key={f} onClick={() => setPhotoFilter(f)}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: photoFilter === f ? 'rgba(0,180,216,0.15)' : '#F0F4F8',
                        color: photoFilter === f ? '#0088A8' : '#4A5568',
                      }}>
                      {f} ({counts[f] ?? 0})
                    </button>
                  ))}
                </div>
              )
            })()}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
              gap: 8,
            }}>
              {photos.filter(p => photoFilter === 'All' || p.section === photoFilter).map((p, i) => (
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
          </>
        )}
      </SectionCard>

      {/* ── Billing (lot_map flag gated) — hero stats, settings, bill to, charges, invoice history ── */}
      {lotMapEnabled && (() => {
        const billingResult = calculateVehicleBilling(
          { ...vehicle, billing_type: billingType, daily_rate: billingType === 'daily' && rateOverride ? parseFloat(rateOverride) : null, monthly_rate: billingType === 'monthly' && rateOverride ? parseFloat(rateOverride) : null },
          companyBillingDefaults ?? {},
        )
        const rateLabel = billingType === 'daily' ? '/day' : '/30 days'
        const defaultRate = billingType === 'daily'
          ? companyBillingDefaults?.default_daily_rate
          : companyBillingDefaults?.default_monthly_rate
        const inputStyle: React.CSSProperties = {
          flex: 1, height: 40, border: '1px solid #E1E8F0', borderRadius: 10,
          padding: '0 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit', background: '#FAFAFA',
        }

        const billingBaseline: string | null = vehicle.billed_through_date ?? (vehicle.arrived_at ? toDateInputValue(new Date(vehicle.arrived_at)) : null)
        const days = storageStartDate && storageEndDate ? daysBetween(storageStartDate, storageEndDate) : 0
        const canEditStorage = billingResult.rate != null
        const storageIncluded = storageChecked && canEditStorage && days > 0
        const storageAmount = storageIncluded
          ? (billingType === 'daily' ? days * (billingResult.rate as number) : (days / 30) * (billingResult.rate as number))
          : 0
        const startBeforeBaseline = !!billingBaseline && !!storageStartDate && parseDateOnly(storageStartDate) < parseDateOnly(billingBaseline)
        const unbilledCharges = charges.filter(c => !billedChargeIds.has(c.id))
        const selectedChargesTotal = unbilledCharges.filter(c => selectedChargeIds.has(c.id)).reduce((s, c) => s + Number(c.amount), 0)
        const invoiceTotal = (storageIncluded ? storageAmount : 0) + selectedChargesTotal
        const hasAnyUnbilled = (canEditStorage && days > 0) || unbilledCharges.length > 0
        const canGenerate = storageIncluded || unbilledCharges.some(c => selectedChargeIds.has(c.id))

        const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #F8FAFC' }
        const labelStyle: React.CSSProperties = { fontSize: 13, color: '#4A5568', margin: 0 }
        const amountStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: 0 }
        const dateInputStyle: React.CSSProperties = { width: '100%', height: 32, border: '1px solid #E1E8F0', borderRadius: 7, padding: '0 8px', fontSize: 12, outline: 'none', background: '#FAFAFA', fontFamily: 'inherit', boxSizing: 'border-box' }
        const chargeCheckboxStyle: React.CSSProperties = { width: 17, height: 17, accentColor: '#00B4D8', cursor: 'pointer', flexShrink: 0 }

        const toggleCharge = (id: string, checked: boolean) => {
          setSelectedChargeIds(prev => {
            const next = new Set(prev)
            if (checked) next.add(id); else next.delete(id)
            return next
          })
        }

        const openAddCharge = () => {
          setAddChargeTab(feeTypes.length > 0 ? 'fee' : 'report')
          setApplyFeeTypeId(''); setApplyFeeLabel(''); setApplyFeeAmount('')
          const firstAvailable = availableReportTypes[0] ?? 'checkin'
          setReportCostType(firstAvailable)
          setReportCostLabel(REPORT_COST_LABELS[firstAvailable])
          const defaultAmt = firstAvailable === 'checkin' ? reportCosts?.report_cost_checkin : firstAvailable === 'checkout' ? reportCosts?.report_cost_checkout : reportCosts?.report_cost_one_off
          setReportCostAmount(defaultAmt != null ? String(defaultAmt) : '')
          setShowAddCharge(true)
        }

        return (
          <SectionCard title="Billing" elevated>
            {/* Days on Lot + Accrued */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E1E8F0', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Days on Lot</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>{billingResult.daysOnLot}<span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500 }}>d</span></p>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #1B2D40, #0D1B2A)', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Accrued</p>
                <p style={{ fontSize: 26, fontWeight: 800, color: billingResult.accruedAmount != null ? '#00B4D8' : 'rgba(255,255,255,0.4)', margin: 0 }}>
                  {billingResult.accruedAmount != null ? `$${billingResult.accruedAmount.toFixed(2)}` : '—'}
                </p>
              </div>
            </div>

            <FieldDivider label="Billing Settings" />

            {/* Billing type toggle */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Billing Type</p>
              <div style={{ display: 'flex', gap: 0, background: '#F0F4F8', borderRadius: 10, padding: 3 }}>
                {(['daily', 'monthly'] as BillingType[]).map(t => (
                  <button key={t} onClick={() => { setBillingType(t); setRateOverride('') }}
                    style={{ flex: 1, height: 34, borderRadius: 8, border: 'none', background: billingType === t ? '#0D1B2A' : 'transparent', color: billingType === t ? '#FFF' : '#4A5568', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize', transition: 'background 150ms ease' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Rate override */}
            <div style={{ marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Rate {rateLabel}</p>
              <div style={{ position: 'relative' }}>
                <DollarSign size={13} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="number" min="0" step="0.01"
                  placeholder={defaultRate != null ? `${defaultRate} (default)` : 'No default set'}
                  value={rateOverride}
                  onChange={e => setRateOverride(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: 28 }}
                />
              </div>
              {!rateOverride && defaultRate != null && (
                <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>Using company default: ${defaultRate}{rateLabel}</p>
              )}
            </div>

            <FieldDivider label="Bill To" />

            {/* Bill To */}
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Name</p>
                <input type="text" placeholder="Customer or company name" value={billToName} onChange={e => setBillToName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Contact</p>
                <input type="text" placeholder="Email or phone" value={billToContact} onChange={e => setBillToContact(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <button onClick={saveBilling} disabled={savingBilling}
              style={{ width: '100%', height: 42, borderRadius: 10, border: 'none', background: billingSaved ? '#10B981' : '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: savingBilling ? 'default' : 'pointer', fontFamily: 'inherit', opacity: savingBilling ? 0.7 : 1, transition: 'background 300ms ease' }}>
              {billingSaved ? 'Saved ✓' : savingBilling ? 'Saving…' : 'Save'}
            </button>

            <FieldDivider label="Charges" />

            {loadingCharges ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <Loader2 size={16} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : (
              <>
                {/* Storage row — checkbox + editable date range */}
                <div style={{ padding: '9px 0', borderBottom: '1px solid #F8FAFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={storageChecked} disabled={!canEditStorage || days <= 0}
                      onChange={e => setStorageChecked(e.target.checked)} style={chargeCheckboxStyle} />
                    <span style={{ flex: 1, fontSize: 13, color: '#4A5568' }}>Storage ({days}d)</span>
                    <span style={amountStyle}>${storageAmount.toFixed(2)}</span>
                  </div>
                  {canEditStorage ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, marginLeft: 24 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: '#94A3B8', display: 'block', marginBottom: 3 }}>From</label>
                        <input type="date" value={storageStartDate} onChange={e => setStorageStartDate(e.target.value)} style={dateInputStyle} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 10, color: '#94A3B8', display: 'block', marginBottom: 3 }}>To</label>
                        <input type="date" value={storageEndDate} onChange={e => setStorageEndDate(e.target.value)} style={dateInputStyle} />
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>Set a rate in Billing to bill storage.</p>
                  )}
                  {startBeforeBaseline && (
                    <p style={{ fontSize: 11, color: '#DC2626', margin: '6px 0 0 24px' }}>
                      Start date is before {billingBaseline} (already billed) — this may double-bill storage.
                    </p>
                  )}
                </div>

                {/* Report charge rows */}
                {charges.filter(c => c.charge_type === 'report').map(c => {
                  const billed = billedChargeIds.has(c.id)
                  const reportCount = c.report_type ? reportTypeCounts[c.report_type] : 0
                  return confirmDeleteChargeId === c.id ? (
                    <div key={c.id} style={{ ...rowStyle, gap: 8 }}>
                      <p style={{ fontSize: 12, color: '#EF4444', margin: 0, flex: 1 }}>Remove "{c.label}"?</p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setConfirmDeleteChargeId(null)}
                          style={{ height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid #E1E8F0', background: '#FFF', fontSize: 11, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        <button onClick={async () => {
                          await deleteCharge(c.id)
                          setCharges(cs => cs.filter(x => x.id !== c.id))
                          setConfirmDeleteChargeId(null)
                        }}
                          style={{ height: 26, padding: '0 10px', borderRadius: 6, border: 'none', background: '#EF4444', fontSize: 11, fontWeight: 700, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                      </div>
                    </div>
                  ) : (
                    <div key={c.id} style={rowStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, gap: 10 }}>
                        {!billed && (
                          <input type="checkbox" checked={selectedChargeIds.has(c.id)} onChange={e => toggleCharge(c.id, e.target.checked)} style={chargeCheckboxStyle} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <p style={labelStyle}>{c.label}</p>
                            {c.report_type && reportTypeTag(c.report_type)}
                            {billed && billedTag()}
                          </div>
                          {reportCount > 0 && <p style={{ fontSize: 10, color: '#94A3B8', margin: 0 }}>{reportCount} report{reportCount !== 1 ? 's' : ''} generated</p>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={amountStyle}>${Number(c.amount).toFixed(2)}</p>
                        {!billed && (
                          <button onClick={() => setConfirmDeleteChargeId(c.id)}
                            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #FEE2E2', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <Trash2 size={11} color="#EF4444" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Custom fee rows */}
                {charges.filter(c => c.charge_type === 'custom_fee').map(c => (
                  editingChargeId === c.id ? (
                    <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #F8FAFC' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginBottom: 8 }}>
                        <input value={editChargeLabel} onChange={e => setEditChargeLabel(e.target.value)}
                          style={{ height: 36, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 10px', fontSize: 13, outline: 'none', background: '#FAFAFA', fontFamily: 'inherit' }} />
                        <div style={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#94A3B8' }}>$</span>
                          <input type="number" min="0" step="0.01" value={editChargeAmount} onChange={e => setEditChargeAmount(e.target.value)}
                            style={{ width: 90, height: 36, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 8px 0 20px', fontSize: 13, outline: 'none', background: '#FAFAFA', fontFamily: 'inherit' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setEditingChargeId(null)}
                          style={{ flex: 1, height: 30, borderRadius: 7, border: '1px solid #E1E8F0', background: '#FFF', fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        <button disabled={savingCharge} onClick={async () => {
                          setSavingCharge(true)
                          try {
                            await updateCharge(c.id, { label: editChargeLabel, amount: parseFloat(editChargeAmount) })
                            setCharges(cs => cs.map(x => x.id === c.id ? { ...x, label: editChargeLabel, amount: parseFloat(editChargeAmount) } : x))
                            setEditingChargeId(null)
                          } finally { setSavingCharge(false) }
                        }}
                          style={{ flex: 2, height: 30, borderRadius: 7, border: 'none', background: '#00B4D8', fontSize: 12, fontWeight: 700, color: '#FFFFFF', cursor: 'pointer', fontFamily: 'inherit' }}>
                          {savingCharge ? '…' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : confirmDeleteChargeId === c.id ? (
                    <div key={c.id} style={{ ...rowStyle, gap: 8 }}>
                      <p style={{ fontSize: 12, color: '#EF4444', margin: 0, flex: 1 }}>Remove "{c.label}"?</p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setConfirmDeleteChargeId(null)}
                          style={{ height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid #E1E8F0', background: '#FFF', fontSize: 11, fontWeight: 600, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        <button onClick={async () => {
                          await deleteCharge(c.id)
                          setCharges(cs => cs.filter(x => x.id !== c.id))
                          setConfirmDeleteChargeId(null)
                        }}
                          style={{ height: 26, padding: '0 10px', borderRadius: 6, border: 'none', background: '#EF4444', fontSize: 11, fontWeight: 700, color: '#FFF', cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                      </div>
                    </div>
                  ) : (
                    <div key={c.id} style={{ ...rowStyle, gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                        {!billedChargeIds.has(c.id) && (
                          <input type="checkbox" checked={selectedChargeIds.has(c.id)} onChange={e => toggleCharge(c.id, e.target.checked)} style={chargeCheckboxStyle} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <p style={labelStyle}>{c.label}</p>
                            {billedChargeIds.has(c.id) && billedTag()}
                          </div>
                          {c.is_recurring && <p style={{ fontSize: 10, color: '#94A3B8', margin: 0 }}>Recurring</p>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={amountStyle}>${Number(c.amount).toFixed(2)}</p>
                        {!billedChargeIds.has(c.id) && (
                          <>
                            <button onClick={() => { setEditingChargeId(c.id); setEditChargeLabel(c.label); setEditChargeAmount(String(c.amount)) }}
                              style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #E1E8F0', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                              <Pencil size={11} color="#4A5568" />
                            </button>
                            <button onClick={() => setConfirmDeleteChargeId(c.id)}
                              style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #FEE2E2', background: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                              <Trash2 size={11} color="#EF4444" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                ))}

                {charges.length === 0 && (
                  <p style={{ fontSize: 12, color: '#CBD5E1', margin: '4px 0 8px' }}>No charges recorded yet</p>
                )}

                {/* Add charge */}
                <button onClick={openAddCharge}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', height: 40, borderRadius: 9, border: '1.5px dashed #00B4D8', background: 'none', color: '#00B4D8', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginTop: 6 }}>
                  <Plus size={13} />Add Custom Fee or Report Cost
                </button>

                {/* Invoice total */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, marginTop: 10, borderTop: '2px solid #E1E8F0' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Invoice Total</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#00B4D8', margin: 0 }}>${invoiceTotal.toFixed(2)}</p>
                </div>

                {/* Inline invoice builder: due date, notes, generate */}
                {hasAnyUnbilled ? (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #E1E8F0' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 12 }}>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                          Due Date <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
                        </p>
                        <input type="date" value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)}
                          style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 9, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#FAFAFA', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>
                          Notes <span style={{ color: '#94A3B8', fontWeight: 400, textTransform: 'none' }}>(optional)</span>
                        </p>
                        <input value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} placeholder="Payment terms, instructions…"
                          style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 9, padding: '0 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none', background: '#FAFAFA', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <button onClick={handleGenerateInvoice} disabled={generatingInvoice || !canGenerate}
                      style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: generatingInvoice || !canGenerate ? '#E1E8F0' : '#0D1B2A', color: generatingInvoice || !canGenerate ? '#94A3B8' : '#FFF', fontSize: 14, fontWeight: 700, cursor: generatingInvoice || !canGenerate ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      {generatingInvoice ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />Generating…</> : 'Generate Invoice'}
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: '#CBD5E1', margin: '12px 0 0', textAlign: 'center' }}>Nothing unbilled for this vehicle.</p>
                )}
              </>
            )}

            <FieldDivider label="Invoice History" />
            {vehicle && (
              <VehicleInvoiceHistory
                vehicleId={params.vehicleId}
                vin={vehicle.vin}
                companyId={companyId}
                billedThroughDate={vehicle.billed_through_date ?? null}
              />
            )}
          </SectionCard>
        )
      })()}

      {/* Add Custom Fee or Report Cost Modal */}
      {showAddCharge && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.5)' }} onClick={() => setShowAddCharge(false)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 24, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 16px' }}>Add Charge</h3>

            <div style={{ display: 'flex', gap: 0, background: '#F0F4F8', borderRadius: 10, padding: 3, marginBottom: 18 }}>
              <button onClick={() => setAddChargeTab('fee')}
                style={{ flex: 1, height: 34, borderRadius: 8, border: 'none', background: addChargeTab === 'fee' ? '#0D1B2A' : 'transparent', color: addChargeTab === 'fee' ? '#FFF' : '#4A5568', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Custom Fee
              </button>
              <button onClick={() => setAddChargeTab('report')}
                style={{ flex: 1, height: 34, borderRadius: 8, border: 'none', background: addChargeTab === 'report' ? '#0D1B2A' : 'transparent', color: addChargeTab === 'report' ? '#FFF' : '#4A5568', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                Report Cost
              </button>
            </div>

            {addChargeTab === 'fee' ? (
              feeTypes.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>No fee types configured in Settings.</p>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Fee Type</label>
                    <select value={applyFeeTypeId} onChange={e => {
                      const ft = feeTypes.find(f => f.id === e.target.value)
                      setApplyFeeTypeId(e.target.value)
                      setApplyFeeLabel(ft?.name ?? '')
                      setApplyFeeAmount(ft ? String(ft.default_amount) : '')
                    }} style={{ width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: '#FAFAFA', fontFamily: 'inherit' }}>
                      <option value="">— Select a fee —</option>
                      {feeTypes.map(f => <option key={f.id} value={f.id}>{f.name} (${Number(f.default_amount).toFixed(2)})</option>)}
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Label</label>
                    <input value={applyFeeLabel} onChange={e => setApplyFeeLabel(e.target.value)}
                      placeholder="Fee label…"
                      style={{ width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Amount</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#94A3B8' }}>$</span>
                      <input type="number" min="0" step="0.01" value={applyFeeAmount} onChange={e => setApplyFeeAmount(e.target.value)}
                        style={{ width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10, paddingLeft: 26, paddingRight: 12, fontSize: 14, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    </div>
                  </div>
                </>
              )
            ) : (
              availableReportTypes.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>No completed reports found for this vehicle yet.</p>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Report Type</label>
                    <select value={reportCostType} onChange={e => {
                      const t = e.target.value as 'checkin' | 'checkout' | 'one_off'
                      setReportCostType(t)
                      setReportCostLabel(REPORT_COST_LABELS[t])
                      const defaultAmt = t === 'checkin' ? reportCosts?.report_cost_checkin : t === 'checkout' ? reportCosts?.report_cost_checkout : reportCosts?.report_cost_one_off
                      setReportCostAmount(defaultAmt != null ? String(defaultAmt) : '')
                    }} style={{ width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: '#FAFAFA', fontFamily: 'inherit' }}>
                      {availableReportTypes.map(t => (
                        <option key={t} value={t}>{REPORT_COST_LABELS[t]} ({reportTypeCounts[t]} report{reportTypeCounts[t] !== 1 ? 's' : ''})</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Label</label>
                    <input value={reportCostLabel} onChange={e => setReportCostLabel(e.target.value)}
                      placeholder="Report cost label…"
                      style={{ width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Amount</label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#94A3B8' }}>$</span>
                      <input type="number" min="0" step="0.01" value={reportCostAmount} onChange={e => setReportCostAmount(e.target.value)}
                        style={{ width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10, paddingLeft: 26, paddingRight: 12, fontSize: 14, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    </div>
                    {!reportCostAmount && (
                      <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 0' }}>No default report cost configured in Settings for this type.</p>
                    )}
                  </div>
                </>
              )
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowAddCharge(false)}
                style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#374151', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button
                disabled={
                  addChargeTab === 'fee'
                    ? (!applyFeeTypeId || !applyFeeLabel.trim() || !applyFeeAmount || applyingFee)
                    : (!reportCostLabel.trim() || !reportCostAmount || applyingReportCost || availableReportTypes.length === 0)
                }
                onClick={async () => {
                  if (!vehicle || !user) return
                  if (addChargeTab === 'fee') {
                    if (!applyFeeTypeId || !applyFeeLabel.trim() || !applyFeeAmount) return
                    const ft = feeTypes.find(f => f.id === applyFeeTypeId)
                    setApplyingFee(true)
                    try {
                      const charge = await applyFeeToVehicle({
                        companyId, vehicleId: vehicle.id, feeTypeId: applyFeeTypeId,
                        label: applyFeeLabel.trim(), amount: parseFloat(applyFeeAmount),
                        isRecurring: ft?.is_recurring ?? false, createdBy: user.id,
                      })
                      setCharges(cs => [...cs, charge])
                      setShowAddCharge(false)
                    } catch (e: any) { alert(e.message) }
                    finally { setApplyingFee(false) }
                  } else {
                    if (!reportCostLabel.trim() || !reportCostAmount) return
                    setApplyingReportCost(true)
                    try {
                      const charge = await applyReportCostToVehicle({
                        companyId, vehicleId: vehicle.id, reportType: reportCostType,
                        label: reportCostLabel.trim(), amount: parseFloat(reportCostAmount),
                        createdBy: user.id,
                      })
                      setCharges(cs => [...cs, charge])
                      setShowAddCharge(false)
                    } catch (e: any) { alert(e.message) }
                    finally { setApplyingReportCost(false) }
                  }
                }}
                style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: '#00B4D8', color: '#FFFFFF', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: applyingFee || applyingReportCost ? 0.7 : 1 }}>
                {addChargeTab === 'fee'
                  ? (applyingFee ? 'Adding…' : 'Add Fee')
                  : (applyingReportCost ? 'Adding…' : 'Add Report Cost')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Customer ─────────────────────────────────────────────────────────── */}
      <SectionCard
        title="Customer"
        action={
          !editingCustomer
            ? <button onClick={() => setEditingCustomer(true)} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: '#00B4D8', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>Change</button>
            : null
        }
      >
        {editingCustomer ? (
          <div>
            <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)}
              style={{ width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: '#FAFAFA', fontFamily: 'inherit', marginBottom: 10 }}>
              <option value="">— No customer —</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setEditingCustomer(false); setSelectedCustomerId(vehicle?.customer_id ?? '') }}
                style={{ flex: 1, height: 38, borderRadius: 9, border: '1px solid #E1E8F0', background: '#FFF', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={async () => {
                if (!vehicle) return
                setSavingCustomer(true)
                try {
                  await linkVehicleToCustomer(vehicle.id, selectedCustomerId || null)
                  setVehicle((v: any) => ({
                    ...v,
                    customer_id: selectedCustomerId || null,
                    customer: customers.find(c => c.id === selectedCustomerId) ?? null,
                  }))
                  setEditingCustomer(false)
                } catch (e: any) { alert(e.message) }
                finally { setSavingCustomer(false) }
              }} disabled={savingCustomer}
                style={{ flex: 2, height: 38, borderRadius: 9, border: 'none', background: '#00B4D8', color: '#FFFFFF', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                {savingCustomer ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : vehicle?.customer ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: '#E0F7FC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0097B2' }}>{vehicle.customer.name.charAt(0).toUpperCase()}</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <button onClick={() => router.push(`/customers/${vehicle.customer.id}`)}
                style={{ background: 'none', border: 'none', padding: 0, fontSize: 14, fontWeight: 700, color: '#0D1B2A', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                {vehicle.customer.name}
              </button>
              {(vehicle.customer.phone || vehicle.customer.email) && (
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
                  {[vehicle.customer.phone, vehicle.customer.email].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <Users size={16} color="#CBD5E1" />
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#CBD5E1', margin: 0 }}>No customer linked</p>
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

      {/* ── Activity Timeline ───────────────────────────────────────────────── */}
      <SectionCard title="Activity Timeline" count={events.length || undefined}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            value={newTimelineNote}
            onChange={e => setNewTimelineNote(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveTimelineNote()}
            placeholder="Add a note to the timeline…"
            style={{ flex: 1, height: 40, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit', background: '#FAFAFA' }}
          />
          <button
            onClick={saveTimelineNote}
            disabled={!newTimelineNote.trim() || savingTimelineNote}
            style={{ height: 40, padding: '0 16px', borderRadius: 10, border: 'none', background: newTimelineNote.trim() ? '#0D1B2A' : '#E1E8F0', color: newTimelineNote.trim() ? '#FFF' : '#94A3B8', fontSize: 13, fontWeight: 600, cursor: newTimelineNote.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {savingTimelineNote ? '…' : 'Add Note'}
          </button>
        </div>

        {loadingEvents ? (
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, textAlign: 'center', padding: '8px 0' }}>Loading…</p>
        ) : events.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94A3B8', margin: 0, fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
            No activity yet.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {events.map((ev, idx) => {
              const cfg = EVENT_ICON[ev.event_type as VehicleEventType] ?? { icon: ClipboardList, color: '#00B4D8' }
              const Icon = cfg.icon
              return (
                <div key={ev.id} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 13, background: '#0D1B2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={13} color={cfg.color} />
                    </div>
                    {idx < events.length - 1 && <div style={{ flex: 1, width: 1, background: '#E1E8F0', margin: '4px 0' }} />}
                  </div>
                  <div style={{ paddingBottom: idx < events.length - 1 ? 16 : 0, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#0D1B2A', margin: 0 }}>{ev.description}</p>
                    <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0' }} title={new Date(ev.created_at).toLocaleString()}>
                      {ev.created_by_name ?? 'System'} · {relativeTime(ev.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* Lightbox */}
      {lightbox && <Lightbox url={lightbox.url} label={lightbox.label} onClose={() => setLightbox(null)} />}

      {/* Mark Picked Up confirmation modal */}
      {confirmRelease && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.5)' }} onClick={() => setConfirmRelease(false)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <div style={{ width: 52, height: 52, borderRadius: 26, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckCircle size={24} color="#10B981" />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0D1B2A', textAlign: 'center', margin: '0 0 8px' }}>Mark as Picked Up?</h2>
            <p style={{ fontSize: 14, color: '#4A5568', textAlign: 'center', lineHeight: 1.6, margin: '0 0 24px' }}>
              This records the pickup date and marks the vehicle as picked up. This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmRelease(false)}
                style={{ flex: 1, height: 46, borderRadius: 12, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={handleRelease} disabled={actionSaving}
                style={{ flex: 1, height: 46, borderRadius: 12, border: 'none', background: '#10B981', color: '#FFF', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: actionSaving ? 0.7 : 1 }}>
                {actionSaving ? 'Marking…' : 'Mark Picked Up'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>

    {/* Resume confirmation modal (Rule 3) */}
    {showResumeConfirm && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setShowResumeConfirm(false)} />
        <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0D1B2A', margin: '0 0 8px' }}>Resume Inspection?</h2>
          <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>
            You'll continue from where you left off.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowResumeConfirm(false)}
              style={{ flex: 1, height: 48, borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button onClick={handleConfirmResume}
              style={{ flex: 1, height: 48, borderRadius: 12, border: 'none', background: '#00B4D8', color: '#FFFFFF', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Resume
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Abandon + start new confirmation modal (Rule 1) */}
    {showAbandonConfirm && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setShowAbandonConfirm(false)} />
        <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0D1B2A', margin: '0 0 8px' }}>Inspection Already In Progress</h2>
          <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>
            Starting a new inspection will abandon your current one. Any progress will be lost.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowAbandonConfirm(false)}
              style={{ flex: 1, height: 48, borderRadius: 12, border: '1.5px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button onClick={handleConfirmAbandon}
              style={{ flex: 1, height: 48, borderRadius: 12, border: 'none', background: '#EF4444', color: '#FFF', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Start New
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Usage confirmation */}
    {showUsageModal && usageState && (
      <UsageConfirmationModal
        usageState={usageState}
        onConfirm={handleConfirmStart}
        onCancel={() => { setShowUsageModal(false); setUsageState(null) }}
        loading={initiatingInspection}
      />
    )}

    {errorMsg && (
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setErrorMsg(null)} />
        <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 12px' }}>Something went wrong</h3>
          <p style={{ fontSize: 14, color: '#4A5568', lineHeight: 1.6, margin: '0 0 24px' }}>{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)} style={{ width: '100%', height: 44, borderRadius: 10, border: 'none', background: '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>OK</button>
        </div>
      </div>
    )}

    {/* Billing saved toast */}
    {billingSaved && (
      <div style={{
        position: 'fixed', top: 24, right: 24, zIndex: 200,
        background: '#10B981', color: '#FFF',
        padding: '12px 20px', borderRadius: 10,
        fontWeight: 700, fontSize: 14,
        boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
        pointerEvents: 'none',
      }}>
        Saved ✓
      </div>
    )}
    </>
  )
}

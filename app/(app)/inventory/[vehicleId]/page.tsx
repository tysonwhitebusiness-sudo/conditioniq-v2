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
  ArrowLeft, Play, Send, ExternalLink, Download,
  Camera, Loader2, X, CheckCircle, LogOut, DollarSign, Lock, Users, Pencil, Trash2,
} from 'lucide-react'
import { linkVehicleToCustomer, getCustomers, type Customer } from '@/lib/customer-actions'
import {
  getVehicleCharges, applyFeeToVehicle, applyReportCostToVehicle, updateCharge, deleteCharge,
  getFeeTypes, getReportCosts, type VehicleCharge, type FeeType, type ReportCosts,
} from '@/lib/lot-fee-actions'
import { getBilledChargeIds, getAlreadyBilledStorageDays } from '@/lib/invoice-charge-actions'
import LoadingOverlay from '@/components/ui/loading-overlay'
import VehicleInvoiceHistory from '@/components/billing/vehicle-invoice-history'

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

  // Invoice modal (lot_map gated)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [invoiceDueDate, setInvoiceDueDate] = useState('')
  const [generatingInvoice, setGeneratingInvoice] = useState(false)

  // Photos (lazy)
  const [photos, setPhotos] = useState<{ url: string; label: string; date: string }[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [photosLoaded, setPhotosLoaded] = useState(false)
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)

  // Charges
  const [charges, setCharges] = useState<VehicleCharge[]>([])
  const [loadingCharges, setLoadingCharges] = useState(false)
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([])
  const [showApplyFee, setShowApplyFee] = useState(false)
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
  const [alreadyBilledDays, setAlreadyBilledDays] = useState(0)
  const [reportCosts, setReportCosts] = useState<ReportCosts | null>(null)
  const [showApplyReportCost, setShowApplyReportCost] = useState(false)
  const [reportCostType, setReportCostType] = useState<'checkin' | 'checkout' | 'one_off'>('checkin')
  const [reportCostLabel, setReportCostLabel] = useState('')
  const [reportCostAmount, setReportCostAmount] = useState('')
  const [applyingReportCost, setApplyingReportCost] = useState(false)
  const [selectedChargeIds, setSelectedChargeIds] = useState<Set<string>>(new Set())
  const [includeStorageSelected, setIncludeStorageSelected] = useState(true)

  // Customer
  const [customers, setCustomers] = useState<Customer[]>([])
  const [editingCustomer, setEditingCustomer] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [savingCustomer, setSavingCustomer] = useState(false)

  // Notes
  const [rawNotes, setRawNotes] = useState<string | null>(null)
  const [newNote, setNewNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)

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
      getAlreadyBilledStorageDays(vehicle.id, companyId),
      getReportCosts(companyId),
    ]).then(([c, f, billed, days, costs]) => {
      setCharges(c)
      setFeeTypes(f)
      setBilledChargeIds(billed)
      setAlreadyBilledDays(days)
      setReportCosts(costs)
    }).catch(() => {}).finally(() => setLoadingCharges(false))
  }, [vehicle?.id, companyId, lotMapEnabled])

  // ── Load in-progress inspection; mark stale (>48h) ones abandoned on first load
  useEffect(() => {
    if (!companyId || !vehicle?.vin) return
    markStaleInProgressAsAbandoned(companyId).catch(() => {})
    findInProgressInspection(companyId, vehicle.vin).then(setInProgressInsp).catch(() => {})
  }, [companyId, vehicle?.vin])

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
    const unbilledDays = Math.max(0, billingResult.daysOnLot - alreadyBilledDays)
    const canIncludeStorage = unbilledDays > 0 && billingResult.rate !== null
    const storageIncluded = includeStorageSelected && canIncludeStorage
    const storageAmount = storageIncluded
      ? (billingType === 'daily' ? unbilledDays * (billingResult.rate as number) : (unbilledDays / 30) * (billingResult.rate as number))
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
        daysOnLot: unbilledDays,
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
      setAlreadyBilledDays(prev => prev + (storageIncluded ? unbilledDays : 0))
      setShowInvoiceModal(false)
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
                style={{ height: 44, padding: '0 20px', borderRadius: 12, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
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

              return (
                <div key={insp.id}
                  style={{ background: '#F8FAFC', border: '1px solid #E1E8F0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ background: typeBg, color: typeColor, borderRadius: 6, padding: '3px 9px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {typeLabel}
                  </span>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>Report #{inspNum} · {dateStr}{timeStr ? ` at ${timeStr}` : ''}</p>
                    {inspector && <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{inspector}</p>}
                  </div>
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
                    style={{ height: 32, padding: '0 14px', borderRadius: 8, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <Download size={12} />Download PDF
                  </button>
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

      {/* ── Billing (lot_map flag gated) ────────────────────────────────────── */}
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
        return (
          <SectionCard title="Billing">
            {/* Days on Lot + Accrued */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E1E8F0', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Days on Lot</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: '#0D1B2A', margin: 0 }}>{billingResult.daysOnLot}<span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500 }}>d</span></p>
              </div>
              <div style={{ background: billingResult.accruedAmount != null ? '#E0F7FC' : '#F8FAFC', border: '1px solid #E1E8F0', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Accrued</p>
                <p style={{ fontSize: 24, fontWeight: 800, color: billingResult.accruedAmount != null ? '#00B4D8' : '#CBD5E1', margin: 0 }}>
                  {billingResult.accruedAmount != null ? `$${billingResult.accruedAmount.toFixed(2)}` : '—'}
                </p>
              </div>
            </div>

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

            {/* Bill To */}
            <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Bill To Name</p>
                <input type="text" placeholder="Customer or company name" value={billToName} onChange={e => setBillToName(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Bill To Contact</p>
                <input type="text" placeholder="Email or phone" value={billToContact} onChange={e => setBillToContact(e.target.value)} style={inputStyle} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveBilling} disabled={savingBilling}
                style={{ flex: 1, height: 42, borderRadius: 10, border: 'none', background: billingSaved ? '#10B981' : '#0D1B2A', color: '#FFF', fontSize: 14, fontWeight: 700, cursor: savingBilling ? 'default' : 'pointer', fontFamily: 'inherit', opacity: savingBilling ? 0.7 : 1, transition: 'background 300ms ease' }}>
                {billingSaved ? 'Saved ✓' : savingBilling ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => {
                const unbilled = charges.filter(c => !billedChargeIds.has(c.id))
                setSelectedChargeIds(new Set(unbilled.map(c => c.id)))
                setIncludeStorageSelected(true)
                setShowInvoiceModal(true)
              }}
                style={{ height: 42, padding: '0 16px', borderRadius: 10, border: '1.5px solid #00B4D8', background: '#FFF', color: '#00B4D8', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                Generate Invoice
              </button>
            </div>
          </SectionCard>
        )
      })()}

      {/* ── Charges Breakdown (lot_map gated) ───────────────────────────────── */}
      {lotMapEnabled && (() => {
        const reportTotal = charges.filter(c => c.charge_type === 'report').reduce((s, c) => s + Number(c.amount), 0)
        const feeTotal = charges.filter(c => c.charge_type === 'custom_fee').reduce((s, c) => s + Number(c.amount), 0)
        const billingResult = calculateVehicleBilling(
          { ...vehicle, billing_type: billingType, daily_rate: billingType === 'daily' && rateOverride ? parseFloat(rateOverride) : null, monthly_rate: billingType === 'monthly' && rateOverride ? parseFloat(rateOverride) : null },
          companyBillingDefaults ?? {},
        )
        const storageTotal = billingResult.accruedAmount ?? 0
        const grandTotal = storageTotal + reportTotal + feeTotal

        const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #F8FAFC' }
        const labelStyle: React.CSSProperties = { fontSize: 13, color: '#4A5568', margin: 0 }
        const amountStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: 0 }

        return (
          <SectionCard
            title="Charges"
            action={
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => {
                  setReportCostType('checkin')
                  setReportCostLabel(REPORT_COST_LABELS.checkin)
                  setReportCostAmount(reportCosts?.report_cost_checkin != null ? String(reportCosts.report_cost_checkin) : '')
                  setShowApplyReportCost(true)
                }}
                  style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: '#00B4D8', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                  + Bill Report Cost
                </button>
                {feeTypes.length > 0 && (
                  <button onClick={() => { setShowApplyFee(true); setApplyFeeTypeId(''); setApplyFeeLabel(''); setApplyFeeAmount('') }}
                    style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 600, color: '#00B4D8', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                    + Apply Fee
                  </button>
                )}
              </div>
            }
          >
            {loadingCharges ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <Loader2 size={16} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : (
              <>
                {/* Storage row */}
                <div style={rowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <p style={labelStyle}>Storage ({billingResult.daysOnLot}d)</p>
                  </div>
                  <p style={amountStyle}>{billingResult.accruedAmount != null ? `$${storageTotal.toFixed(2)}` : '—'}</p>
                </div>

                {/* Report charge rows */}
                {charges.filter(c => c.charge_type === 'report').map(c => (
                  <div key={c.id} style={rowStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <p style={labelStyle}>{c.label}</p>
                      {c.report_type && reportTypeTag(c.report_type)}
                      {billedChargeIds.has(c.id) && billedTag()}
                    </div>
                    <p style={amountStyle}>${Number(c.amount).toFixed(2)}</p>
                  </div>
                ))}

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
                          style={{ flex: 2, height: 30, borderRadius: 7, border: 'none', background: '#F4A62A', fontSize: 12, fontWeight: 700, color: '#0D1B2A', cursor: 'pointer', fontFamily: 'inherit' }}>
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
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <p style={labelStyle}>{c.label}</p>
                          {billedChargeIds.has(c.id) && billedTag()}
                        </div>
                        {c.is_recurring && <p style={{ fontSize: 10, color: '#94A3B8', margin: 0 }}>Recurring</p>}
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

                {/* Total */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, marginTop: 2, borderTop: '2px solid #E1E8F0' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Total</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#00B4D8', margin: 0 }}>${grandTotal.toFixed(2)}</p>
                </div>
              </>
            )}
          </SectionCard>
        )
      })()}

      {/* Bill Report Cost Modal */}
      {showApplyReportCost && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.5)' }} onClick={() => setShowApplyReportCost(false)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 16px' }}>Bill Condition Report Cost</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>Report Type</label>
              <select value={reportCostType} onChange={e => {
                const t = e.target.value as 'checkin' | 'checkout' | 'one_off'
                setReportCostType(t)
                setReportCostLabel(REPORT_COST_LABELS[t])
                const defaultAmt = t === 'checkin' ? reportCosts?.report_cost_checkin : t === 'checkout' ? reportCosts?.report_cost_checkout : reportCosts?.report_cost_one_off
                setReportCostAmount(defaultAmt != null ? String(defaultAmt) : '')
              }} style={{ width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: '#FAFAFA', fontFamily: 'inherit' }}>
                <option value="checkin">Check-In Report</option>
                <option value="checkout">Check-Out Report</option>
                <option value="one_off">One-Off Report</option>
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowApplyReportCost(false)}
                style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#374151', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button
                disabled={!reportCostLabel.trim() || !reportCostAmount || applyingReportCost}
                onClick={async () => {
                  if (!vehicle || !user || !reportCostLabel.trim() || !reportCostAmount) return
                  setApplyingReportCost(true)
                  try {
                    const charge = await applyReportCostToVehicle({
                      companyId, vehicleId: vehicle.id, reportType: reportCostType,
                      label: reportCostLabel.trim(), amount: parseFloat(reportCostAmount),
                      createdBy: user.id,
                    })
                    setCharges(cs => [...cs, charge])
                    setShowApplyReportCost(false)
                  } catch (e: any) { alert(e.message) }
                  finally { setApplyingReportCost(false) }
                }}
                style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: reportCostLabel.trim() && reportCostAmount ? '#F4A62A' : '#E1E8F0', color: reportCostLabel.trim() && reportCostAmount ? '#0D1B2A' : '#94A3B8', fontWeight: 700, cursor: reportCostLabel.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {applyingReportCost ? 'Applying…' : 'Bill Report Cost'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Fee Modal */}
      {showApplyFee && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.5)' }} onClick={() => setShowApplyFee(false)} />
          <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0D1B2A', margin: '0 0 16px' }}>Apply Fee to Vehicle</h3>
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowApplyFee(false)}
                style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#374151', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button
                disabled={!applyFeeTypeId || !applyFeeLabel.trim() || !applyFeeAmount || applyingFee}
                onClick={async () => {
                  if (!vehicle || !user || !applyFeeTypeId || !applyFeeLabel.trim() || !applyFeeAmount) return
                  const ft = feeTypes.find(f => f.id === applyFeeTypeId)
                  setApplyingFee(true)
                  try {
                    const charge = await applyFeeToVehicle({
                      companyId, vehicleId: vehicle.id, feeTypeId: applyFeeTypeId,
                      label: applyFeeLabel.trim(), amount: parseFloat(applyFeeAmount),
                      isRecurring: ft?.is_recurring ?? false, createdBy: user.id,
                    })
                    setCharges(cs => [...cs, charge])
                    setShowApplyFee(false)
                  } catch (e: any) { alert(e.message) }
                  finally { setApplyingFee(false) }
                }}
                style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: applyFeeTypeId && applyFeeLabel && applyFeeAmount ? '#F4A62A' : '#E1E8F0', color: applyFeeTypeId && applyFeeLabel && applyFeeAmount ? '#0D1B2A' : '#94A3B8', fontWeight: 700, cursor: applyFeeTypeId ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {applyingFee ? 'Applying…' : 'Apply Fee'}
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
                style={{ flex: 2, height: 38, borderRadius: 9, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
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

      {/* ── Invoice History ──────────────────────────────────────────────── */}
      {vehicle && (
        <SectionCard title="Invoice History">
          <VehicleInvoiceHistory
            vehicleId={params.vehicleId}
            vin={vehicle.vin}
            companyId={companyId}
          />
        </SectionCard>
      )}

      {/* Lightbox */}
      {lightbox && <Lightbox url={lightbox.url} label={lightbox.label} onClose={() => setLightbox(null)} />}

      {/* Invoice generation modal */}
      {showInvoiceModal && (() => {
        const billingResult = calculateVehicleBilling(
          { ...vehicle, billing_type: billingType, daily_rate: billingType === 'daily' && rateOverride ? parseFloat(rateOverride) : null, monthly_rate: billingType === 'monthly' && rateOverride ? parseFloat(rateOverride) : null },
          companyBillingDefaults ?? {},
        )
        const unbilledDays = Math.max(0, billingResult.daysOnLot - alreadyBilledDays)
        const canIncludeStorage = unbilledDays > 0 && billingResult.rate !== null
        const storageAmount = canIncludeStorage
          ? (billingType === 'daily' ? unbilledDays * (billingResult.rate as number) : (unbilledDays / 30) * (billingResult.rate as number))
          : 0
        const storageIncluded = includeStorageSelected && canIncludeStorage
        const unbilledCharges = charges.filter(c => !billedChargeIds.has(c.id))
        const chargesTotal = unbilledCharges
          .filter(c => selectedChargeIds.has(c.id))
          .reduce((s, c) => s + Number(c.amount), 0)
        const grandTotal = (storageIncluded ? storageAmount : 0) + chargesTotal
        const nothingAvailable = !canIncludeStorage && unbilledCharges.length === 0
        const canGenerate = storageIncluded || unbilledCharges.some(c => selectedChargeIds.has(c.id))

        const checklistRowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #F0F4F8', cursor: 'pointer' }

        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }} onClick={() => setShowInvoiceModal(false)} />
            <div style={{ position: 'relative', background: '#FFF', borderRadius: 20, padding: 24, width: '100%', maxWidth: 440, maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 48px rgba(13,27,42,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Generate Invoice</h3>
                <button onClick={() => setShowInvoiceModal(false)} style={{ width: 30, height: 30, borderRadius: 15, background: '#F0F4F8', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={14} color="#4A5568" />
                </button>
              </div>

              <p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: '0 0 12px' }}>
                {[vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(' ') || 'Vehicle'}
              </p>

              {/* Selectable charges */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5568', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>Include on this invoice</p>

                {nothingAvailable && (
                  <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0' }}>Nothing unbilled for this vehicle.</p>
                )}

                {canIncludeStorage && (
                  <label style={checklistRowStyle}>
                    <input type="checkbox" checked={includeStorageSelected} onChange={e => setIncludeStorageSelected(e.target.checked)} />
                    <span style={{ flex: 1, fontSize: 13, color: '#0D1B2A' }}>Storage ({unbilledDays}d unbilled)</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A' }}>${storageAmount.toFixed(2)}</span>
                  </label>
                )}
                {!canIncludeStorage && unbilledDays > 0 && (
                  <p style={{ fontSize: 11, color: '#94A3B8', margin: '4px 0 8px' }}>Set a rate in Billing to include {unbilledDays}d of unbilled storage.</p>
                )}

                {unbilledCharges.map(c => (
                  <label key={c.id} style={checklistRowStyle}>
                    <input type="checkbox" checked={selectedChargeIds.has(c.id)} onChange={e => {
                      setSelectedChargeIds(prev => {
                        const next = new Set(prev)
                        if (e.target.checked) next.add(c.id); else next.delete(c.id)
                        return next
                      })
                    }} />
                    <span style={{ flex: 1, fontSize: 13, color: '#0D1B2A', display: 'flex', alignItems: 'center', minWidth: 0 }}>
                      {c.label}
                      {c.report_type && reportTypeTag(c.report_type)}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A' }}>${Number(c.amount).toFixed(2)}</span>
                  </label>
                ))}

                {!nothingAvailable && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '2px solid #E1E8F0' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Total</p>
                    <p style={{ fontSize: 16, fontWeight: 800, color: '#00B4D8', margin: 0 }}>${grandTotal.toFixed(2)}</p>
                  </div>
                )}
              </div>

              {/* Due Date */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Due Date <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
                <input type="date" value={invoiceDueDate} onChange={e => setInvoiceDueDate(e.target.value)}
                  style={{ width: '100%', height: 40, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#FAFAFA', boxSizing: 'border-box' }} />
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Notes <span style={{ color: '#94A3B8', fontWeight: 400 }}>(optional)</span></label>
                <textarea value={invoiceNotes} onChange={e => setInvoiceNotes(e.target.value)} rows={2} placeholder="Payment terms, instructions…"
                  style={{ width: '100%', border: '1px solid #E1E8F0', borderRadius: 10, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowInvoiceModal(false)}
                  style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={handleGenerateInvoice} disabled={generatingInvoice || !canGenerate}
                  style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: generatingInvoice || !canGenerate ? '#E1E8F0' : '#0D1B2A', color: generatingInvoice || !canGenerate ? '#94A3B8' : '#FFF', fontSize: 14, fontWeight: 700, cursor: generatingInvoice || !canGenerate ? 'default' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  {generatingInvoice ? <><Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />Generating…</> : 'Generate & Download'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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
              style={{ flex: 1, height: 48, borderRadius: 12, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
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

'use client'

import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/auth-context'
import { useMediaQuery } from '@/hooks/use-media-query'
import { Search, Plus, Upload, Download, MoreVertical, X, Loader2, ExternalLink, CheckCircle, Car, Receipt } from 'lucide-react'
import BottomNav from '@/components/ui/bottom-nav'
import { createClient } from '@/lib/supabase/client'
import {
  addVehicleToSystem, getVehicleInspectionHistory,
  getStorageLocations, bulkInsertVehicles, deleteStorageVehicle,
} from '@/lib/storage-actions'
import { updateVehicleLifecycleStatusAction, getReportSignedUrlAction } from '@/lib/inspection-server-actions'
import InspectionWizard from '@/components/inspection-wizard/inspection-wizard'
import SendLinkSheet from '@/components/dispatch/send-link-sheet'
import MobilePageHeader from '@/components/layout/mobile-page-header'
import { fetchInspectionsByIds } from '@/lib/inspection-server-actions'
import { useFeatureFlag } from '@/hooks/use-feature-flag'
import BulkBillingModal, { type BulkVehicle } from '@/components/billing/bulk-billing-modal'

// ── Types ─────────────────────────────────────────────────────────────────────

type LifecycleStatus = 'pending_arrival' | 'in_progress' | 'on_lot' | 'releasing' | 'released' | 'one_off'
type AppStep = 'browse' | 'inspecting'

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

const STATUS_BORDER: Record<LifecycleStatus, string> = {
  pending_arrival: '#94A3B8', in_progress: '#F59E0B', on_lot: '#00B4D8',
  releasing: '#F59E0B', released: '#10B981', one_off: '#94A3B8',
}

const STATUS_SORT: Record<string, number> = {
  pending_arrival: 0, on_lot: 1, in_progress: 1, one_off: 2, released: 3, releasing: 4,
}

const INSP_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  check_in:  { label: 'CHECK-IN',    bg: '#D1FAE5', color: '#065F46' },
  check_out: { label: 'CHECK-OUT',   bg: '#FEF3C7', color: '#92400E' },
  standard:  { label: 'MID-STORAGE', bg: '#DBEAFE', color: '#1E40AF' },
}

function daysOnLot(arrivedAt: string, releasedAt: string | null, status: LifecycleStatus): number | null {
  if (status === 'one_off') return null
  const end = releasedAt ? new Date(releasedAt) : new Date()
  return Math.max(0, Math.floor((end.getTime() - new Date(arrivedAt).getTime()) / 86400000))
}

function daysColor(d: number) { return d < 30 ? '#059669' : d < 60 ? '#D97706' : '#DC2626' }

function scoreInfo(score: number | null) {
  if (score === null) return null
  if (score >= 90) return { color: '#065F46', bg: '#D1FAE5', grade: 'A' }
  if (score >= 80) return { color: '#0369A1', bg: '#DBEAFE', grade: 'B' }
  if (score >= 70) return { color: '#92400E', bg: '#FEF3C7', grade: 'C' }
  if (score >= 60) return { color: '#9A3412', bg: '#FED7AA', grade: 'D' }
  return { color: '#991B1B', bg: '#FEE2E2', grade: 'F' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBadge({ score, inspectionId }: { score: number | null; inspectionId?: string }) {
  const si = scoreInfo(score)
  if (!si) return <span style={{ color: '#CBD5E1', fontSize: 13 }}>—</span>
  return (
    <span
      onClick={inspectionId ? (e) => { e.stopPropagation(); window.open(`/reports/${inspectionId}`, '_blank') } : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: si.bg, color: si.color, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, cursor: inspectionId ? 'pointer' : 'default' }}
    >
      {score}/{si.grade}
    </span>
  )
}

// ── Expanded Row ──────────────────────────────────────────────────────────────

function ExpandedRow({ vehicle, companyId }: { vehicle: any; companyId: string }) {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [localNotes, setLocalNotes] = useState(vehicle.notes ?? '')

  useEffect(() => {
    setLoading(true)
    const ids = [...new Set([vehicle.checkin_inspection_id, vehicle.checkout_inspection_id, ...(vehicle.inspection_ids ?? [])].filter(Boolean))]
    if (!ids.length) { setHistory([]); setLoading(false); return }
    fetchInspectionsByIds(ids).then(data => { setHistory(data); setLoading(false) })
  }, [vehicle.id])

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

  return (
    <div style={{ background: '#F8FAFC', borderTop: '1px solid #E1E8F0', padding: '20px 24px' }}>

      {/* Timeline */}
      <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Inspection Timeline</p>
      {loading
        ? <div style={{ padding: '12px 0' }}><Loader2 size={18} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} /></div>
        : history.length === 0
          ? <p style={{ fontSize: 13, color: '#94A3B8', fontStyle: 'italic', margin: '0 0 20px' }}>No inspections recorded.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              {history.map(h => {
                return (
                  <div key={h.id} style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ background: '#EFF6FF', color: '#1D4ED8', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Inspection</span>
                    <span style={{ fontSize: 12, color: '#4A5568' }}>{new Date(h.created_at).toLocaleDateString()}</span>
                    {h.status === 'in_progress' && <span style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>IN PROGRESS</span>}
                    {h.report_url && (
                      <button onClick={async () => {
                        const url = h.report_url.startsWith('http') ? h.report_url : await getReportSignedUrlAction(h.report_url)
                        if (url) window.open(url, '_blank')
                      }}
                        style={{ marginLeft: 'auto', fontSize: 12, color: '#00B4D8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
                        View <ExternalLink size={11} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )
      }

      {/* Notes */}
      <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>Notes</p>
      {localNotes && (
        <pre style={{ fontSize: 12, color: '#4A5568', background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 8, padding: '10px 12px', marginBottom: 8, whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '0 0 8px' }}>
          {localNotes}
        </pre>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note…"
          onKeyDown={e => e.key === 'Enter' && saveNote()}
          style={{ flex: 1, height: 38, border: '1px solid #E1E8F0', borderRadius: 8, padding: '0 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={saveNote} disabled={!note.trim() || savingNote}
          style={{ height: 38, padding: '0 14px', borderRadius: 8, border: 'none', background: '#0D1B2A', color: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          {savingNote ? '…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Add Vehicle Slide-Over ────────────────────────────────────────────────────

function AddVehicleSlideOver({ companyId, isFMC, locations, onClose, onAdded, onAddAndDispatch }: {
  companyId: string; isFMC: boolean; locations: any[]; onClose: () => void; onAdded: () => void; onAddAndDispatch: (vin: string) => void
}) {
  const [vin, setVin] = useState('')
  const [year, setYear] = useState(''); const [make, setMake] = useState(''); const [model, setModel] = useState('')
  const [locationId, setLocationId] = useState('')
  const [arrivedAt, setArrivedAt] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [decoding, setDecoding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dupeWarn, setDupeWarn] = useState(false)

  const cleanVin = vin.trim().toUpperCase()

  const decode = async () => {
    if (cleanVin.length !== 17) return
    setDecoding(true)
    try {
      const { decodeVIN } = await import('@/lib/vin-decode')
      const r = await decodeVIN(cleanVin)
      if (r) { setYear(r.year ?? ''); setMake(r.make ?? ''); setModel(r.model ?? '') }
    } finally { setDecoding(false) }
  }

  const checkDupe = async () => {
    if (cleanVin.length < 3) return
    const { data } = await createClient().from('storage_vehicles').select('id').eq('company_id', companyId).eq('vin', cleanVin).maybeSingle()
    setDupeWarn(!!data)
  }

  const save = async (andDispatch = false) => {
    if (!cleanVin) return
    setSaving(true)
    try {
      await addVehicleToSystem(companyId, {
        vin: cleanVin, year, make, model,
        locationId: locationId || undefined,
        arrivedAt: arrivedAt ? new Date(arrivedAt).toISOString() : undefined,
        notes,
        lifecycleStatus: 'pending_arrival',
      })
      if (andDispatch) onAddAndDispatch(cleanVin)
      else onAdded()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ width: 'min(480px,100vw)', background: '#FFFFFF', display: 'flex', flexDirection: 'column', height: '100%', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E1E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Add Vehicle</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={20} color="#94A3B8" /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {/* VIN */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>VIN *</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={vin} onChange={e => setVin(e.target.value.replace(/[^A-HJ-NPR-Z0-9]/gi, '').toUpperCase().slice(0, 17))}
                onBlur={() => { checkDupe(); if (cleanVin.length === 17) decode() }}
                placeholder="17-character VIN" maxLength={17}
                style={{ flex: 1, height: 44, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, fontFamily: 'monospace', outline: 'none', background: '#FAFAFA' }} />
              <button onClick={decode} disabled={cleanVin.length !== 17 || decoding}
                style={{ height: 44, padding: '0 14px', borderRadius: 10, background: '#00B4D8', color: '#FFF', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: cleanVin.length !== 17 ? 0.5 : 1, fontFamily: 'inherit' }}>
                {decoding ? '…' : 'Decode'}
              </button>
            </div>
            {dupeWarn && <p style={{ fontSize: 12, color: '#EF4444', margin: '4px 0 0' }}>This VIN already exists in your system</p>}
          </div>
          {/* Year / Make / Model */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
            {([['Year', year, setYear], ['Make', make, setMake], ['Model', model, setModel]] as const).map(([lbl, val, setter]) => (
              <div key={lbl as string}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>{lbl as string}</label>
                <input value={val as string} onChange={e => (setter as any)(e.target.value)}
                  style={{ width: '100%', height: 42, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 10px', fontSize: 14, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
            ))}
          </div>
          {/* Location */}
          {isFMC && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Location</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)}
                style={{ width: '100%', height: 44, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: '#FAFAFA', fontFamily: 'inherit' }}>
                <option value="">No location</option>
                {locations.filter(l => l.active !== false).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          )}
          {/* Arrival Date */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Arrival Date</label>
            <input type="date" value={arrivedAt} onChange={e => setArrivedAt(e.target.value)}
              style={{ width: '100%', height: 44, border: '1px solid #E1E8F0', borderRadius: 10, padding: '0 12px', fontSize: 14, outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          {/* Notes */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Optional…"
              style={{ width: '100%', border: '1px solid #E1E8F0', borderRadius: 10, padding: '10px 12px', fontSize: 14, resize: 'vertical', outline: 'none', background: '#FAFAFA', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #E1E8F0', display: 'flex', gap: 10 }}>
          <button onClick={() => save(false)} disabled={!cleanVin || saving}
            style={{ flex: 1, height: 48, borderRadius: 12, border: 'none', background: cleanVin ? '#F4A62A' : '#E1E8F0', color: cleanVin ? '#0D1B2A' : '#94A3B8', fontWeight: 700, fontSize: 15, cursor: cleanVin ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {saving ? 'Adding…' : 'Add Vehicle'}
          </button>
          <button onClick={() => save(true)} disabled={!cleanVin || saving}
            style={{ flex: 1, height: 48, borderRadius: 12, border: 'none', background: cleanVin ? '#00B4D8' : '#E1E8F0', color: '#FFFFFF', fontWeight: 700, fontSize: 15, cursor: cleanVin ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            Add & Dispatch
          </button>
        </div>
      </div>
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
      <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 540, maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E1E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Import CSV</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#94A3B8" /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {step === 'upload' && (
            <>
              <div onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                style={{ border: '2px dashed #E1E8F0', borderRadius: 12, padding: 40, textAlign: 'center', cursor: 'pointer', background: '#FAFAFA' }}>
                <Upload size={28} color="#94A3B8" style={{ margin: '0 auto 10px', display: 'block' }} />
                <p style={{ fontSize: 14, color: '#4A5568', margin: '0 0 4px', fontWeight: 600 }}>Drop CSV or click to browse</p>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>Required: VIN — Optional: Make, Model, Year, Notes, Arrived At</p>
              </div>
              <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              <div style={{ marginTop: 14, background: '#F8FAFC', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', margin: '0 0 4px' }}>Expected format</p>
                <code style={{ fontSize: 11, color: '#4A5568' }}>VIN,Make,Model,Year,Notes,Arrived At</code>
              </div>
            </>
          )}
          {step === 'preview' && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <div style={{ flex: 1, background: '#D1FAE5', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#065F46', margin: 0 }}>{newRows.length}</p>
                  <p style={{ fontSize: 11, color: '#065F46', margin: 0 }}>New</p>
                </div>
                <div style={{ flex: 1, background: '#FEF3C7', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: '#92400E', margin: 0 }}>{dupeRows.length}</p>
                  <p style={{ fontSize: 11, color: '#92400E', margin: 0 }}>Duplicates</p>
                </div>
              </div>
              {dupeRows.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', fontSize: 13, color: '#374151' }}>
                  <input type="checkbox" checked={skipDupes} onChange={e => setSkipDupes(e.target.checked)} />
                  Skip duplicate VINs
                </label>
              )}
              <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #E1E8F0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['VIN', 'Make', 'Model', 'Year', ''].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#94A3B8', borderBottom: '1px solid #E1E8F0', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const isDupe = existingVins.has(r.vin.toUpperCase())
                      return (
                        <tr key={i} style={{ background: isDupe ? '#FFFBEB' : '#FFFFFF' }}>
                          <td style={{ padding: '7px 12px', fontFamily: 'monospace', borderBottom: '1px solid #F0F4F8' }}>{r.vin}</td>
                          <td style={{ padding: '7px 12px', color: '#4A5568', borderBottom: '1px solid #F0F4F8' }}>{r.make}</td>
                          <td style={{ padding: '7px 12px', color: '#4A5568', borderBottom: '1px solid #F0F4F8' }}>{r.model}</td>
                          <td style={{ padding: '7px 12px', color: '#4A5568', borderBottom: '1px solid #F0F4F8' }}>{r.year}</td>
                          <td style={{ padding: '7px 12px', borderBottom: '1px solid #F0F4F8' }}>
                            <span style={{ background: isDupe ? '#FEF3C7' : '#D1FAE5', color: isDupe ? '#92400E' : '#065F46', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
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
              <div style={{ width: 60, height: 60, borderRadius: 30, background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <CheckCircle size={28} color="#10B981" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0D1B2A', margin: '0 0 6px' }}>{result.inserted} vehicles imported</h3>
              {result.skipped.length > 0 && <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>{result.skipped.length} duplicates skipped</p>}
            </div>
          )}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #E1E8F0', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {step !== 'done' && <button onClick={onClose} style={{ height: 42, padding: '0 18px', borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#374151', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>}
          {step === 'preview' && (
            <button onClick={doImport} disabled={importing || toImport.length === 0}
              style={{ height: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {importing ? 'Importing…' : `Import ${toImport.length} Vehicle${toImport.length !== 1 ? 's' : ''}`}
            </button>
          )}
          {step === 'done' && <button onClick={onClose} style={{ height: 42, padding: '0 18px', borderRadius: 10, border: 'none', background: '#0D1B2A', color: '#FFF', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'all',         label: 'All' },
  { id: 'on_lot',      label: 'On Lot' },
  { id: 'pending_arrival', label: 'Pending Arrival' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'released',    label: 'Released' },
  { id: 'one_off',     label: 'One-Off' },
]

export default function VehiclesPage() {
  const router = useRouter()
  const { effectiveCompany, user } = useAuth()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isFMC = effectiveCompany?.account_type === 'fmc'
  const companyId = effectiveCompany?.id ?? ''

  // Wizard state
  const [appStep, setAppStep] = useState<AppStep>('browse')
  const [currentInspectionId, setCurrentInspectionId] = useState<string | null>(null)
  const [currentInspectionData, setCurrentInspectionData] = useState<Record<string, any>>({})

  // Table state
  const [vehicles, setVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [openKebab, setOpenKebab] = useState<string | null>(null)
  const [locations, setLocations] = useState<any[]>([])

  // Modals
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [showCSV, setShowCSV] = useState(false)
  const [dispatchSheet, setDispatchSheet] = useState<{ open: boolean; vin?: string; year?: string; make?: string; model?: string }>({ open: false })

  // Reports popover
  const [reportsVehicle, setReportsVehicle] = useState<any | null>(null)
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportsList, setReportsList] = useState<any[]>([])

  // Bulk billing
  const lotMapEnabled = useFeatureFlag('lot_map')
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<Set<string>>(new Set())
  const [showBulkBilling, setShowBulkBilling] = useState(false)

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
  }, [companyId])

  useEffect(() => { loadVehicles() }, [loadVehicles])
  useEffect(() => { if (isFMC && companyId) getStorageLocations(companyId).then(setLocations) }, [isFMC, companyId])

  // Auto-start inspection when coming from Start Inspection sheet
  useEffect(() => {
    if (!user || !companyId) return
    try {
      const pendingId = sessionStorage.getItem('pending_inspection_id')
      if (pendingId) {
        sessionStorage.removeItem('pending_inspection_id')
        setCurrentInspectionId(pendingId)
        setCurrentInspectionData({})
        setAppStep('inspecting')
      }
    } catch {}
  }, [user, companyId])

  // Derived
  const allTagged = vehicles.map(v => ({ ...v, _status: effectiveStatus(v) }))
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

  const filtered = allTagged.filter(v => {
    const s = search.toLowerCase()
    if (s && !v.vin?.toLowerCase().includes(s) && !v.make?.toLowerCase().includes(s) && !v.model?.toLowerCase().includes(s)) return false
    if (locationFilter && v.location_id !== locationFilter) return false
    if (activeTab !== 'all' && v._status !== activeTab) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const pa = STATUS_SORT[a._status] ?? 5
    const pb = STATUS_SORT[b._status] ?? 5
    return pa - pb
  })

  const counts: Record<string, number> = {
    all: allTagged.length,
    on_lot: allTagged.filter(v => v._status === 'on_lot').length,
    pending_arrival: allTagged.filter(v => v._status === 'pending_arrival').length,
    in_progress: allTagged.filter(v => v._status === 'in_progress').length,
    released: allTagged.filter(v => v._status === 'released').length,
    one_off: allTagged.filter(v => v._status === 'one_off').length,
  }

  const statsOnLot = allTagged.filter(v => ['pending_arrival', 'in_progress', 'on_lot', 'releasing'].includes(v._status)).length
  const statsUninspected = allTagged.filter(v => ['pending_arrival', 'in_progress', 'on_lot', 'releasing'].includes(v._status) && !v.latest_inspection_id).length
  const statsReleasedMonth = allTagged.filter(v => v._status === 'released' && v.released_at >= monthStart).length
  const existingVins = new Set(vehicles.map(v => v.vin?.toUpperCase() ?? ''))

  // Start inspection
  const handleStart = async (vehicle: any) => {
    if (!effectiveCompany || !user) return
    try {
      const { getDeviceId } = await import('@/lib/device-id')
      const { initiateInspection } = await import('@/lib/usage-actions')
      const { inspectionId } = await initiateInspection({
        companyId: effectiveCompany.id, inspectorId: user.id,
        initialData: { vin: vehicle.vin, year: vehicle.year, make: vehicle.make, model: vehicle.model },
        deviceId: getDeviceId(),
      })
      setCurrentInspectionId(inspectionId)
      setCurrentInspectionData({ vehicleInfo: { vin: vehicle.vin, year: vehicle.year, make: vehicle.make, model: vehicle.model } })
      setAppStep('inspecting')
    } catch (e: any) { alert('Failed to start inspection: ' + e.message) }
  }

  const handleWizardComplete = useCallback(async (data: any) => {
    if (effectiveCompany?.id && data.vehicleInfo?.vin) {
      await updateVehicleLifecycleStatusAction(effectiveCompany.id, data.vehicleInfo.vin, data.inspectionId, data.vehicleInfo.inspectionType ?? 'standard', data.scoreResult?.score ?? null).catch(console.error)
    }
    setAppStep('browse')
    loadVehicles()
  }, [effectiveCompany?.id, loadVehicles])

  const handleOpenReports = async (v: any) => {
    setReportsVehicle(v)
    setReportsLoading(true)
    setReportsList([])
    const ids = [...new Set([v.checkin_inspection_id, v.checkout_inspection_id, ...(v.inspection_ids ?? [])].filter(Boolean))]
    if (!ids.length) { setReportsList([]); setReportsLoading(false); return }
    const data = await fetchInspectionsByIds(ids)
    setReportsList(data)
    setReportsLoading(false)
  }

  const exportCSV = () => {
    const hdrs = ['VIN', 'Year', 'Make', 'Model', 'Status', 'Days on Lot', 'Location', 'Check-In Score', 'Check-Out Score']
    const rows = filtered.map(v => {
      const days = daysOnLot(v.arrived_at, v.released_at, v._status)
      return [v.vin, v.year ?? '', v.make ?? '', v.model ?? '', v._status, days ?? '', v.location?.name ?? '', '', '']
    })
    const csv = [hdrs, ...rows].map(r => r.join(',')).join('\n')
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: `vehicles-${new Date().toISOString().slice(0, 10)}.csv` })
    a.click()
  }

  // ── Wizard mode ────────────────────────────────────────────────────────────
  if (appStep === 'inspecting' && currentInspectionId) {
    return (
      <InspectionWizard
        inspectionId={currentInspectionId}
        initialData={currentInspectionData}
        inspectorId={user?.id}
        onComplete={handleWizardComplete}
        onCancel={() => setAppStep('browse')}
      />
    )
  }

  // ── Browse mode ────────────────────────────────────────────────────────────
  return (
    <>
    {!isDesktop && <MobilePageHeader />}
    <div style={{ padding: isDesktop ? '24px 28px' : '16px', paddingTop: isDesktop ? '24px' : '16px', paddingBottom: isDesktop ? undefined : 'calc(80px + env(safe-area-inset-bottom))', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}.veh-row:hover{background:#F8FAFC!important}`}</style>

      {/* Stats — desktop only */}
      {isDesktop && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total on System', value: allTagged.length,    color: '#0D1B2A' },
          { label: 'On Lot',          value: statsOnLot,           color: '#0097B2' },
          { label: 'Uninspected',     value: statsUninspected,     color: '#D97706' },
          { label: 'Released / Mo.',  value: statsReleasedMonth,   color: '#059669' },
        ].map(s => (
          <div key={s.label} style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 14, padding: '14px 18px' }}>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 4px', fontWeight: 500 }}>{s.label}</p>
            <p style={{ fontSize: 26, fontWeight: 800, color: s.color, margin: 0, lineHeight: 1 }}>{s.value}</p>
          </div>
        ))}
      </div>}

      {/* FMC location pills */}
      {isFMC && locations.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {[{ id: null, name: 'All Locations' }, ...locations.filter(l => l.active !== false)].map(l => (
            <button key={l.id ?? 'all'} onClick={() => setLocationFilter(l.id)}
              style={{ height: 30, padding: '0 14px', borderRadius: 20, border: `1px solid ${locationFilter === l.id ? '#00B4D8' : '#E1E8F0'}`, background: locationFilter === l.id ? '#E0F7FC' : '#FFFFFF', color: locationFilter === l.id ? '#0097B2' : '#4A5568', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                style={{ height: 30, padding: '0 14px', borderRadius: 20, border: 'none', flexShrink: 0, background: active ? '#0D1B2A' : '#F0F4F8', color: active ? '#FFF' : '#4A5568', fontSize: 12, fontWeight: active ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                {tab.label}
                {c > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'rgba(255,255,255,0.2)' : '#E1E8F0', color: active ? '#FFF' : '#4A5568', borderRadius: 8, padding: '1px 5px' }}>{c}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Controls */}
      {isDesktop ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 140 }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search VIN, make, model…"
              style={{ width: '100%', height: 38, border: '1px solid #E1E8F0', borderRadius: 10, paddingLeft: 32, paddingRight: 10, fontSize: 13, outline: 'none', background: '#FFF', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 3, background: '#F0F4F8', borderRadius: 10, padding: 3 }}>
            {TABS.map(tab => {
              const active = activeTab === tab.id
              const c = counts[tab.id] ?? 0
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  style={{ height: 32, padding: '0 10px', borderRadius: 7, border: 'none', background: active ? '#0D1B2A' : 'transparent', color: active ? '#FFF' : '#4A5568', fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                  {tab.label}
                  {c > 0 && <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'rgba(255,255,255,0.2)' : '#E1E8F0', color: active ? '#FFF' : '#4A5568', borderRadius: 8, padding: '1px 5px' }}>{c}</span>}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            <button onClick={exportCSV} style={{ height: 38, padding: '0 12px', borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><Download size={14} />Export</button>
            <button onClick={() => setShowCSV(true)} style={{ height: 38, padding: '0 12px', borderRadius: 10, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><Upload size={14} />Import CSV</button>
            <button onClick={() => setShowAddVehicle(true)} style={{ height: 38, padding: '0 14px', borderRadius: 10, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><Plus size={14} />Add Vehicle</button>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {/* Mobile search */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search VIN, make, model…"
              style={{ width: '100%', height: 44, border: '1px solid #E1E8F0', borderRadius: 12, paddingLeft: 34, paddingRight: 10, fontSize: 14, outline: 'none', background: '#FFF', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>
          {/* Mobile action row */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setShowCSV(true)} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid #E1E8F0', background: '#FFF', color: '#4A5568', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: 'inherit' }}><Upload size={14} />Import CSV</button>
            <button onClick={() => setShowAddVehicle(true)} style={{ flex: 1, height: 44, borderRadius: 12, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: 'inherit' }}><Plus size={14} />Add Vehicle</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E1E8F0', borderRadius: 14, overflow: 'hidden' }}>
        {isDesktop ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E1E8F0' }}>
                {lotMapEnabled && (
                  <th style={{ padding: '11px 10px 11px 14px', width: 36 }}>
                    <input type="checkbox" checked={sorted.length > 0 && sorted.every(v => selectedVehicleIds.has(v.id))}
                      onChange={e => setSelectedVehicleIds(e.target.checked ? new Set(sorted.map(v => v.id)) : new Set())}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#F4A62A' }} />
                  </th>
                )}
                {['Vehicle', 'Status', 'Days', 'Released', 'Check-In', 'Check-Out', 'Reports', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={lotMapEnabled ? 9 : 8} style={{ padding: '40px 0', textAlign: 'center' }}><Loader2 size={20} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} /></td></tr>}
              {!loading && sorted.length === 0 && <tr><td colSpan={lotMapEnabled ? 9 : 8} style={{ padding: '40px 0', textAlign: 'center', fontSize: 14, color: '#94A3B8' }}>No vehicles found</td></tr>}
              {!loading && sorted.map(v => {
                const sc = STATUS_CFG[v._status]
                const days = daysOnLot(v.arrived_at, v.released_at, v._status)
                const isExp = expandedId === v.id
                const reportCount = v.inspection_ids?.length ?? ([v.checkin_inspection_id, v.checkout_inspection_id].filter(Boolean).length)
                return (
                  <Fragment key={v.id}>
                    <tr className="veh-row" onClick={() => { setExpandedId(isExp ? null : v.id); setOpenKebab(null) }}
                      style={{ borderBottom: isExp ? 'none' : '1px solid #F0F4F8', cursor: 'pointer', background: selectedVehicleIds.has(v.id) ? '#FFFBEB' : isExp ? '#F8FAFC' : undefined }}>
                      {/* Checkbox */}
                      {lotMapEnabled && (
                        <td style={{ padding: '13px 10px 13px 14px', width: 36 }} onClick={e => { e.stopPropagation(); toggleVehicleSelect(v.id) }}>
                          <input type="checkbox" checked={selectedVehicleIds.has(v.id)} onChange={() => toggleVehicleSelect(v.id)}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#F4A62A' }} />
                        </td>
                      )}
                      {/* Vehicle */}
                      <td style={{ padding: '13px 14px' }}>
                        {(v.make || v.model)
                          ? <><p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: 0 }}>{[v.year, v.make, v.model].filter(Boolean).join(' ')}</p><p style={{ fontSize: 11, color: '#94A3B8', margin: 0, fontFamily: 'monospace' }}>{v.vin}</p></>
                          : <p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: 0, fontFamily: 'monospace' }}>{v.vin}</p>}
                        {v.location?.name && <p style={{ fontSize: 10, color: '#CBD5E1', margin: 0 }}>{v.location.name}</p>}
                      </td>
                      {/* Status */}
                      <td style={{ padding: '13px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: sc.bg, color: sc.color, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700 }}>
                          {sc.pulse && <span style={{ width: 6, height: 6, borderRadius: 3, background: '#F59E0B', animation: 'pulse 1.5s ease-in-out infinite', display: 'inline-block' }} />}
                          {sc.label}
                        </span>
                      </td>
                      {/* Days */}
                      <td style={{ padding: '13px 14px', fontSize: 13 }}>
                        {days !== null ? <span style={{ color: daysColor(days), fontWeight: 600 }}>{days}d</span> : <span style={{ color: '#CBD5E1' }}>—</span>}
                      </td>
                      {/* Released Date */}
                      <td style={{ padding: '13px 14px', fontSize: 13 }}>
                        {(v.released_date || v.released_at) ? (
                          <span style={{ color: '#10B981', fontWeight: 600 }}>
                            {new Date(v.released_date ?? v.released_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                        ) : <span style={{ color: '#CBD5E1' }}>—</span>}
                      </td>
                      {/* Check-In */}
                      <td style={{ padding: '13px 14px' }}>
                        <ScoreBadge score={null} inspectionId={v.checkin_inspection_id ?? undefined} />
                      </td>
                      {/* Check-Out */}
                      <td style={{ padding: '13px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <ScoreBadge score={null} inspectionId={v.checkout_inspection_id ?? undefined} />
                          {v.condition_delta != null && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: v.condition_delta > 0 ? '#059669' : v.condition_delta < 0 ? '#DC2626' : '#94A3B8' }}>
                              {v.condition_delta > 0 ? '+' : ''}{v.condition_delta}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Reports */}
                      <td style={{ padding: '13px 14px' }}>
                        <span style={{ background: '#F0F4F8', color: '#4A5568', borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 500 }}>{reportCount} report{reportCount !== 1 ? 's' : ''}</span>
                      </td>
                      {/* Actions */}
                      <td style={{ padding: '13px 14px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                          {v._status === 'pending_arrival' && <>
                            <button onClick={() => handleStart(v)} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Start</button>
                            <button onClick={() => setDispatchSheet({ open: true, vin: v.vin, year: v.year, make: v.make, model: v.model })} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Dispatch</button>
                          </>}
                          {v._status === 'in_progress' && <button onClick={() => handleStart(v)} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Resume</button>}
                          {v._status === 'on_lot' && <button onClick={() => setDispatchSheet({ open: true, vin: v.vin, year: v.year, make: v.make, model: v.model })} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Dispatch</button>}
                          {v._status === 'releasing' && <button onClick={() => handleStart(v)} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Resume</button>}
                          {(v._status === 'released' || v._status === 'one_off') && <button onClick={e => { e.stopPropagation(); handleOpenReports(v) }} style={{ height: 28, padding: '0 12px', borderRadius: 14, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Reports</button>}
                          <button onClick={() => router.push(`/inventory/${v.id}`)} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid #00B4D8', background: '#FFF', color: '#00B4D8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>View</button>
                          {/* Kebab */}
                          <div style={{ position: 'relative' }}>
                            <button onClick={e => { e.stopPropagation(); setOpenKebab(openKebab === v.id ? null : v.id) }}
                              style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #E1E8F0', background: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <MoreVertical size={13} color="#4A5568" />
                            </button>
                            {openKebab === v.id && (
                              <div style={{ position: 'absolute', right: 0, top: 32, background: '#FFF', border: '1px solid #E1E8F0', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 50, minWidth: 150, padding: '4px 0' }}>
                                {v._status !== 'released' && (
                                  <button onClick={() => { handleStart(v); setOpenKebab(null) }} style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#0D1B2A', cursor: 'pointer', fontFamily: 'inherit' }}>Start Inspection</button>
                                )}
                                <button onClick={() => { if (confirm('Delete this vehicle?')) deleteStorageVehicle(v.id).then(loadVehicles); setOpenKebab(null) }}
                                  style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#EF4444', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                    {isExp && (
                      <tr>
                        <td colSpan={lotMapEnabled ? 9 : 8} style={{ padding: 0, borderBottom: '1px solid #E1E8F0' }}>
                          <ExpandedRow vehicle={v} companyId={companyId} />
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
            {loading && <div style={{ padding: '40px 0', textAlign: 'center' }}><Loader2 size={20} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} /></div>}
            {!loading && sorted.length === 0 && <p style={{ padding: '40px 20px', textAlign: 'center', fontSize: 14, color: '#94A3B8', margin: 0 }}>No vehicles found</p>}
            {!loading && sorted.map(v => {
              const sc = STATUS_CFG[v._status]
              const days = daysOnLot(v.arrived_at, v.released_at, v._status)
              const isExp = expandedId === v.id
              return (
                <div key={v.id} style={{ borderBottom: '1px solid #F0F4F8' }}>
                  <div onClick={() => setExpandedId(isExp ? null : v.id)}
                    style={{ padding: '13px 14px', borderLeft: `4px solid ${STATUS_BORDER[v._status]}`, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        {(v.make || v.model)
                          ? <><p style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>{[v.year, v.make, v.model].filter(Boolean).join(' ')}</p><p style={{ fontSize: 11, color: '#94A3B8', margin: 0, fontFamily: 'monospace' }}>{v.vin}</p></>
                          : <p style={{ fontSize: 13, fontWeight: 700, color: '#0D1B2A', margin: 0, fontFamily: 'monospace' }}>{v.vin}</p>}
                      </div>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: 20, padding: '2px 10px', fontSize: 10, fontWeight: 700 }}>{sc.label}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                      {days !== null && <span style={{ fontSize: 12, color: daysColor(days), fontWeight: 600 }}>{days}d on lot</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                      {v._status === 'pending_arrival' && <button onClick={() => handleStart(v)} style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Start</button>}
                      {(v._status === 'pending_arrival' || v._status === 'on_lot') && <button onClick={() => setDispatchSheet({ open: true, vin: v.vin, year: v.year, make: v.make, model: v.model })} style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Dispatch</button>}
                      {(v._status === 'in_progress' || v._status === 'releasing') && <button onClick={() => handleStart(v)} style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Resume</button>}
                      {(v._status === 'released' || v._status === 'one_off') && <button onClick={e => { e.stopPropagation(); handleOpenReports(v) }} style={{ height: 30, padding: '0 12px', borderRadius: 15, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Reports</button>}
                      <button onClick={() => router.push(`/inventory/${v.id}`)} style={{ height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid #00B4D8', background: '#FFF', color: '#00B4D8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>View</button>
                    </div>
                  </div>
                  {isExp && <ExpandedRow vehicle={v} companyId={companyId} />}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddVehicle && (
        <AddVehicleSlideOver companyId={companyId} isFMC={isFMC} locations={locations} onClose={() => setShowAddVehicle(false)}
          onAdded={() => { setShowAddVehicle(false); loadVehicles() }}
          onAddAndDispatch={vin => { setShowAddVehicle(false); setDispatchSheet({ open: true, vin }) }} />
      )}
      {showCSV && <CSVImportModal companyId={companyId} existingVins={existingVins} onClose={() => setShowCSV(false)} onImported={loadVehicles} />}
      {openKebab && <div onClick={() => setOpenKebab(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />}

      {/* Reports Modal */}
      {reportsVehicle && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', padding: 16 }}>
          <div style={{ background: '#FFFFFF', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 16px 48px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #E1E8F0' }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>Reports</h3>
                <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0', fontFamily: 'monospace' }}>
                  {[reportsVehicle.year, reportsVehicle.make, reportsVehicle.model].filter(Boolean).join(' ') || reportsVehicle.vin}
                </p>
              </div>
              <button onClick={() => setReportsVehicle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
                <X size={18} color="#94A3B8" />
              </button>
            </div>
            <div style={{ padding: 20 }}>
              {reportsLoading ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <Loader2 size={20} color="#94A3B8" style={{ animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : reportsList.length === 0 ? (
                <p style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: '16px 0', margin: 0 }}>No completed reports found.</p>
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
                      <div key={r.id} style={{ background: '#F8FAFC', border: '1px solid #E1E8F0', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: '#0D1B2A', margin: '0 0 2px' }}>{label}</p>
                          <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{dateStr}</p>
                          {r.status === 'in_progress' && <p style={{ fontSize: 11, color: '#F97316', margin: '2px 0 0', fontWeight: 600 }}>In Progress</p>}
                        </div>
                        {pdfUrl ? (
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={async () => {
                                const url = pdfUrl.startsWith('http') ? pdfUrl : await getReportSignedUrlAction(pdfUrl)
                                if (url) window.open(url, '_blank')
                              }}
                              style={{ height: 28, padding: '0 10px', borderRadius: 7, border: 'none', background: '#00B4D8', color: '#FFF', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                            >View PDF</button>
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: '#CBD5E1' }}>No report yet</span>
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
        <div style={{ position: 'fixed', bottom: isDesktop ? 24 : 'calc(72px + env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: '#0D1B2A', borderRadius: 16, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.35)', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>
            {selectedVehicleIds.size} vehicle{selectedVehicleIds.size !== 1 ? 's' : ''} selected
          </span>
          <button onClick={() => setShowBulkBilling(true)}
            style={{ height: 36, padding: '0 16px', borderRadius: 10, border: 'none', background: '#F4A62A', color: '#0D1B2A', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            <Receipt size={14} /> Bulk Bill
          </button>
          <button onClick={clearSelection}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} color="#94A3B8" />
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

      <BottomNav />
    </div>
    </>
  )
}

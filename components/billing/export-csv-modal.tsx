'use client'

import { useState, useCallback } from 'react'
import { X, Download, Loader2, Check, FileText } from 'lucide-react'
import { exportQuickBooksCSV } from '@/lib/quickbooks-export-actions'

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  midnight: '#0D1B2A',
  navy: '#1B2D40',
  cyan: '#00B4D8',
  amber: '#F4A62A',
  bg: '#F0F4F8',
  border: '#E1E8F0',
  muted: '#94A3B8',
  green: '#10B981',
  red: '#EF4444',
}

// ── Date preset helpers ───────────────────────────────────────────────────────

type Preset = 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year' | 'custom'

function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function getPresetRange(preset: Preset): { start: string; end: string } {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()

  const firstOf = (yr: number, mo: number) => new Date(yr, mo, 1)
  const lastOf  = (yr: number, mo: number) => new Date(yr, mo + 1, 0)
  const q = Math.floor(m / 3)

  switch (preset) {
    case 'this_month':
      return { start: fmtIso(firstOf(y, m)), end: fmtIso(today) }
    case 'last_month':
      return { start: fmtIso(firstOf(y, m - 1)), end: fmtIso(lastOf(y, m - 1)) }
    case 'this_quarter':
      return { start: fmtIso(firstOf(y, q * 3)), end: fmtIso(today) }
    case 'last_quarter': {
      const lqStart = q === 0 ? firstOf(y - 1, 9)  : firstOf(y, (q - 1) * 3)
      const lqEnd   = q === 0 ? lastOf(y - 1, 11)  : lastOf(y, q * 3 - 1)
      return { start: fmtIso(lqStart), end: fmtIso(lqEnd) }
    }
    case 'this_year':
      return { start: `${y}-01-01`, end: fmtIso(today) }
    case 'last_year':
      return { start: `${y - 1}-01-01`, end: `${y - 1}-12-31` }
    default:
      return { start: fmtIso(firstOf(y, m)), end: fmtIso(today) }
  }
}

function presetLabel(p: Preset): string {
  const labels: Record<Preset, string> = {
    this_month:    'This Month',
    last_month:    'Last Month',
    this_quarter:  'This Quarter',
    last_quarter:  'Last Quarter',
    this_year:     'This Year',
    last_year:     'Last Year',
    custom:        'Custom',
  }
  return labels[p]
}

function fmtDisplayRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString(undefined, opts)
  const e = new Date(end   + 'T00:00:00').toLocaleDateString(undefined, opts)
  return `${s} – ${e}`
}

// ── Download helper ───────────────────────────────────────────────────────────

function downloadCsv(content: string, filename: string) {
  const bom = '﻿' // UTF-8 BOM — Excel opens correctly with this
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: string
  onClose: () => void
  /** If set, export is scoped to this customer only */
  customerId?: string | null
  /** Display name for the customer (used in the modal subtitle) */
  customerName?: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExportCsvModal({ companyId, onClose, customerId, customerName }: Props) {
  const [preset, setPreset]         = useState<Preset>('this_month')
  const [customStart, setStart]     = useState(() => getPresetRange('this_month').start)
  const [customEnd, setEnd]         = useState(() => getPresetRange('this_month').end)
  const [exporting, setExporting]   = useState(false)
  const [result, setResult]         = useState<{ invoiceCount: number; paymentCount: number } | null>(null)
  const [exportError, setExportErr] = useState<string | null>(null)

  const activeRange = preset === 'custom'
    ? { start: customStart, end: customEnd }
    : getPresetRange(preset)

  function selectPreset(p: Preset) {
    setPreset(p)
    if (p !== 'custom') {
      const r = getPresetRange(p)
      setStart(r.start)
      setEnd(r.end)
    }
    setResult(null)
    setExportErr(null)
  }

  const handleExport = useCallback(async () => {
    setExporting(true)
    setResult(null)
    setExportErr(null)

    const res = await exportQuickBooksCSV({
      companyId,
      startDate: activeRange.start,
      endDate:   activeRange.end,
      customerId: customerId ?? null,
    })

    setExporting(false)

    if (res.error) {
      setExportErr(res.error)
      return
    }

    // Build a datestamp suffix for the filenames
    const today = new Date().toISOString().slice(0, 10)
    const suffix = customerId && customerName
      ? `${customerName.toLowerCase().replace(/\s+/g, '-')}_${today}`
      : today

    downloadCsv(res.invoicesCsv, `qb_invoices_${suffix}.csv`)

    // Small delay so the second download doesn't get blocked as a pop-up
    if (res.paymentCount > 0) {
      setTimeout(() => downloadCsv(res.paymentsCsv, `qb_payments_${suffix}.csv`), 300)
    }

    setResult({ invoiceCount: res.invoiceCount, paymentCount: res.paymentCount })
  }, [companyId, customerId, customerName, activeRange])

  const PRESETS: Preset[] = [
    'this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year', 'custom',
  ]

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, border: `1px solid ${C.border}`, borderRadius: 10,
    padding: '0 12px', fontSize: 14, fontFamily: 'inherit', color: C.midnight,
    background: '#FAFAFA', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.muted,
    textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 5,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      {/* Backdrop */}
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(13,27,42,0.55)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div style={{
        position: 'relative', background: '#FFFFFF', borderRadius: 22,
        padding: '28px 24px', width: '100%', maxWidth: 420,
        boxShadow: '0 24px 64px rgba(13,27,42,0.22)',
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 18, right: 18,
            width: 32, height: 32, borderRadius: 8,
            border: `1px solid ${C.border}`, background: '#FFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}
        >
          <X size={15} color={C.muted} />
        </button>

        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: C.midnight, margin: '0 0 4px' }}>
            Export to QuickBooks CSV
          </h2>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            {customerId && customerName
              ? `Exporting invoices for ${customerName}`
              : 'Exports all invoices and payments into QuickBooks-compatible CSV files.'}
          </p>
        </div>

        {/* Date range presets */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Date Range</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PRESETS.map(p => (
              <button
                key={p}
                onClick={() => selectPreset(p)}
                style={{
                  height: 30, padding: '0 10px', borderRadius: 20,
                  border: `1.5px solid ${preset === p ? C.midnight : C.border}`,
                  background: preset === p ? C.midnight : '#FFF',
                  color: preset === p ? '#FFF' : C.muted,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 130ms ease',
                }}
              >
                {presetLabel(p)}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date inputs — only visible when custom selected */}
        {preset === 'custom' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>From</label>
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={e => { setStart(e.target.value); setResult(null); setExportErr(null) }}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                onChange={e => { setEnd(e.target.value); setResult(null); setExportErr(null) }}
                style={inputStyle}
              />
            </div>
          </div>
        )}

        {/* Active range preview */}
        <div style={{
          background: C.bg, borderRadius: 12, padding: '10px 14px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <FileText size={13} color={C.muted} style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: C.midnight, margin: 0 }}>
            <strong>{fmtDisplayRange(activeRange.start, activeRange.end)}</strong>
          </p>
        </div>

        {/* What gets exported info */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>What you'll get</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {[
              { label: 'qb_invoices.csv', desc: 'One row per line item — ready to import into QuickBooks Online' },
              { label: 'qb_payments.csv', desc: 'One row per payment received (if any recorded)' },
            ].map(f => (
              <div key={f.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                  background: '#E0F7FC', color: '#0097B2',
                  borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap', marginTop: 1,
                }}>{f.label}</span>
                <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Success state */}
        {result && (
          <div style={{
            background: '#D1FAE5', borderRadius: 12, padding: '12px 16px', marginBottom: 16,
            display: 'flex', gap: 10, alignItems: 'center',
          }}>
            <Check size={15} color="#065F46" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: '#065F46', margin: 0 }}>
              <strong>{result.invoiceCount}</strong> invoice{result.invoiceCount !== 1 ? 's' : ''}
              {result.paymentCount > 0 ? ` · ${result.paymentCount} payment${result.paymentCount !== 1 ? 's' : ''}` : ''}
              {' '}exported — check your downloads folder.
            </p>
          </div>
        )}

        {/* Error state */}
        {exportError && (
          <div style={{
            background: '#FEE2E2', borderRadius: 12, padding: '12px 16px', marginBottom: 16,
          }}>
            <p style={{ fontSize: 13, color: '#991B1B', margin: 0 }}>Export failed: {exportError}</p>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 44, borderRadius: 12, border: `1px solid ${C.border}`,
              background: '#FFF', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', color: C.muted,
            }}
          >
            {result ? 'Done' : 'Cancel'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || !activeRange.start || !activeRange.end}
            style={{
              flex: 2, height: 44, borderRadius: 12, border: 'none',
              background: result ? C.green : C.midnight,
              color: '#FFF', fontSize: 14, fontWeight: 700,
              cursor: exporting ? 'default' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: exporting ? 0.75 : 1,
              transition: 'background 300ms ease',
            }}
          >
            {exporting ? (
              <><Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Exporting…</>
            ) : result ? (
              <><Download size={15} /> Export Again</>
            ) : (
              <><Download size={15} /> Export CSV</>
            )}
          </button>
        </div>

        <p style={{ fontSize: 11, color: C.muted, margin: '12px 0 0', textAlign: 'center', lineHeight: 1.5 }}>
          Downloads two files: invoices + payments.{' '}
          <a
            href="https://quickbooks.intuit.com/learn-support/en-us/import-or-export/import-invoices/00/185932"
            target="_blank" rel="noopener noreferrer"
            style={{ color: C.cyan, textDecoration: 'none' }}
          >
            QuickBooks import guide ↗
          </a>
        </p>
      </div>
    </div>
  )
}

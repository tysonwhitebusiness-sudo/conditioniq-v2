import { createClient } from '@/lib/supabase/client'

// Inspection history as CSV, available on every plan. Rows are the generated
// reports, the same rows usage and Pay Per Use invoices count, so an exported
// month reconciles with the bill.

export interface ExportInspection {
  report_generated_at: string | null
  vin: string | null
  year: number | null
  make: string | null
  model: string | null
  odometer: number | null
  inspector_name: string | null
  inspection_location: string | null
  overall_condition: string | null
  vehicle_score: number | null
  total_issues: number | null
  critical_issues: number | null
}

const COLUMNS: { header: string; value: (r: ExportInspection) => string | number | null }[] = [
  { header: 'Report date', value: r => formatTimestamp(r.report_generated_at) },
  { header: 'VIN', value: r => r.vin },
  { header: 'Year', value: r => r.year },
  { header: 'Make', value: r => r.make },
  { header: 'Model', value: r => r.model },
  { header: 'Odometer', value: r => r.odometer },
  { header: 'Inspector', value: r => r.inspector_name },
  { header: 'Location', value: r => r.inspection_location },
  { header: 'Condition', value: r => r.overall_condition },
  { header: 'Score', value: r => r.vehicle_score },
  { header: 'Issues', value: r => r.total_issues },
  { header: 'Critical issues', value: r => r.critical_issues },
]

const SELECT = 'report_generated_at, vin, year, make, model, odometer, inspector_name, inspection_location, overall_condition, vehicle_score, total_issues, critical_issues'
const PAGE_SIZE = 1000

// Local time, sortable: 2026-09-16 14:05
function formatTimestamp(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(value)
  // Text starting with a formula character is run as a formula by spreadsheet
  // apps. Inspector names and locations are free text, so neutralize it.
  let text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`
  return text
}

export function inspectionsToCsv(rows: ExportInspection[]): string {
  const lines = [COLUMNS.map(c => csvCell(c.header)).join(',')]
  for (const row of rows) lines.push(COLUMNS.map(c => csvCell(c.value(row))).join(','))
  return lines.join('\r\n') + '\r\n'
}

export async function loadExportInspections(companyId: string): Promise<ExportInspection[]> {
  const supabase = createClient()
  const all: ExportInspection[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('vehicle_inspections')
      .select(SELECT)
      .eq('company_id', companyId)
      .not('report_generated_at', 'is', null)
      .order('report_generated_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    all.push(...((data ?? []) as ExportInspection[]))
    if (!data || data.length < PAGE_SIZE) return all
  }
}

// Builds the file in the browser and starts the download. Returns the row count.
export async function downloadInspectionHistory(companyId: string, companyName?: string): Promise<number> {
  const rows = await loadExportInspections(companyId)
  // Byte order mark so Excel opens the file as UTF-8.
  const blob = new Blob(['﻿', inspectionsToCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const slug = (companyName ?? 'inspections').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'inspections'
  const today = formatTimestamp(new Date().toISOString()).slice(0, 10)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${slug}-inspection-history-${today}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return rows.length
}

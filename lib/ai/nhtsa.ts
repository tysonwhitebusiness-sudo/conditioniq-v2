import type { ReportRecall } from '@/lib/report/model'

// B4 · Recalls and owner complaints for the vehicle's make, model and year,
// from NHTSA's free public API. A recall list covers the model, not whether
// this particular VIN was repaired, so the report says so beside it.

const API = 'https://api.nhtsa.gov'

export interface VehicleHistory {
  recalls: ReportRecall[]
  complaints: { count: number; topAreas: string[] } | null
}

async function getJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())

/** NHTSA dates arrive as DD/MM/YYYY. */
function formatDate(value: unknown): string | undefined {
  const m = String(value ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return undefined
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export async function vehicleHistory(make: string | null, model: string | null, year: string | null): Promise<VehicleHistory> {
  if (!make || !model || !year) return { recalls: [], complaints: null }
  const q = `make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`
  const [recallBody, complaintBody] = await Promise.all([
    getJson(`${API}/recalls/recallsByVehicle?${q}`),
    getJson(`${API}/complaints/complaintsByVehicle?${q}`),
  ])

  const recalls: ReportRecall[] = (recallBody?.results ?? []).map((r: any) => ({
    id: String(r.NHTSACampaignNumber),
    component: titleCase(String(r.Component ?? '').split(':').map((s: string) => s.trim()).join(': ')),
    summary: String(r.Summary ?? '').replace(/^.*?is recalling certain [^.]*\.\s*/i, '').trim() || String(r.Summary ?? ''),
    reportedOn: formatDate(r.ReportReceivedDate),
  }))

  let complaints: VehicleHistory['complaints'] = null
  const list: any[] = complaintBody?.results ?? []
  if (list.length) {
    const counts = new Map<string, number>()
    for (const c of list) for (const part of String(c.components ?? '').split(',')) {
      const name = part.trim().toLowerCase()
      if (name && name !== 'unknown or other') counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    complaints = {
      count: list.length,
      topAreas: Array.from(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name),
    }
  }
  return { recalls, complaints }
}

// S · Finding a VIN in what a barcode or a text reader returned.
//
// A VIN is accepted only when its ninth character, the check digit, agrees
// with the other sixteen. VINs never use I, O or Q, so a reader that returns
// one of them has misread a 1 or a 0; those are repaired before checking.
// Barcodes on newer labels (Data Matrix, QR) carry more than the VIN, so the
// VIN is searched for inside the payload rather than expected to be all of it.

import { vinCheckDigitValid } from '@/lib/report/findings'

const REPAIR: Record<string, string> = { I: '1', O: '0', Q: '0' }

export function repairVin(value: string): string {
  return value.toUpperCase().replace(/[IOQ]/g, c => REPAIR[c])
}

/** The first run of 17 VIN characters with a valid check digit, or null. */
export function extractVin(text: string): string | null {
  const compact = text.toUpperCase().replace(/[^A-Z0-9]/g, ' ')
  // Whole tokens first, then every 17-character window, so a VIN run together
  // with a prefix or a part number is still found.
  const tokens = compact.split(/\s+/).filter(Boolean)
  for (const token of tokens) {
    if (token.length === 17 && vinCheckDigitValid(repairVin(token))) return repairVin(token)
  }
  const joined = tokens.join('')
  for (let i = 0; i + 17 <= joined.length; i++) {
    const window = repairVin(joined.slice(i, i + 17))
    if (vinCheckDigitValid(window)) return window
  }
  return null
}

/**
 * NHTSA's decoder, as the second check on a read. A VIN that passes its check
 * digit but that NHTSA cannot decode is not accepted from a scan.
 */
export async function nhtsaDecodes(vin: string): Promise<boolean> {
  try {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return false
    const body = await res.json()
    const row = body?.Results?.[0]
    return !!row && String(row.ErrorCode ?? '').split(',').map((s: string) => s.trim()).includes('0') && !!row.Make
  } catch {
    return false
  }
}

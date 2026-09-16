'use server'

import crypto from 'crypto'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { WorkOrderStatus } from '@/lib/work-order-status'

const DEVICE_COOKIE = 'scan_device_id'
const REVERIFY_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000

// ── QR token ──────────────────────────────────────────────────────────────────
// Opaque, app-generated (not a DB default) — see the Phase 7 design discussion for
// why this deliberately doesn't mirror lot_invoice_groups.portal_token's untracked
// mechanism. base64url over hex: same generator, shorter string for the same
// entropy, which matters for a physically small printed QR code.

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export async function getOrCreateQrToken(vehicleId: string): Promise<string> {
  const supabase = createClient()
  const { data: existing } = await supabase.from('storage_vehicles').select('qr_token').eq('id', vehicleId).single()
  if (existing?.qr_token) return existing.qr_token
  return regenerateQrToken(vehicleId)
}

export async function regenerateQrToken(vehicleId: string): Promise<string> {
  const supabase = createClient()
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = generateToken()
    const { error } = await supabase.from('storage_vehicles').update({ qr_token: token }).eq('id', vehicleId)
    if (!error) return token
  }
  throw new Error('Could not generate a unique QR token')
}

// ── Token lookup (scan route) ──────────────────────────────────────────────────
// Uses the authenticated, RLS-respecting server client — not an admin client.
// A staff member logged into the wrong company simply gets null back via RLS,
// same as an invalid token; no separate cross-tenant check needs writing.

export interface ScanVehicle {
  id: string
  company_id: string
  vin: string
  year: string | null
  make: string | null
  model: string | null
  work_order_status: WorkOrderStatus
  released_at: string | null
}

export async function lookupVehicleByQrToken(token: string): Promise<ScanVehicle | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('storage_vehicles')
    .select('id, company_id, vin, year, make, model, work_order_status, released_at')
    .eq('qr_token', token)
    .maybeSingle()
  if (error || !data) return null
  return data as ScanVehicle
}

// ── Remembered-device PIN gate ─────────────────────────────────────────────────

function hashPin(pin: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin, salt, 64, (err, derivedKey) => {
      if (err) reject(err)
      else resolve(derivedKey.toString('hex'))
    })
  })
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export type ScanVerificationState = 'verified' | 'needs_pin_setup' | 'needs_pin_verify'

// Read-only — safe to call from a Server Component render. Creating the device
// cookie happens only inside setupScanPin, which runs as a real Server Action.
export async function getScanVerificationState(): Promise<ScanVerificationState> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 'needs_pin_setup' // caller must have already confirmed a session exists

  const deviceId = cookies().get(DEVICE_COOKIE)?.value ?? null
  if (!deviceId) return 'needs_pin_setup'

  const { data: row } = await supabase
    .from('user_scan_pins')
    .select('last_verified_at')
    .eq('user_id', user.id)
    .eq('device_id', deviceId)
    .maybeSingle()

  if (!row) return 'needs_pin_setup'

  const age = Date.now() - new Date(row.last_verified_at).getTime()
  return age < REVERIFY_WINDOW_MS ? 'verified' : 'needs_pin_verify'
}

export async function setupScanPin(pin: string): Promise<{ error: string | null }> {
  if (!/^\d{4,6}$/.test(pin)) return { error: 'PIN must be 4-6 digits.' }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const store = cookies()
  let deviceId = store.get(DEVICE_COOKIE)?.value
  if (!deviceId) {
    deviceId = crypto.randomBytes(16).toString('hex')
    store.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 400,
    })
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const pinHash = await hashPin(pin, salt)

  const { error } = await supabase.from('user_scan_pins').upsert(
    {
      user_id: user.id, device_id: deviceId, pin_hash: pinHash, pin_salt: salt,
      failed_attempts: 0, locked_until: null, last_verified_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,device_id' },
  )
  if (error) return { error: 'Could not save PIN.' }
  return { error: null }
}

export async function verifyScanPin(pin: string): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const deviceId = cookies().get(DEVICE_COOKIE)?.value
  if (!deviceId) return { error: 'No PIN set up for this device yet.' }

  const { data: row } = await supabase
    .from('user_scan_pins')
    .select('id, pin_hash, pin_salt, failed_attempts, locked_until')
    .eq('user_id', user.id)
    .eq('device_id', deviceId)
    .maybeSingle()
  if (!row) return { error: 'No PIN set up for this device yet.' }

  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { error: 'Too many attempts. Try again in a few minutes.' }
  }

  const candidateHash = await hashPin(pin, row.pin_salt)
  if (!safeEqual(candidateHash, row.pin_hash)) {
    const attempts = row.failed_attempts + 1
    const locked = attempts >= MAX_FAILED_ATTEMPTS
    await supabase.from('user_scan_pins').update({
      failed_attempts: attempts,
      locked_until: locked ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null,
    }).eq('id', row.id)
    return { error: locked ? 'Too many attempts. Try again in 15 minutes.' : 'Incorrect PIN.' }
  }

  await supabase.from('user_scan_pins').update({
    failed_attempts: 0, locked_until: null, last_verified_at: new Date().toISOString(),
  }).eq('id', row.id)
  return { error: null }
}

/**
 * Idempotent QA seed script.
 * Creates (or updates) a test company + admin user with all feature flags enabled
 * and a set of sample vehicles across different lifecycle statuses.
 *
 * Usage:
 *   npx tsx scripts/seed-qa-account.ts
 *
 * Requires in environment (or .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load .env.local (Next.js convention)
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) dotenv.config({ path: envPath })
else dotenv.config()

// ── Config ────────────────────────────────────────────────────────────────────

const QA_EMAIL    = 'qa-test@conditioniq.app'
const QA_PASSWORD = 'QAtest1234!'
const QA_COMPANY_SLUG = 'qa-test'
const QA_COMPANY_NAME = 'QA Test Storage'

const FEATURE_FLAGS = [
  'lot_map',
  'white_label',
  'send_to_inspector',
  'team_members',
  'locations',
] as const

const SAMPLE_VEHICLES = [
  {
    vin: 'QA00000000000001',
    year: '2021',
    make: 'Toyota',
    model: 'Camry',
    lifecycle_status: 'pending_arrival',
    arrived_at: daysAgo(0),
    daily_rate: 8.00,
    billing_type: 'daily',
  },
  {
    vin: 'QA00000000000002',
    year: '2019',
    make: 'Honda',
    model: 'Accord',
    lifecycle_status: 'on_lot',
    arrived_at: daysAgo(14),
    daily_rate: 10.00,
    billing_type: 'daily',
  },
  {
    vin: 'QA00000000000003',
    year: '2022',
    make: 'Ford',
    model: 'F-150',
    lifecycle_status: 'on_lot',
    arrived_at: daysAgo(7),
    daily_rate: 12.00,
    billing_type: 'daily',
  },
  {
    vin: 'QA00000000000004',
    year: '2018',
    make: 'Chevrolet',
    model: 'Malibu',
    lifecycle_status: 'one_off',
    arrived_at: daysAgo(3),
    daily_rate: null,
    billing_type: null,
  },
  {
    vin: 'QA00000000000005',
    year: '2020',
    make: 'Nissan',
    model: 'Altima',
    lifecycle_status: 'released',
    arrived_at: daysAgo(30),
    released_at: daysAgo(2),
    daily_rate: 8.00,
    billing_type: 'daily',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

function assert(val: string | undefined, name: string): string {
  if (!val) {
    console.error(`Missing env var: ${name}`)
    process.exit(1)
  }
  return val
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  const supabaseUrl = assert(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL')
  const serviceKey  = assert(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('\n🌱  Seeding QA account...\n')

  // ── 1. Upsert company ──────────────────────────────────────────────────────

  const { data: existingCompany } = await supabase
    .from('companies')
    .select('id')
    .eq('slug', QA_COMPANY_SLUG)
    .single()

  let companyId: string

  const companyPayload = {
    name: QA_COMPANY_NAME,
    slug: QA_COMPANY_SLUG,
    subscription_tier: 'pro',
    account_type: 'storage_owner',
    legacy_pricing: false,
    billing_interval: 'monthly',
    reports_used: 0,
    reports_included: 999,
    billing_cycle_start: new Date().toISOString(),
    default_billing_type: 'daily',
    default_daily_rate: 8.00,
    default_monthly_rate: 200.00,
  }

  if (existingCompany) {
    companyId = existingCompany.id
    const { error } = await supabase
      .from('companies')
      .update(companyPayload)
      .eq('id', companyId)
    if (error) throw new Error(`Update company failed: ${error.message}`)
    console.log(`✓  Company updated (id: ${companyId})`)
  } else {
    const { data, error } = await supabase
      .from('companies')
      .insert(companyPayload)
      .select('id')
      .single()
    if (error || !data) throw new Error(`Insert company failed: ${error?.message}`)
    companyId = data.id
    console.log(`✓  Company created (id: ${companyId})`)
  }

  // ── 2. Upsert auth user ────────────────────────────────────────────────────

  const { data: userList } = await supabase.auth.admin.listUsers()
  const existingUser = userList?.users?.find(u => u.email === QA_EMAIL)

  let userId: string

  if (existingUser) {
    userId = existingUser.id
    await supabase.auth.admin.updateUserById(userId, { password: QA_PASSWORD })
    console.log(`✓  Auth user updated (id: ${userId})`)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: QA_EMAIL,
      password: QA_PASSWORD,
      email_confirm: true,
    })
    if (error || !data.user) throw new Error(`Create user failed: ${error?.message}`)
    userId = data.user.id
    console.log(`✓  Auth user created (id: ${userId})`)
  }

  // ── 3. Upsert user_profiles ────────────────────────────────────────────────

  const { error: profileError } = await supabase
    .from('user_profiles')
    .upsert({
      id: userId,
      full_name: 'QA Tester',
      email: QA_EMAIL,
      role: 'inspector',      // display-only field; admin access is granted via company_members
      platform_role: 'user',
      company_id: companyId,
    }, { onConflict: 'id' })

  if (profileError) throw new Error(`Upsert user_profiles failed: ${profileError.message}`)
  console.log('✓  user_profiles upserted')

  // ── 4. Upsert company_members ──────────────────────────────────────────────

  const { error: memberError } = await supabase
    .from('company_members')
    .upsert({
      user_id: userId,
      company_id: companyId,
      role: 'admin',
    }, { onConflict: 'user_id,company_id' })

  if (memberError) throw new Error(`Upsert company_members failed: ${memberError.message}`)
  console.log('✓  company_members upserted')

  // ── 5. Upsert feature flags ────────────────────────────────────────────────

  const flagRows = FEATURE_FLAGS.map(key => ({
    company_id: companyId,
    feature_key: key,
    enabled: true,
    config: {},
  }))

  const { error: flagError } = await supabase
    .from('company_feature_flags')
    .upsert(flagRows, { onConflict: 'company_id,feature_key' })

  if (flagError) throw new Error(`Upsert feature flags failed: ${flagError.message}`)
  console.log(`✓  Feature flags enabled: ${FEATURE_FLAGS.join(', ')}`)

  // ── 6. Upsert sample vehicles ──────────────────────────────────────────────

  for (const v of SAMPLE_VEHICLES) {
    const { data: existing } = await supabase
      .from('storage_vehicles')
      .select('id')
      .eq('vin', v.vin)
      .eq('company_id', companyId)
      .single()

    const payload = {
      company_id: companyId,
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.model,
      lifecycle_status: v.lifecycle_status,
      arrived_at: v.arrived_at,
      released_at: (v as any).released_at ?? null,
      daily_rate: v.daily_rate ?? null,
      billing_type: v.billing_type ?? null,
    }

    if (existing) {
      await supabase.from('storage_vehicles').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('storage_vehicles').insert(payload)
    }

    console.log(`  vehicle ${v.vin}  ${v.lifecycle_status}  ${v.year} ${v.make} ${v.model}`)
  }

  console.log('✓  Sample vehicles seeded')

  // ── Done ───────────────────────────────────────────────────────────────────

  console.log('\n✅  QA seed complete\n')
  console.log('  Email:    ', QA_EMAIL)
  console.log('  Password: ', QA_PASSWORD)
  console.log('  Company:  ', QA_COMPANY_NAME, `(slug: ${QA_COMPANY_SLUG})`)
  console.log('  Plan:      pro | storage_owner | lot_map + all flags ON')
  console.log()
}

seed().catch(err => {
  console.error('\n❌  Seed failed:', err.message ?? err)
  process.exit(1)
})

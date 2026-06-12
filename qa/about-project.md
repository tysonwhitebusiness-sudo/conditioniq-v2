# Condition IQ — QA Context

## App Overview

**Condition IQ** is a vehicle inspection and storage management platform for automotive businesses. It generates structured condition reports, tracks vehicle lifecycle status, manages storage lot capacity, and handles billing for stored vehicles.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Inline styles (Midnight Pro design system) + Tailwind (minimal) |
| Backend | Supabase (Postgres + Auth + Storage + RLS) |
| PDF generation | @react-pdf/renderer |
| Deployment | Vercel (auto-deploy from `main` branch) |
| Image storage | Supabase Storage buckets: `inspection-photos`, `invoices`, `branding`, `lot-backgrounds` |

## Account Types

| Type | Key | Description |
|---|---|---|
| Storage Owner | `storage_owner` | Lot/storage facility. Has access to Lot Map, lot billing, invoicing. Primary test account type. |
| FMC | `fmc` | Fleet management company. Uses fleet dispatch and inspection workflows. Routes differ from storage owner. |

## Roles

| Role | Level | Access |
|---|---|---|
| `super_admin` | Platform | Admin dashboard, CRM, impersonation, all companies |
| `admin` | Company | Settings, team members, billing, branding, lot setup |
| `inspector` | Company | Inspection wizard, vehicle list — no settings |

## Feature Flags (per company)

| Flag | Default | What it gates |
|---|---|---|
| `lot_map` | OFF | Lot Map page, Lot Billing settings, billing card on vehicle detail, invoice generation |
| `white_label` | ON | Branding settings (logo upload), logo applied to inspection PDFs |
| `send_to_inspector` | ON | Dispatch tab, send inspection link to inspector |
| `team_members` | ON | Team Members settings page |
| `locations` | ON | Multi-location support |

## Feature Areas Active for Testing

| Area | Routes |
|---|---|
| Vehicle inventory + status flow | `/storage/inventory`, `/inventory/[vehicleId]` |
| Inspection wizard | `/inspect/[token]` (camera-first damage flow) |
| Vehicle detail page | `/inventory/[vehicleId]` |
| Lot Map | `/lot` (requires `lot_map` flag) |
| Lot Billing + Invoicing | `/settings/lot-billing`, vehicle detail billing card |
| White Label / Branding | `/settings/branding` |
| Dispatch / Send to Inspector | `/storage/dispatch` |
| Team Members | `/settings/members` |
| Billing & Plan | `/settings/billing` |
| Admin Dashboard + CRM | `/admin/overview`, `/admin/customers`, `/admin/crm` |

## Vehicle Lifecycle Statuses

```
pending_arrival → on_lot → in_progress → released
                              ↕
                           one_off
```

## Test Environment

| | |
|---|---|
| **Deployment URL** | https://conditioniq-v2.vercel.app/ |
| **QA account email** | qa-test@conditioniq.app |
| **QA account password** | QAtest1234!|
| **Supabase project URL** | [FILL IN] |
| **Admin dashboard** | https://conditioniq-v2.vercel.app/admin/overview |

## Running the Seed Script

```bash
# Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
npx ts-node --project tsconfig.json -e "require('./scripts/seed-qa-account.ts')"
# or
npx tsx scripts/seed-qa-account.ts
```

The script is idempotent — safe to re-run. It prints created credentials to the console.

# CIQ (Condition IQ) — Handoff / Resume Prompt

Paste this whole file as your first message in a new Claude Code session to
resume work with full context. It was written by the Claude instance that did
the work, specifically because the prior conversation's memory does not carry
over — treat everything below as ground truth, not as something to re-derive.

## 1. What this project is

Condition IQ (CIQ) is a lot-management / vehicle-inspection SaaS app.
Next.js 14 App Router, React 18, Supabase (Postgres + Storage + Auth). Repo
root: `c:\Users\13143\conditioniq-v2`. Windows/PowerShell environment (bash
tool also available, but syntax differs — see note in §6).

## 2. Critical: repo state right now

**Nothing is lost, but nothing is committed either.** As of this handoff:

- Branch `main`, in sync with `origin/main` (no divergence, no stash).
- **53 modified tracked files** (+5,193 / −2,109 lines) and **54 new
  untracked files/directories** — all uncommitted, sitting on top of the last
  real commit `59e4e55` ("Upload inspection photos to Storage on capture
  instead of base64 in wizard state").
- File timestamps span **Aug 5 → Aug 8** (in-repo dates) — about 4 days of
  continuous feature work that was never committed, then the user stepped
  away for roughly a month before this handoff was written.
- The whole tree currently **type-checks clean** (`npx tsc --noEmit -p
  tsconfig.json` → no errors) and has **no TODO/FIXME/stub markers** in any
  new file — this is finished, cleaned-up work, not something abandoned
  mid-edit.
- **Strong recommendation: commit this in logical chunks before doing
  anything else.** 107 uncommitted files sitting for a month is one bad
  `git clean -f` or disk failure away from disaster. Suggested chunking
  (oldest → newest, see §3 for what's in each):
  1. Vehicle Master / core data model migrations (Aug 5)
  2. QR / VIN scan flow
  3. Damage picker + 2D/3D tagger (Aug 7)
  4. Intake/Outtake redesign + camera-capture work (Aug 8, most recent)
  5. Whatever's left in the "unverified older work" bucket (§3.5) once you've
     eyeballed it

Full untracked-file list as of this handoff:

```
.eslintrc.hex.json
.husky/
app/(app)/inventory/[vehicleId]/checkpoint/
app/(app)/inventory/[vehicleId]/comparison/
app/(app)/inventory/[vehicleId]/print-qr/
app/(app)/vehicles/intake/
app/scan/
components/checkpoint/
components/damage/
components/home/lot-map-preview.tsx
components/inventory/
components/lot/off-lot-side-list.tsx
components/scan/
components/status/
components/ui/capacity-bar.tsx
components/ui/empty-state.tsx
components/ui/vin-scanner.tsx
components/vehicles/
lib/billing-defaults-actions.ts
lib/checkpoint-actions.ts
lib/checkpoint-server-actions.ts
lib/damage-actions.ts
lib/design-tokens.ts
lib/qr-actions.ts
lib/service-log-actions.ts
lib/vehicle-model-assets.ts
lib/work-order-status.ts
scripts/seed-vehicle-model-assets.ts
scripts/split-2d-images.ts
supabase/migrations/20260805000000_create_vehicle_master.sql
supabase/migrations/20260805000001_add_vehicle_master_id_to_storage_vehicles.sql
supabase/migrations/20260805000002_add_work_order_status.sql
supabase/migrations/20260805000003_backfill_work_order_status.sql
supabase/migrations/20260805000004_fix_terminal_status_unique_index.sql
supabase/migrations/20260805000005_create_damage_reference_tables.sql
supabase/migrations/20260805000006_create_damage_markers.sql
supabase/migrations/20260805000007_add_vehicle_template_to_vehicle_master.sql
supabase/migrations/20260805000008_create_vehicle_checkpoints.sql
supabase/migrations/20260805000009_add_service_fields_to_vehicle_charges.sql
supabase/migrations/20260805000010_create_company_status_billing_defaults.sql
supabase/migrations/20260805000011_create_customer_status_billing_overrides.sql
supabase/migrations/20260805000012_add_rate_overrides_to_customers.sql
supabase/migrations/20260805000013_add_size_class_to_lot_spots.sql
supabase/migrations/20260805000014_add_zone_id_to_lot_spots.sql
supabase/migrations/20260805000015_add_size_class_to_vehicle_master.sql
supabase/migrations/20260805000016_add_qr_token_to_storage_vehicles.sql
supabase/migrations/20260805000017_create_user_scan_pins.sql
supabase/migrations/20260807000000_create_vehicle_model_assets.sql
supabase/migrations/20260807000001_add_model_asset_columns_to_damage_markers.sql
supabase/migrations/20260807000002_add_model_asset_columns_to_vehicle_master.sql
supabase/migrations/20260807000003_add_z_position_to_damage_markers.sql
supabase/migrations/20260808000000_add_backfill_direction_to_vehicle_checkpoints.sql
supabase/migrations/ciq-dashboard-redesign-v2.html
supabase/migrations/ciq-vehicle-detail-redesign.html
```

Plus 53 modified tracked files (run `git status` / `git diff --stat` for the
current exact list — it may have shifted slightly since this was written).

**Migrations are applied manually by the user via their own workflow — never
run/apply Supabase migrations directly. Only verify schema state via live
queries after the user confirms they've applied something.**

## 3. What's been built (by phase, oldest to newest)

### 3.1 — Aug 5: Core data model / Vehicle Master
New tables/columns via `supabase/migrations/20260805*`: `vehicle_master`,
`work_order_status` (+ backfill + terminal-status unique index fix), damage
reference tables, `damage_markers`, `vehicle_checkpoints`, service fields on
`vehicle_charges`, company/customer status billing defaults & overrides,
rate overrides on customers, size-class + zone columns on `lot_spots` and
`vehicle_master`, QR token on `storage_vehicles`, `user_scan_pins`.

### 3.2 — Aug 5-6: QR / VIN scan flow
`app/scan/[token]/page.tsx`, `app/(app)/inventory/[vehicleId]/print-qr/`,
`components/scan/print-qr-client.tsx`, `components/ui/vin-scanner.tsx`,
`lib/qr-actions.ts`.

### 3.3 — Aug 7: Damage picker, 2D/3D tagger toggle
`components/damage/damage-tagger-toggle.tsx`, `lib/vehicle-model-assets.ts`,
`lib/damage-actions.ts`, `lib/work-order-status.ts`,
`scripts/split-2d-images.ts`, `scripts/seed-vehicle-model-assets.ts`,
migrations for vehicle-model-assets table and z-position on damage markers.
This is referred to in earlier conversation history as "Phases 9-12"
(damage picker foundation → 2D tagger → 3D tagger → 2D/3D toggle).

### 3.4 — Aug 8: Intake/Outtake redesign ("Phase 13") — most recent, most context available

**`components/checkpoint/checkpoint-form.tsx`** — full redesign: card-based
layout (Vehicle Condition / Damage / Photos / Notes via `SectionCard`),
expanded to 7 required photo slots, progress indicator, auto-advance between
form fields, Key Count defaults to 1.

**`components/ui/camera-capture.tsx`** — this file had the most churn and the
most important gotchas. In order:
1. Wired up the previously-unused continuous photo-sequence capture
   mechanism (`photoSequence`/`onSequenceCapture`/`currentSequenceIndex`
   props) — this was dead code with no real caller until checkpoint-form.tsx
   started using it.
2. Fixed a **real React 18 StrictMode bug**: `startCamera()` fires twice on
   mount in dev (StrictMode double-invoke), and the first call's
   `getUserMedia()`/`.play()` could resolve after the second call reassigned
   `videoRef.current.srcObject`, throwing `AbortError` and surfacing as a
   false "Camera access denied" error on every attempt. Fixed with a
   `requestIdRef` token pattern in both `startCamera` and `stopCamera` — each
   call tags itself with an id and checks it's still current before acting
   on async results.
3. Fixed a camera-denied file-upload fallback that didn't respect
   `photoSequence` mode (silently broke sequence advance).
4. **The shutter-button-missing saga**: user reported the shutter button was
   completely absent from the live DOM (confirmed via `querySelector`
   returning `null`, not just visually hidden) on a normal desktop browser,
   but present on mobile-emulation viewports. ~15 rounds of Playwright
   testing across every device/viewport/UA/touch/DPR combination **never
   once reproduced it**. Root cause was **never confirmed**. Per explicit
   user instruction, stopped root-causing and shipped a defensive structural
   fix instead: replaced `position:absolute; bottom:0` control bars (anchored
   to a flex child that didn't force `minHeight:0`, so its computed height
   could resolve ambiguously in some real browsers) with normal in-flow
   flexbox — the video area is `flex:1, minHeight:0` and the control row is a
   sibling with `flexShrink:0, minHeight:120` (fixed pixel floor, not a
   percentage). Verified via automated regression + screenshots, but **the
   user's real-browser confirmation of this specific fix was still pending
   when the follow-up request below came in** — see §4, this is the one
   concretely open item.
5. **Follow-up polish request** (after the structural fix): made the top bar
   more transparent with a gradient + text-shadow on the label for
   legibility; made the bottom shutter bar transparent camera-app style by
   positioning it `absolute` **inside the video's own flex box** (the
   now-reliable `flex:1, minHeight:0` div) rather than reverting to
   anchoring it to the outer container (which is what caused the original
   bug) — this is the safe way to get an overlay look without reintroducing
   the fragility; added a shutter click animation (white flash + button
   scale-press, with the frame still grabbed at tap-time before the visual
   delay); added fade/scale transitions between sequence photos and between
   preview↔live view (via a `camera-capture-view-fade-in` keyframe applied
   on branch/key remount). All of this passed type-check, lint, and a full
   7-shot Playwright regression, and was visually confirmed via screenshots
   at a normal 1440×900 desktop viewport.

**`lib/checkpoint-actions.ts`** — added `VehicleCheckpointDirection =
CheckpointDirection | 'backfill'` type; widened `createCheckpoint` (made
`keyCount` optional, defaults to 0) and `getCheckpoint` param types.

**`lib/checkpoint-server-actions.ts`** — widened `uploadCheckpointPhoto`'s
`direction` param type to match.

**`app/(app)/vehicles/page.tsx`** — split "Add Vehicle" into two flows:
"New Arrival" (routes to `/vehicles/intake`, the existing guided intake) vs.
**`AddExistingVehicleSlideOver`** (new — one-time backfill for vehicles
already on the lot, requires photos + full manual status picker, 5-photo
`BACKFILL_PHOTO_SLOTS`, uses `createCheckpoint(direction:'backfill')`). Fixed
a bug where `createCheckpoint`'s `null`-on-failure return wasn't checked in
the save handler (added `if (!checkpoint) throw new Error(...)`).

**`components/inventory/add-vehicle-choice.tsx`** (new) — the New
Arrival / Add Existing Vehicle choice modal.

**`components/layout/desktop-sidebar.tsx`** — added a Dashboard link, removed
the now-redundant Add Vehicle link.

**`supabase/migrations/20260808000000_add_backfill_direction_to_vehicle_checkpoints.sql`**
— widens the `direction` CHECK constraint on `vehicle_checkpoints` to include
`'backfill'`.

### 3.5 — Present but not narrated in detail (verify before assuming done)

These files exist in the working tree, the whole thing type-checks, and
there are no TODO markers — but I (the Claude instance writing this) don't
have detailed session context for them, likely because they were built in an
earlier session that isn't in my visible history. Don't assume they're
finished just because they compile — actually exercise them before trusting
them:

- `components/vehicles/board-view.tsx`
- `components/status/change-status.tsx`
- `components/lot/off-lot-side-list.tsx`
- `components/home/lot-map-preview.tsx`
- `components/ui/capacity-bar.tsx`
- `components/ui/empty-state.tsx`
- `app/(app)/inventory/[vehicleId]/comparison/page.tsx`
- `lib/design-tokens.ts` (referenced by `.eslintrc.json`'s `no-restricted-syntax`
  hex-color ban — there's a legacy-exemption file `.eslintrc.hex.json` for
  files not yet migrated to tokens)
- `lib/service-log-actions.ts`, `lib/billing-defaults-actions.ts`
- `.husky/` (pre-commit hook — check what it actually runs)
- `supabase/migrations/ciq-dashboard-redesign-v2.html`,
  `ciq-vehicle-detail-redesign.html` (these are HTML files sitting in the
  migrations folder, almost certainly design mockups, not real migrations —
  probably belong somewhere else, worth asking the user)

## 4. What's left / open items

1. **The one concrete unfinished thing**: the camera-capture.tsx transparent
   overlay + click/transition animation work (§3.4 item 5) was built and
   passed every automated check, but explicitly **still needs the user to
   manually confirm on their own normal full-height desktop browser** that
   the shutter button is visible/clickable and the transparent bars render
   correctly. This matters specifically because the underlying bug this
   overlay sits on top of (§3.4 item 4) was one that ~15 rounds of automated
   testing across every viewport/device/browser-profile combination could
   never reproduce, while the user hit it twice on real hardware — so
   automated confirmation is known to be insufficient for this file. Ask the
   user to check before treating this as closed.
2. Nothing else was explicitly flagged as "planned but not built" in visible
   history — everything else in the Aug 8 (Phase 13) scope was completed.
3. Unknown: whether there was a "Phase 14" or further roadmap discussed in
   an earlier session not in this handoff's source material. If the user has
   a punch list from further back, get it and cross-check against §3.5.
4. **Commit the work** (see §2) — this is arguably the most urgent item
   regardless of feature status, purely from a risk-of-loss standpoint.

## 5. Key technical context / gotchas to carry forward

- **React 18 StrictMode double-invokes mount effects in dev.** Any
  `useEffect` that starts an async resource (camera streams, subscriptions)
  needs a request-id/generation-token guard if a second invocation could
  race the first's resolution — see `camera-capture.tsx`'s `requestIdRef`
  pattern as the reference implementation.
- **Flexbox height reliability**: a flex child needs `minHeight: 0` set
  explicitly to reliably shrink/size in some browsers — the default
  `min-height: auto` on flex items can cause ambiguous sizing with
  content like `<video>` that has intrinsic dimensions. This was the root
  mechanism behind the shutter-button structural fix, even though the exact
  trigger condition on the user's real browser was never confirmed.
- **`direction` field pattern** on `vehicle_checkpoints`: narrow
  `CheckpointDirection` (`'intake'|'outtake'`, route-validated) vs. wider
  `VehicleCheckpointDirection` (adds `'backfill'`, used by
  `createCheckpoint`/`getCheckpoint`/`uploadCheckpointPhoto`) — keep this
  distinction if extending checkpoint direction handling further.
- **Design tokens** (`lib/design-tokens.ts`) + `.eslintrc.json`'s
  `no-restricted-syntax` rule bans hardcoded hex colors outside files listed
  in `.eslintrc.hex.json`'s legacy exemption list — new UI work should use
  tokens, not raw hex.
- **Migrations are applied manually by the user**, never by Claude directly
  — only verify via live Supabase queries after the fact.
- **QA test account** used for automated testing: `qa-test@conditioniq.app`
  / `QAtest1234!`. A known test vehicle used in Playwright scripts:
  `6066a049-2476-4784-8c69-b31de134109b` (QA00000000000002, Honda Accord).
- **Playwright testing conventions used in this project**: launch Chromium
  with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`
  to get a synthetic camera feed without real hardware; grant
  `permissions: ['camera']` on the context. Test scripts were written
  ad-hoc into the previous conversation's temp scratchpad directory, which
  is tied to that conversation's ID and **will not exist in a new session**
  — recreate equivalent scripts if you need to re-run regressions, using the
  QA account/vehicle ID above.
- **Windows/PowerShell environment**: the bash tool available here runs Git
  Bash (POSIX sh syntax), separate from the PowerShell tool — don't mix
  syntax between them.

## 6. Suggested first steps in a new session

1. Run `git status` and `git diff --stat` to confirm the state described in
   §2 still matches reality (it may have drifted if anything happened after
   this handoff was written).
2. Ask the user: (a) have they manually verified the camera-capture overlay
   fix on their real desktop browser yet (§4.1)? (b) do they want to commit
   the existing work now, and if so in what chunks? (c) is there a Phase 14
   or further roadmap to fold in?
3. Only after committing existing work (or getting explicit sign-off to
   proceed without committing) should new feature work start — don't let
   the uncommitted pile grow further.

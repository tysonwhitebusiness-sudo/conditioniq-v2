# Security Remediation Log

Running record of fixes applied following the 2026-07-06 ConditionIQ security audit. Each entry is self-contained — written so it can be understood without the conversation that produced it. Entries are appended only; earlier entries are never rewritten.

---

## 2026-07-07 — Self-service privilege escalation via `user_profiles.role` / `platform_role` / `company_id`

**Finding addressed, and original severity:** Critical (discovered during a follow-up read-only check of the RLS helper functions `is_admin()`, `is_platform_owner()`, and `get_my_company_id()`, which the original audit had flagged as an unverified blocking dependency for several other Critical findings — the admin panel authorization gap and the `companies`/`billed_inspections` RLS review). `user_profiles` had two redundant `UPDATE` RLS policies, `update_own_profile` and `user_self_update`, both `USING (auth.uid() = id)` with no restriction on which columns could be changed. Since `is_admin()` and `is_platform_owner()` both resolve to `EXISTS (... WHERE id = auth.uid() AND role = 'owner')`, and the `/admin` route middleware checks `user_profiles.platform_role = 'super_admin'`, any authenticated user could run an ordinary client-side Supabase call against their own row —
```js
await supabase.from('user_profiles').update({ role: 'owner', platform_role: 'super_admin' }).eq('id', myOwnId)
```
— and grant themselves full platform-owner access: RLS bypass wherever `is_admin()`/`is_platform_owner()` gate a policy (`companies`, `billed_inspections`, `vehicle_inspections`, `user_profiles` itself), plus direct entry to the `/admin` panel. A parallel, equally severe path existed via the same two policies against `company_id`: since most tenant-scoped tables' RLS resolves to `company_id = get_my_company_id()` (which just reads `user_profiles.company_id` for the caller), a user could set their own `company_id` to any other company's UUID and gain that company's full RLS-legitimate data access.

**What changed:**
- Read the definitions of `is_admin()`, `is_platform_owner()`, `get_my_company_id()`, and `my_company_id()` via `pg_proc` (read-only). `get_my_company_id()`/`my_company_id()` were confirmed safe — they correctly return `NULL` for a caller with no profile row, which correctly denies rather than wildcards in any `company_id = ...` comparison. `is_platform_owner()`'s own logic was confirmed sound; its risk was entirely the self-writable `role` column, not a bug in the function. `is_admin()` additionally contains a hardcoded personal-email bypass (`LOWER(auth.jwt() ->> 'email') = 'tysonwhitebusiness@gmail.com'`) — flagged but intentionally **not** touched by this fix; it's a separate, lower-urgency cleanup item still queued.
- Read the exact schema and RLS policies on `user_profiles` via `information_schema.columns` and `pg_policies` to confirm column names/defaults and rule out a conflicting existing trigger (only the standard `updated_at` maintenance trigger was present).
- Wrote and handed off (for the user to run directly in the Supabase SQL editor — this session has no direct database execution access) the following migration:
  ```sql
  CREATE OR REPLACE FUNCTION public.guard_user_profiles_privilege_columns()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
  BEGIN
    IF (
      NEW.role            IS DISTINCT FROM OLD.role
      OR NEW.platform_role IS DISTINCT FROM OLD.platform_role
      OR NEW.company_id    IS DISTINCT FROM OLD.company_id
    )
    AND NOT (
      auth.role() = 'service_role'
      OR public.is_admin()
      OR public.is_platform_owner()
    )
    THEN
      RAISE EXCEPTION 'Not authorized to change role, platform_role, or company_id on this profile';
    END IF;
    RETURN NEW;
  END;
  $$;

  CREATE TRIGGER trg_guard_user_profiles_privilege_columns
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_user_profiles_privilege_columns();
  ```
- No application code was changed — verified none was needed (see below).

**Why this closes the issue:** RLS policies grant or deny access at row granularity, not column granularity, so `update_own_profile`/`user_self_update` could not be narrowed to "allow editing your own profile, except these three columns" through the policy layer alone. A `BEFORE UPDATE` trigger runs regardless of which RLS policy admitted the row-level `UPDATE` and regardless of which code path or client issued it, so it closes the gap for the raw-Supabase-client attack shown above, for any future policy that might also grant `UPDATE` on this table, and for any application code that (like the one found below) forgot to add its own authorization check.

**Legitimate flows confirmed still working (verified by reading the actual code, not assumed):**
- `lib/role-actions.ts`'s `updatePlatformRole(userId, role)` — the function an owner uses to change another user's platform role. It runs under the acting user's own session (`createClient()`, not the service-role admin client). Since it touches `platform_role`, the trigger evaluates `is_platform_owner()` for the *acting* session — true for a real owner — so the exception is not raised and the update proceeds. Incidentally, this function had no in-code authorization check of its own (same gap pattern as the admin-panel finding from the original audit) — a non-owner calling it directly against their own `userId` would previously have succeeded via `update_own_profile`'s row match; the new trigger closes that too, as a side effect.
- `app/(app)/settings/profile/page.tsx`'s self-service "save profile" — confirmed by reading the file that it only ever updates `full_name`, never `role`/`platform_role`/`company_id`. Entirely unaffected.

**Open follow-ups / caveats:**
- **Status: confirmed run.** Independently re-verified directly against the live database (during a later log-accuracy audit, not at the time this entry was originally written): `trg_guard_user_profiles_privilege_columns` is present and enabled on `user_profiles`. The Step 4 manual test described below (self-escalation attempt as a non-admin test account; legitimate owner-driven role change on another account) has not itself been run — this confirms the trigger exists and is active, not that its behavior has been exercised end-to-end.
- No application code path was found that legitimately `UPDATE`s `user_profiles.company_id` — it appears to be set only once, at row creation. This is reassuring (a `BEFORE UPDATE` trigger can't affect an `INSERT`) but is based on an application-code search, not on inspecting every possible database-level trigger. A signup-time trigger on `auth.users` may exist outside the tracked `supabase/migrations/*.sql` files, the same blind spot that applied to `is_admin()`/`is_platform_owner()`/`get_my_company_id()` before they were introspected directly from the database in this same remediation step. Recommend a follow-up `pg_trigger` query against `auth.users` to close this gap definitively.
- The `is_admin()` hardcoded-email bypass clause noted above remains open and is queued as a separate, lower-urgency prompt.
- Operational note: the new trigger also blocks manual edits to these three columns made directly via the Supabase SQL editor, since that session runs as the `postgres` role — not `service_role` — and carries no `auth.uid()`. This is intentional (defense in depth), but means any future manual fix to a user's role requires first running `ALTER TABLE user_profiles DISABLE TRIGGER trg_guard_user_profiles_privilege_columns;`, making the change, and re-enabling it.

---

## 2026-07-07 — Anthropic API key exposed to the browser, called directly from client JS

**Finding addressed, and original severity:** Critical, finding #1 of the original 17-finding audit. Three `'use client'` components — `components/crm/lead-detail.tsx`, `components/crm/outreach-queue.tsx`, and a then-unused `components/crm/email-generator.tsx` — read `process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY` and called `https://api.anthropic.com/v1/messages` directly from the browser (with header `anthropic-dangerous-direct-browser-access: true`). Because Next.js inlines `NEXT_PUBLIC_*` variables as literal strings into the client JS bundle at build time, the key was extractable by anyone who fetched the deployed bundle — no login to the app required — and from there usable directly against Anthropic's API forever, with no rate limit and no way for this application to observe or stop the abuse, since the calls never touched its own server. The key had already been rotated in the Anthropic console as an out-of-band Step 0, ahead of any code change, since a browser-shipped key must be treated as already leaked regardless of when the code gets fixed.

**What changed:**
- This feature (AI-drafted cold-outreach emails/LinkedIn DMs for the internal sales CRM) was confirmed not in active use, so the decision was to remove the client-side call paths entirely rather than rebuild them behind a server proxy. If the feature is wanted again later, it gets rebuilt from scratch as a proper server action holding a non-public key.
- Investigated blast radius first: confirmed via repo-wide search that only these three files referenced the key, the `anthropic-dangerous-direct-browser-access` header, or `api.anthropic.com`; confirmed only two pages import these components (`app/admin/crm/leads/[id]/page.tsx` → `LeadDetail`, `app/admin/crm/queue/page.tsx` → `OutreachQueue`); and discovered that `components/crm/email-generator.tsx`'s exported `EmailGenerator` had **zero importers anywhere in the codebase** — it was already-dead code, not wired into any route.
- Deleted `components/crm/email-generator.tsx` outright.
- In `lead-detail.tsx`: removed the `showGenerator`/`genTouch` state, the per-touch "Generate" button, the "Email Generator" card and its toggle button, and the entire `EmailGeneratorInline` function (the fetch call, JSON-response parsing, and its own subject/body/mailto UI). Net −118 lines.
- In `outreach-queue.tsx`: removed the `STORAGE_PROMPT`/`TOW_PROMPT`/`CT_LABELS` constants (used solely to build the AI prompts), the `generate`/`generateDm` fetch functions and their `generating`/`genDm`/`prevBody` state, the "Generate Email (G)" and "Generate DM" buttons, the `g`/`r` keyboard shortcuts (kept `m`/`s`/`Escape`), the "Restore previous version" button (dead once `prevBody` was removed), and the now-unused `Wand2`/`RefreshCw` icon imports. The rest of `QuickSendPanel` — template tabs, touch tabs, Subject/Body fields, "Open in Mail," "Mark Sent," and the LinkedIn DM section — was kept, per instruction, as manually-typed functionality rather than removed.
- Removed the `NEXT_PUBLIC_ANTHROPIC_API_KEY` line from `.env.local` (its value was already blank, consistent with the Step 0 rotation). No `.env.example` or documented env-var list existed elsewhere in the repo to update.

**Why this closes the issue:** the vulnerable code path — not just the leaked key value — is now gone. Rotating the key (Step 0) addressed the already-leaked credential; deleting the call sites and the env var means there is no longer any client-bundled secret for a *future* rotation to protect, and no code path that could reintroduce the exposure by accident (e.g., someone re-adding the key to `.env.local` without realizing it would still be read by dead code). The two remaining CRM pages have no residual reference to Anthropic, the key, or the browser-access header anywhere in their component tree.

**A real functional bug found and fixed while doing this, not just a mechanical deletion:** in `outreach-queue.tsx`, the Subject/Body fields (`{(subject || body) && (...)}`) and the LinkedIn DM textarea (`{dmText && (...)}`) were conditionally rendered — they only appeared after a successful AI generation populated that state. Deleting `generate`/`generateDm` without changing anything else would have left nothing in the component that ever sets that state away from empty, making those fields **permanently unreachable** and silently breaking "Open in Mail," "Mark Sent," and the LinkedIn DM flow entirely — not just removing the AI-assist layer, but taking the whole panel down with it. Both conditionals were removed so the fields render unconditionally (empty, placeholder text, manually typable), with the associated action buttons disabled until there's content.

**Legitimate flows confirmed still working:**
- `tsc --noEmit` — clean, no type errors, after all edits.
- `npm run build` — succeeded; all 43 routes compiled, including `/admin/crm/leads/[id]` and `/admin/crm/queue`. One pre-existing warning about `@supabase/supabase-js` and the Edge Runtime appeared, unrelated to this change (present before it, not introduced by it).
- Manual send flow in `outreach-queue.tsx` (type a subject/body by hand → "Open in Mail" → "Mark Sent") and the LinkedIn DM flow (type a DM by hand → "Copy" / "Log Request") are both still reachable and functional after the conditional-rendering fix described above — this was verified by reading the resulting code path end to end, not just by the build succeeding.
- Every other feature in `lead-detail.tsx` (status changes, inline field edits, notes, LinkedIn request logging, activity timeline) and `outreach-queue.tsx` (lead queue tabs, pin/skip, daily goal tracking) is untouched — the edits were scoped exactly to the generator UI and its supporting state/functions.

**Open follow-ups / caveats:**
- `components/crm/all-leads.tsx` shows as modified in `git status` — this is pre-existing, uncommitted work from before this remediation sequence started, not a side effect of this step. Flagging so it isn't mistaken for scope creep.
- This step did not touch billing/invoice logic or any file outside the three named CRM components and the env var, per instruction.
- The `is_admin()` hardcoded-email bypass and the unconfirmed `auth.users` signup-trigger check (both noted in the prior entry) remain open, queued separately.
- If AI-assisted email drafting is wanted again in the future, it should be rebuilt as a server action holding the Anthropic key server-side only — never re-added as a `NEXT_PUBLIC_*` variable.

---

## 2026-07-07 — Step 3a (partial): `vehicle_inspections` insert lets any user tag a row with someone else's `company_id`

**Finding addressed, and original severity:** High, finding #9 of the original 17-finding audit — one of two bugs originally scoped together as Step 3 (finding #2, the far more severe `vehicle_inspections` cross-tenant RLS bypass, is **not** part of this entry; see "deferred" below). The `insert_inspections` policy was `WITH CHECK (auth.uid() IS NOT NULL)` — it verified the caller was logged in, but never checked that the `company_id` on the row being inserted belonged to that caller. Any authenticated user could insert a `vehicle_inspections` row tagged with an arbitrary `company_id`, injecting a fabricated inspection into another company's queue.

**What changed:**
- Confirmed via `pg_policies` that the policy definition matched the audit finding exactly, unchanged since the original review.
- Traced every code path that inserts into `vehicle_inspections` to check what would break under a tightened check (`company_id = get_my_company_id()`):
  - `lib/usage-actions.ts`'s `initiateInspection` (normal logged-in staff flow) — already sets `company_id` from the caller's own auth context; unaffected.
  - `lib/usage-actions.ts`'s `initiateInspectionRequest` (main `/inspect/[token]` guest flow) — already uses the service-role admin client, bypassing this policy entirely; unaffected.
  - `lib/usage-actions.ts`'s `initiateFMCInspection` (`/fleet/inspect/[token]` guest dispatch flow) — **was** using the session-bound client, and depended on the weak `auth.uid() IS NOT NULL` check to succeed for an anonymous, profile-less guest session (which has no `company_id` via `get_my_company_id()`). Tightening the policy without changing this function would have broken FMC dispatch outright.
- Fixed that dependency first: `initiateFMCInspection` now uses `createAdminClient()` for its insert (and, as a mechanical consequence of reusing the same client variable, for its `fmc_inspection_requests` status update immediately after) — the same pattern `initiateInspectionRequest` already used correctly. `inspector_id` was deliberately **not** added to this insert — that's part of the deferred work below, not this fix.
- Migration handed off (this session has no direct database execution access) for the user to run in the Supabase SQL editor:
  ```sql
  DROP POLICY IF EXISTS insert_inspections ON public.vehicle_inspections;

  CREATE POLICY insert_inspections ON public.vehicle_inspections
    FOR INSERT TO public
    WITH CHECK (company_id = get_my_company_id());
  ```
- `tsc --noEmit` run after the `initiateFMCInspection` code change — clean, no errors.

**Why this closes the issue:** the policy now requires the inserted row's `company_id` to match the caller's own company, resolved server-side via `get_my_company_id()` rather than trusted from the insert payload. `OWNER_MASTER_BYPASS` and `inspection_isolation` (both `ALL` command, gated on `is_admin()`/`is_platform_owner()`) are separate permissive policies that already grant INSERT for platform owners regardless of `company_id` — since Postgres OR's permissive policies together, tightening `insert_inspections` doesn't reduce admin capability, it only removes the path available to ordinary authenticated non-admin users.

**Legitimate flows confirmed still working (verified by reading the actual code, not assumed):**
- `initiateInspection` (staff creating an inspection through the normal in-app dashboard) — sets `company_id` from the logged-in user's own context; matches `get_my_company_id()` by construction.
- `initiateInspectionRequest` (main guest-dispatch flow) — untouched, already on the admin client, never subject to this policy.
- `initiateFMCInspection` (FMC guest-dispatch flow) — now also on the admin client; no longer subject to this policy at all, so the tightened check cannot break it. `tsc --noEmit` confirms the change compiles; this specific flow's runtime behavior (a real anonymous session completing an FMC dispatch end-to-end) has not been manually exercised in this session — recommend a manual pass before considering this fully verified, alongside whatever verification pass is planned for the rest of Step 3.

**Deferred — Bug 1 of the original Step 3 scope, not touched by this entry:**
The other half of the original Step 3 prompt — fixing the `anonymous inspectors can manage inspections` policy (the far more severe cross-tenant bypass, audit finding #2, where any authenticated user with no `user_profiles` row gets full read/write on every company's inspections) — was investigated but **not fixed**, and is queued as its own separate step. The reason: the obvious fix (scope guest access to `inspector_id = auth.uid()`) was traced end-to-end against every guest-flow code path and found to break in three real, non-edge-case scenarios — not just look risky in theory:
1. `app/complete/[token]/page.tsx` — a "complete later" flow where staff pre-create the inspection and the guest never has a session that matches its `inspector_id`.
2. `/inspect/[token]/page.tsx`'s "Resume Inspection" path — reopening the same link after a dropped connection issues a fresh anonymous session (a new `auth.uid()` on every `signInAnonymously()` call without a persisted session), which won't match the `inspector_id` set by the original session.
3. The same page's "Start Fresh" path (`abandonInspection` on a stale in-progress row for the same VIN) and the wizard's shared Cancel button — both operate on a row that isn't necessarily "owned" by the current session's `auth.uid()` at all.

The underlying problem: for this domain, the thing that actually authorizes a guest's access is the **token** (`inspection_requests`/`fmc_inspection_requests`, already validated server-side wherever reads currently happen correctly), not the anonymous Supabase session's identity — an anonymous session is ephemeral and gets re-minted on reconnect, so `auth.uid()`-based row scoping is structurally the wrong mechanism here, not just a tuning problem. The likely correct direction: move the remaining session-bound guest-flow writes (`lib/offline-sync.ts`'s `updateInspectionOfflineAware`/`createInspectionOfflineAware`, `abandonInspection`, and the `vehicle_inspections` touches inside `completeInspection`/`completeFMCInspection`) onto the admin client with their own explicit server-side token/expiry/company check — the same pattern already used correctly by `initiateInspectionRequest`, `loadInspectionForResume`, `getInspectionRequestByToken`, and now `initiateFMCInspection`. That's a materially larger change than a policy tweak and needs its own scoped step rather than being folded into this one.

**Open follow-ups / caveats:**
- **Status: confirmed run.** Confirmed directly by the user in this session (originally confirmed at the time via "ran sql"; log updated to reflect this after a later audit found the confirmation hadn't been carried into this file).
- Bug 1 (above) was fully open at the time this entry was written — since resolved separately in Step 3b (see that entry for the guest-access redesign that closed it).
- The `is_admin()` hardcoded-email bypass and the unconfirmed `auth.users` signup-trigger check remain open, queued separately, as noted in earlier entries.

---

## 2026-07-07 — Step 3b: `vehicle_inspections` guest-access authorization redesign (closes Bug 1 / audit finding #2)

**Finding addressed, and original severity:** Critical — audit finding #2, the single worst finding in the original audit, deferred from Step 3a. The `anonymous inspectors can manage inspections` policy's `NOT EXISTS (SELECT 1 FROM user_profiles ...)` branch gave any authenticated user with no profile row — trivially obtained via Supabase's public `signInAnonymously()`, no token required — unrestricted SELECT/INSERT/UPDATE/DELETE on every company's `vehicle_inspections` rows.

**Why it couldn't just be dropped or narrowed to `inspector_id = auth.uid()`:** the guest-inspector flow (token-based dispatch links, completed via anonymous Supabase sessions) genuinely needs some way for an unauthenticated-but-token-holding person to read/write their own inspection. The obvious narrowing — scope guest RLS access to `inspector_id = auth.uid()` — was designed, then traced end-to-end against every real guest code path (not just checked for plausibility) and found to break three non-edge-case flows: `/complete/[token]` (staff pre-creates the inspection; the guest's session was never the one that set `inspector_id`), `/inspect/[token]`'s "Resume Inspection" after a dropped connection (a fresh `signInAnonymously()` call issues a new `auth.uid()` each time, unrelated to whichever session originally created the row), and the same page's "Start Fresh" / the wizard's shared Cancel button (both act on a row that isn't necessarily "owned" by the current session at all). The underlying issue: for this domain, what actually authorizes a guest is the **validated dispatch token**, not the ephemeral anonymous session's identity. Full detail on this trace is in the prior Step 3a entry.

**What changed — new authorization module:**

New file `lib/inspection-auth.ts` (`'use server'`), exporting:
- `authorizeInspectionAccess(inspectionId)` — looks up the row's own `company_id` via the admin client, then returns authorized if the caller is (a) a staff member whose own `user_profiles.company_id` matches, or (b) holds a live, non-expired dispatch token (`inspection_requests.report_id` or `fmc_inspection_requests.report_id`) specifically linked to this `inspection_id`, or (c) is a platform owner/admin (via `is_admin()`/`is_platform_owner()`, called through `.rpc()` — confirmed both are `EXECUTE`-granted to the `authenticated` role before relying on this). Checks are ordered company-match → guest-token → admin RPCs specifically to minimize round trips for the common guest case, since a guest session never satisfies the RPC checks and the offline-sync catch-up loop (a field inspector reconnecting after a dropped connection, replaying several queued step-saves) pays for every round trip on a connection that's already unreliable.
- `updateInspectionSecure(inspectionId, data)` — the one authorized write path for step saves, callable directly from client code as a server action (the admin client can't run in the browser).

Every function that previously touched `vehicle_inspections` via the session-bound client in a guest-reachable context now goes through this module and the admin client instead:
- `lib/offline-sync.ts` — `updateInspectionOfflineAware` and the sync loop in `syncOfflineInspections` now call `updateInspectionSecure` instead of writing directly. `createInspectionOfflineAware` was deliberately left untouched — confirmed to have zero callers anywhere in the codebase, dead code, explicitly out of scope for this step.
- `lib/usage-actions.ts` — `abandonInspection`, `completeInspection`, and `completeFMCInspection` now call `authorizeInspectionAccess` first and use the admin client. `initiateInspectionRequest` now also persists `report_id: inspection.id` onto the `inspection_requests` row at creation time (previously only `used_at` was set) — required so the guest-token check has something to match against for the main dispatch flow, the same way `initiateFMCInspection` (fixed in Step 3a) already persists `report_id` onto `fmc_inspection_requests`.
- `lib/inspection-server-actions.ts` — `saveReportUrlAction` (found during the re-verified Step 1 trace — it wasn't in the original scope list; the wizard calls it unconditionally after PDF generation, in both staff and guest flows) now goes through the same check.
- `lib/storage-actions.ts` — **no change.** Originally believed to need one (a company-level check on a cross-inspection read for check-out condition-delta calculations), but re-verifying the exact call graph before writing the diff found this was a misattribution: that read lives inside `updateVehicleLifecycleStatus`, a function with zero callers anywhere in the codebase, not inside `upsertVehicleToInventory` (which is guest-reachable but only ever touches `storage_vehicles`, never `vehicle_inspections`). Correcting this in the log explicitly since it was stated as a real finding earlier in this same step before being disproven — the `authorizeCompanyAccess` helper originally built for this case was removed from `inspection-auth.ts` before shipping, since it would otherwise have been unused, speculative code.

**Schema assumptions — all verified against live `information_schema`/`pg_proc`/`pg_class` output before writing any code, not inferred from application code:**
- `is_admin()`/`is_platform_owner()` are `EXECUTE`-granted to `authenticated` (and, incidentally, `anon` — not a problem for this design since a guest session never reaches those calls before the ordering described above, but worth knowing).
- `inspection_requests` has no `inspection_id` column — the correct linking column is `report_id` (confirmed via `information_schema.columns`). The original design assumed `inspection_id`; corrected before shipping.
- `fmc_inspection_requests` is a genuinely separate physical table from `inspection_requests` (`pg_class.relkind = 'r'` for both, not a view), and scopes by `fmc_account_id`, not `company_id` — confirmed via its own column list before finalizing `hasValidGuestToken`'s FMC branch.

**RLS migration (confirmed run — see "Status" note in Open follow-ups below):**
```sql
DROP POLICY IF EXISTS "anonymous inspectors can manage inspections" ON public.vehicle_inspections;
DROP POLICY IF EXISTS "anon_select_own_inspection" ON public.vehicle_inspections;
DROP POLICY IF EXISTS "anon_update_own_inspection" ON public.vehicle_inspections;
```
No replacement guest policy is added — nothing session-bound touches this table for guest access anymore, so RLS reverts to just the already-correct `OWNER_MASTER_BYPASS`, `Team_Select`, `inspection_isolation`, and Step 3a's fixed `insert_inspections` (confirmed run — see that entry's updated status).

**Deploy ordering — corrects an assumption in the original Step 3b scoping prompt, which expected either ordering to be equally risky:** code must deploy **before** the migration runs, not simultaneously and not in either order. New code works correctly regardless of whether the old bypass policies still exist (the admin client bypasses RLS either way) — a gap here only means the vulnerability stays open slightly longer, not a functional break. The reverse order breaks immediately: if the policies are dropped while the *old* code is still live, every in-progress guest inspection loses its only path to read/write its own row (the old code still uses the session-bound client, which depended entirely on those policies), breaking step saves, resume, cancel, and completion with no fix yet deployed. Migration should be run promptly once the code deploy is confirmed live — not delayed, since every extra minute is exposure to the worst finding in the audit.

**Testing:** per explicit instruction, the six-scenario staging test plan for this step (fresh start, resume-after-disconnect, start-fresh-on-stale-VIN, cancel, `/complete/[token]`, expired-token-rejection) was written but **not run** — testing for this step is deferred to one consolidated pass at the end of the full remediation sequence, not gated per-step. `tsc --noEmit` and `npm run build` both pass clean on the full change set; that is the only verification performed in this session.

**Open follow-ups / caveats:**
- **Not yet tested end-to-end.** This is a materially larger change than most steps in this sequence (7 files, a new authorization module, two schema-verification round trips that each changed the design). It touches live inspection workflows field inspectors depend on. Treat as unverified until the consolidated test pass runs all six scenarios.
- **Status: confirmed run.** Confirmed directly by the user in this session, same as Step 3a/Step 3.5 (originally confirmed at the time; log updated after a later audit found the confirmation hadn't been carried into this file). This is migration-run status only — the "not yet tested end-to-end" caveat above is a separate, still-accurate statement about functional testing, not migration application.
- Noticed but deliberately **not fixed**, to avoid further scope creep in an already-large step: `completeFMCInspection` writes `completed_at` to `fmc_inspection_requests` — a column that, per the verified schema, does not exist on that table. This write has almost certainly been silently failing (Postgres would reject the unknown column; this specific call's result isn't checked). Separate from — and smaller in impact than — the two frontend bugs fixed below, since `status: 'completed'` is set correctly in the same call and is what every read path actually checks. Flagging for a future, separate fix.
- The `is_admin()` hardcoded-email bypass and the unconfirmed `auth.users` signup-trigger check remain open, queued separately, as noted in earlier entries.

---

## 2026-07-07 — Pre-existing production bugs found incidentally during Step 3b (not security findings)

**Not part of the vulnerability being remediated in this sequence.** These were discovered while tracing guest-flow code paths for the Step 3b authorization redesign, and were fixed only because two of the six staging test scenarios written for that step needed working flows to validate against — a broken flow can't demonstrate whether an authorization fix works. Both predate this remediation sequence entirely. Per current understanding, FMC/dispatch-style guest flows are not in active customer use, so no customers are believed to have been affected by either.

1. **`app/complete/[token]/page.tsx` read a column that doesn't exist.** Its `InspectionRequest` TypeScript interface declared `inspection_id: string`, and the page rendered `<InspectionWizard inspectionId={request.inspection_id} ... />`. The actual column on `inspection_requests` (confirmed via live schema query) is `report_id` — `inspection_id` was never a real column. At runtime this meant `request.inspection_id` was always `undefined`, so the wizard was rendered with no valid inspection ID. The "staff pre-creates, guest completes later" flow was, as far as can be determined from the code, non-functional. **Fix:** interface field and the prop reference both changed from `inspection_id` to `report_id`.

2. **`app/fleet/inspect/[token]/page.tsx` read a column that doesn't exist.** Its `FMCRequest` interface declared `company_id: string`, used throughout — passed as `companyId` into `initiateFMCInspection`, as `fmcAccountId` into `completeFMCInspection`, into `checkUsageState`, and into `createFakeAuthContext`. The actual scoping column on `fmc_inspection_requests` (confirmed via live schema query) is `fmc_account_id` — there is no `company_id` column on this table. At runtime `request.company_id` was always `undefined`, meaning `initiateFMCInspection` was being called with `companyId: undefined` on every FMC dispatch attempt; since `vehicle_inspections.company_id` is expected to be required, this flow was, as far as can be determined from the code, unable to successfully create an inspection at all. **Fix:** interface field and all four usages changed from `company_id`/`request.company_id` to `fmc_account_id`/`request.fmc_account_id`. (The same interface also declares an unused `completed_at?: string` field that doesn't exist on the table either — left untouched, since the completion check reads `status === 'completed'` first in an `||` and that column does exist and is set correctly, so this particular inaccuracy is dead code, not a functional bug.)

**Why these are logged separately:** both are data-plumbing bugs (reading a field name that was never a real column), not authorization or access-control defects, and neither one grants or withholds access incorrectly — they just mean the affected flows didn't work at all. Keeping them out of the Step 3b security narrative so that entry accurately reflects only the vulnerability and its fix.

---

## 2026-07-07 — Backlog (unrelated to this security sequence): `storage_vehicles` writes silently fail for guest sessions

**Not investigated as part of, and explicitly out of scope for, this remediation sequence.** Found incidentally while verifying the Step 3b design (see that entry's note on the corrected `lib/storage-actions.ts` finding).

`upsertVehicleToInventory` (`lib/storage-actions.ts`), called from `InspectionWizard.handleComplete` in both staff and guest flows, performs `storage_vehicles` reads/writes via the session-bound client and never checks the returned `error` on any of them. `storage_vehicles`' only RLS policy is `company_id = my_company_id()`, with no admin-bypass. For a profile-less guest session, `my_company_id()` resolves to `NULL`, so every read and write in this function is silently rejected by RLS — Supabase-js returns `{ data: null, error }` rather than throwing, and since `error` is never inspected here, the function just returns `undefined` and its caller's `if (vehicleId) {...}` block is skipped. No crash, no visible error, no log line.

**Likely practical effect:** guest-completed inspections (via `/inspect/[token]` or `/fleet/inspect/[token]`) probably never actually create or update a `storage_vehicles` inventory row, silently, in production today. This is independent of the RLS bypass being closed in Step 3b — it existed before that work and isn't fixed by it (this function isn't part of the guest-access redesign; it never touches `vehicle_inspections`, only `storage_vehicles`).

**Recommendation:** scope as its own small, separate fix — likely either checking the returned errors and surfacing/logging them, or (better, for consistency with the Step 3b pattern) moving this function's writes through an authorized admin-client path the same way. Not addressed here.

---

## 2026-07-07 — Step 2.5: removed hardcoded email bypass from `is_admin()`

**Finding addressed, and original severity:** Low/architectural (flagged during the Step 1 function-body review, not independently exploitable by an arbitrary attacker — see that entry). `is_admin()` contained `LOWER(auth.jwt() ->> 'email') = 'tysonwhitebusiness@gmail.com'` as an `OR` branch alongside the real `role = 'owner'` check. This meant there were two separate, inconsistent sources of truth for platform-owner authority: a database column (`user_profiles.role`, visible and manageable) and a hardcoded literal buried inside a `SECURITY DEFINER` function body (invisible to anyone reviewing `user_profiles`, and revocable only by editing the function directly — no admin UI, no audit trail).

**Why this was safe to do now, but not necessarily earlier:** relying solely on `user_profiles.role = 'owner'` is only safe because the Step 3 emergency fix (`guard_user_profiles_privilege_columns` trigger) already closed the self-service path that would have let any authenticated user grant themselves `role = 'owner'` directly. Before that trigger existed, consolidating down to the role column alone would have meant the hardcoded email was the *only* thing standing between "any signed-up user" and full admin access via `is_admin()` — collapsing it earlier would have been a regression, not a fix.

**What changed:**
- Confirmed live `is_admin()` definition matched what Step 1 originally captured — no drift.
- Confirmed via `user_profiles` (queried by email, since the SQL editor runs as `postgres` with no `auth.uid()` context — `auth.uid()`-based lookups return no rows there, which is expected and not itself a finding) that the account behind the hardcoded email has `role = 'owner'`, so removing the email fallback would not lock out platform-owner access.
- Checked how many RLS policies reference each function by name before deciding whether to alias or consolidate: `is_admin()` — 3 policies (`billed_inspections`, `companies`, `vehicle_inspections`, all the `OWNER_MASTER_BYPASS` pattern). `is_platform_owner()` — 9 policies across 6 tables, plus the `guard_user_profiles_privilege_columns` trigger, which calls both functions directly by name. Given the lopsided usage, chose to keep `is_admin()` as a thin alias rather than rewrite the 3 `OWNER_MASTER_BYPASS` policies to call `is_platform_owner()` directly — editing one function body is a single atomic change with no window where a table is under-protected mid-migration, versus dropping and recreating 3 RLS policies for a purely cosmetic consolidation that would leave the two functions byte-for-byte identical either way.
- Migration run by the user in the Supabase SQL editor:
  ```sql
  CREATE OR REPLACE FUNCTION public.is_platform_owner()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $function$
  BEGIN
    RETURN EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
      AND role = 'owner'
    );
  END;
  $function$;

  CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $function$
  BEGIN
    RETURN public.is_platform_owner();
  END;
  $function$;
  ```
  `is_platform_owner()`'s underlying logic is unchanged — only `SET search_path = public` was added, the same hardening already applied to `guard_user_profiles_privilege_columns` in the emergency-fix step (standard practice for `SECURITY DEFINER` functions, guards against a theoretical search-path hijack). Folded into this same migration rather than split into a separate step, per instruction.

**Why this closes the issue:** `is_admin()` no longer has any authority source independent of `user_profiles.role`. There is now exactly one place platform-owner status is determined (`is_platform_owner()`'s `role = 'owner'` check), and `is_admin()` is purely a name that resolves to it — removing the invisible, UI-unmanageable bypass without changing behavior for the one account that legitimately needs owner access, and without touching any of the 12 policy references or the trigger that depend on these two function names continuing to exist and behave as before.

**Legitimate flows confirmed still working:**
- All 3 `OWNER_MASTER_BYPASS` policies and all 9 `is_platform_owner()`-referencing policies are untouched — same function names, same signatures, same return semantics, only the function bodies changed.
- `guard_user_profiles_privilege_columns` (the emergency-fix trigger) calls both `is_admin()` and `is_platform_owner()` by name — both still resolve, and since `is_admin()` now just delegates to `is_platform_owner()`, the trigger's `OR` condition is unaffected (redundant now rather than broken).
- Confirmed via live query, before running anything, that the one account relying on the email fallback has `role = 'owner'` and so retains admin access through the surviving path.

**Open follow-ups / caveats:**
- No code outside these two function bodies was touched, per the stated scope of this step.
- The unconfirmed `auth.users` signup-trigger check (noted in the original emergency-fix entry) remains open, still queued separately.
- This closes out the last item from the original Step 1 function-body review — `get_my_company_id()`, `my_company_id()`, and `is_platform_owner()` were already confirmed safe as-is; `is_admin()`'s hardcoded-email branch was the only outstanding item from that review, and is now resolved.

**Status: confirmed complete.** Independently re-verified directly against the live database after the fact (separately from the original "ran sql, proceed" confirmation at the time of this step) — `is_admin()` and `is_platform_owner()` both match this migration exactly: alias applied, `SET search_path = public` present on both, hardcoded email fully gone. No open question remains on whether this migration was actually applied.

---

## 2026-07-07 — Step 3.5: feature-flag self-grant closed (audit finding #7)

**Finding addressed, and original severity:** Critical, finding #7 of the original 17-finding audit, a direct revenue-integrity bug. `company_feature_flags`' RLS (`feature_flags_all`, `feature_flags_select`) was gated only by `auth.role() = 'authenticated'` — no company scoping, no admin distinction. `upsertFeatureFlag(companyId, featureKey, enabled, config)` — a `'use server'` action intended only for the super-admin customer-detail panel — had no authorization check of its own and relied entirely on that broken policy. Any logged-in customer could call `upsertFeatureFlag(myCompanyId, 'lot_map', true, {})` (or `lot_billing`, `white_label`, `dispatch`) directly and permanently enable any paid add-on for free, or do the same against another company's id.

**What changed:**
- Confirmed the live policy definitions matched the original audit exactly — no drift.
- Before proposing a fix, confirmed via code (not assumption) that normal, non-admin customers genuinely need read access to their own company's flags: `getFeatureFlags()` is called from `app/(app)/lot/page.tsx` (gates the Lot Map UI), `lib/billing-actions.ts`, `lib/branding-actions.ts`, and a shared client hook (`hooks/use-feature-flag.ts`) — all ordinary in-app pages, not the admin panel. This ruled out an admin-only-read design; the fix needed to keep reads open to a company's own row while locking down writes.
- Confirmed via repo-wide search that `upsertFeatureFlag` is the **only** application code path that writes to `company_feature_flags` (the only other reference, `scripts/seed-qa-account.ts`, uses the service-role client directly and isn't subject to RLS at all) — this is what made it safe to make writes fully owner-only with no other legitimate caller to accommodate.
- **RLS migration** (confirmed run — see "Status" note in Open follow-ups below):
  ```sql
  DROP POLICY IF EXISTS feature_flags_all ON public.company_feature_flags;
  DROP POLICY IF EXISTS feature_flags_select ON public.company_feature_flags;

  CREATE POLICY company_feature_flags_select ON public.company_feature_flags
    FOR SELECT TO public
    USING (company_id = get_my_company_id() OR is_platform_owner());

  CREATE POLICY company_feature_flags_owner_write ON public.company_feature_flags
    FOR ALL TO public
    USING (is_platform_owner())
    WITH CHECK (is_platform_owner());
  ```
  The SELECT policy's `OR is_platform_owner()` is required, not incidental: `admin-customer-detail.tsx` calls `getFeatureFlags(companyId)` for whichever customer the admin is currently viewing — essentially never the admin's own `company_id` — so without that clause the admin panel's own flag display would break.
- **Code change**, `lib/feature-flags.ts`'s `upsertFeatureFlag`:
  ```diff
     const supabase = createClient()
  +  const { data: isOwner } = await supabase.rpc('is_platform_owner')
  +  if (!isOwner) throw new Error('Not authorized to modify feature flags')
  +
     const { error } = await supabase
       .from('company_feature_flags')
  ```
  Reuses `is_platform_owner()` via `.rpc()` — the same pattern established in Step 3b's `authorizeInspectionAccess`, and confirmed safe to call this way back in Step 2.5's grant check (`EXECUTE` confirmed granted to `authenticated`). Used `is_platform_owner()` directly rather than the `is_admin()` alias, since it's the actual source of truth. `tsc --noEmit` passes clean on this change.

**Why this closes the issue:** both layers independently block the exploit now. The in-function check rejects a non-admin caller before any Supabase call is even made, regardless of RLS state. The RLS policy independently rejects any write from a non-owner session, regardless of whether the calling code remembered to check first. Neither depends on the other to be effective — a defense-in-depth improvement over Step 3b's design, where the code layer and RLS layer were sequentially dependent (admin client entirely replacing RLS enforcement) rather than each independently sufficient.

**Deploy ordering — checked explicitly, not assumed, per the standing instruction to verify this every time rather than default to "probably fine":** confirmed safe in either order, including simultaneous deploy — a genuine contrast with Step 3b, not a repeat of the same conclusion by default. `upsertFeatureFlag` has exactly one real caller, the admin customer-detail panel, always invoked from a genuine platform-owner session. That session satisfies `is_platform_owner()` under the old code and the new code, and under the old RLS and the new RLS — so the legitimate flow can't be broken by either ordering. Walked both directions: code-first closes the "call our own server action directly" exploit immediately (the new in-function check rejects it before any RLS is even consulted), leaving only a narrower gap where a non-admin could still hit the table via a raw Supabase client call until the migration also lands; migration-first closes that same exploit via RLS alone, since the still-old code has no check but RLS now rejects the write outright for non-owners. Unlike Step 3b, there's no guest/anonymous-session code path here that depends on old RLS behavior the new code stops providing — both callers (admin, via both layers) and non-callers (rejected by both layers) behave consistently regardless of which piece ships first.

**Legitimate flows confirmed still working:**
- `admin-customer-detail.tsx`'s flag-toggle UI — the admin's session satisfies `is_platform_owner()` in both the new RLS write policy and the new in-function check.
- `getFeatureFlags()`'s four call sites (`app/(app)/lot/page.tsx`, `lib/billing-actions.ts`, `lib/branding-actions.ts`, `hooks/use-feature-flag.ts`) — all read a company's own flags, covered by the new SELECT policy's `company_id = get_my_company_id()` branch; the admin panel's cross-company reads are covered by the same policy's `is_platform_owner()` branch.

**Open follow-ups / caveats:**
- **Status: confirmed run.** Confirmed directly by the user in this session (originally confirmed at the time via "ran sql"; log updated to reflect this after a later audit found the confirmation hadn't been carried into this file). The code change was written and passes `tsc --noEmit`; not independently tested at runtime — testing remains deferred to the end-of-sequence pass.
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction — not run here.
- This closes audit finding #7. Per the original remediation game plan, findings #10/#8 (inspection photos — RLS + storage bucket together) and #5 (admin-actions server-side checks) remain the next items in the queue, along with the still-open Step 3b end-to-end test pass.

---

## 2026-07-07 — Step 4: broad "authenticated" RLS pattern closed on nine tables (audit finding #3)

**Finding addressed, and original severity:** Critical, finding #3 of the original 17-finding audit — the same root cause already closed for `company_feature_flags` in Step 3.5, applied here to the remaining nine tables: `inspection_audit_log`, `inspection_snapshots`, `inspection_custody`, `inspection_queue` (four of its five policies), and five `crm_*` tables (`crm_leads`, `crm_notes`, `crm_activity_log`, `crm_daily_goals`, `crm_email_touches`). Each had at least one policy gated only by `auth.role() = 'authenticated'` — true for any logged-in user regardless of company — which either provided zero real scoping (the three `inspection_*` tables, `crm_*`) or, per Postgres OR-ing permissive policies together, silently overrode a correctly-scoped policy sitting right next to it (`inspection_queue`'s `queue_select`/`update`/`delete`/`insert` overriding the already-correct `queue_isolation`).

**What changed, per table — confirmed against live schema and code before proposing anything, not assumed from the original audit snapshot:**

- **`inspection_audit_log`, `inspection_snapshots`** — both confirmed via repo-wide search to be entirely unused by any application code today. Neither has a `company_id` column, so correct scoping requires a join through `vehicle_inspections`, matching the pattern `damage_reports` already used correctly. Replaced their broad `authenticated`-only policies with a single `ALL` policy each:
  ```sql
  CREATE POLICY inspection_audit_log_isolation ON public.inspection_audit_log
    FOR ALL TO public
    USING (EXISTS (SELECT 1 FROM vehicle_inspections
      WHERE vehicle_inspections.id = inspection_audit_log.inspection_id
        AND (vehicle_inspections.company_id = get_my_company_id() OR is_platform_owner())));
  -- (same shape for inspection_snapshots)
  ```
  Since both are unused today, this carries no functional risk.

- **`inspection_custody`** — same missing-`company_id`, join-required situation, but **actively written** by `lib/chain-of-custody.ts`'s `buildCustodyRecord`, called from `InspectionWizard.handleComplete` — the same shared completion path guest sessions use (the exact code Step 3b spent most of its effort re-authorizing). A join-based policy alone would have broken guest custody writes the same way the pre-Step-3b `inspector_id = auth.uid()` design broke guest inspection writes, since a profile-less guest session satisfies neither `company_id = get_my_company_id()` nor `is_platform_owner()`. Fixed with the same policy shape as above, **plus** a code change reusing Step 3b's infrastructure:
  - New export in `lib/inspection-auth.ts`, `upsertCustodyRecordSecure(inspectionId, data)` — calls the existing `authorizeInspectionAccess` (unchanged), then writes via the admin client.
  - `lib/chain-of-custody.ts`'s `buildCustodyRecord` now calls `upsertCustodyRecordSecure` instead of writing directly via the browser client; the now-unused `createClient` import was removed.
  - Noticed but deliberately **not fixed**, per instruction: `buildCustodyRecord` writes a `completed_at` field, but the actual column (confirmed via live schema) is `signed_at` — this write has likely been silently failing already, independent of this fix. Left alone, same treatment as the analogous `fmc_inspection_requests.completed_at` issue found in Step 3b.

- **`inspection_queue`** — confirmed via code (`components/queue/queue-page.tsx`, `components/dashboard/dashboard.tsx`, both staff-only, no guest reachability) that every current read already explicitly filters by `company_id` in the application query itself, and the one insert sets `company_id` explicitly — nothing depends on the broader policies beyond what `queue_isolation` (already correctly scoped, untouched) provides. Simply dropped `queue_select`, `queue_insert`, `queue_update`, `queue_delete`; no replacement needed.

- **`crm_leads`, `crm_notes`, `crm_activity_log`, `crm_daily_goals`, `crm_email_touches`** — confirmed via full column listings that none of the five tables has any per-user column (no `created_by`/`assigned_to`/`owner_id` anywhere), and via `lib/crm-actions.ts` that no query filters by one either — genuinely shared, internal-only data with no per-user split, as the audit anticipated. Replaced each `"owner only crm_*"` policy with an admin-only equivalent using `is_platform_owner()`, exactly as specified:
  ```sql
  CREATE POLICY crm_leads_admin_only ON public.crm_leads FOR ALL TO public USING (is_platform_owner());
  -- (same shape for the other four tables)
  ```

**Migration (confirmed run — see "Status" note in Open follow-ups below):**
```sql
DROP POLICY IF EXISTS audit_select ON public.inspection_audit_log;
DROP POLICY IF EXISTS audit_insert ON public.inspection_audit_log;
CREATE POLICY inspection_audit_log_isolation ON public.inspection_audit_log
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM vehicle_inspections
    WHERE vehicle_inspections.id = inspection_audit_log.inspection_id
      AND (vehicle_inspections.company_id = get_my_company_id() OR is_platform_owner())));

DROP POLICY IF EXISTS snapshots_select ON public.inspection_snapshots;
DROP POLICY IF EXISTS snapshots_insert ON public.inspection_snapshots;
CREATE POLICY inspection_snapshots_isolation ON public.inspection_snapshots
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM vehicle_inspections
    WHERE vehicle_inspections.id = inspection_snapshots.inspection_id
      AND (vehicle_inspections.company_id = get_my_company_id() OR is_platform_owner())));

DROP POLICY IF EXISTS custody_all ON public.inspection_custody;
CREATE POLICY inspection_custody_isolation ON public.inspection_custody
  FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM vehicle_inspections
    WHERE vehicle_inspections.id = inspection_custody.inspection_id
      AND (vehicle_inspections.company_id = get_my_company_id() OR is_platform_owner())));

DROP POLICY IF EXISTS queue_select ON public.inspection_queue;
DROP POLICY IF EXISTS queue_insert ON public.inspection_queue;
DROP POLICY IF EXISTS queue_update ON public.inspection_queue;
DROP POLICY IF EXISTS queue_delete ON public.inspection_queue;

DROP POLICY IF EXISTS "owner only crm_leads" ON public.crm_leads;
CREATE POLICY crm_leads_admin_only ON public.crm_leads FOR ALL TO public USING (is_platform_owner());
DROP POLICY IF EXISTS "owner only crm_notes" ON public.crm_notes;
CREATE POLICY crm_notes_admin_only ON public.crm_notes FOR ALL TO public USING (is_platform_owner());
DROP POLICY IF EXISTS "owner only crm_activity_log" ON public.crm_activity_log;
CREATE POLICY crm_activity_log_admin_only ON public.crm_activity_log FOR ALL TO public USING (is_platform_owner());
DROP POLICY IF EXISTS "owner only crm_daily_goals" ON public.crm_daily_goals;
CREATE POLICY crm_daily_goals_admin_only ON public.crm_daily_goals FOR ALL TO public USING (is_platform_owner());
DROP POLICY IF EXISTS "owner only crm_email_touches" ON public.crm_email_touches;
CREATE POLICY crm_email_touches_admin_only ON public.crm_email_touches FOR ALL TO public USING (is_platform_owner());
```

**Why this closes the issue:** every broad `auth.role() = 'authenticated'` policy across all nine tables is gone, replaced with either direct company scoping (`inspection_queue`, already present via `queue_isolation`), join-based company scoping through the owning inspection (`inspection_audit_log`, `inspection_snapshots`, `inspection_custody`), or admin-only access (`crm_*`, where no per-user or per-company concept exists in the schema). No table in this batch retains a policy that grants access based solely on being logged in.

**Legitimate flows confirmed still working:**
- `tsc --noEmit` and `npm run build` both pass clean on the `inspection-auth.ts`/`chain-of-custody.ts` code change.
- `inspection_queue`'s staff-only read/write flows (`queue-page.tsx`, `dashboard.tsx`) — confirmed by code that nothing depends on the dropped policies beyond what `queue_isolation` already provides.
- Guest-flow custody writes (`buildCustodyRecord` → `upsertCustodyRecordSecure` → `authorizeInspectionAccess`) — reuses Step 3b's already-built and reasoned-through authorization logic verbatim; not re-verified independently in this step beyond confirming the new code compiles.
- `inspection_audit_log`, `inspection_snapshots` — no current caller to break.
- `crm_*` admin flows — not independently re-verified at runtime in this step; relies on `is_platform_owner()` behaving as already established in Step 2.5/Step 3.5.

**Open follow-ups / caveats:**
- **Status: confirmed run.** Independently re-verified directly against the live database (not just relayed from an earlier "ran it" message): queried `pg_policies` and confirmed `inspection_audit_log_isolation`, `inspection_snapshots_isolation`, `inspection_custody_isolation`, and `crm_leads_admin_only` are all present, and `inspection_queue` now shows only `queue_isolation` with the four broad `queue_select`/`insert`/`update`/`delete` policies gone — the exact expected end-state. The `inspection_custody` policy's dependency on the code change already being live is satisfied — that code was written and confirmed `tsc --noEmit` clean in this same step.
- `buildCustodyRecord`'s `completed_at`/`signed_at` column-name bug (found here) was deliberately left unfixed, per instruction.
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction — not run here.
- A `role` vs. `platform_role` scoping inconsistency was found while designing the `crm_*` fix — logged separately below as its own backlog item, not part of this fix.
- Per the original remediation game plan, findings #10/#8 (inspection photos) and #5 (admin-actions server-side checks) remain the next items in the queue, along with the still-open Step 3b end-to-end test pass.

---

## 2026-07-07 — Backlog (architectural, not a current vulnerability): `is_platform_owner()` checks `role`, but admin-panel access is gated by a different column, `platform_role`

**Not a current vulnerability — logged as a future architectural cleanup item, not part of any fix in this sequence.** Found while designing Step 4's admin-only policy for the five `crm_*` tables.

`is_platform_owner()` (and, since Step 2.5, `is_admin()` as its alias) checks `user_profiles.role = 'owner'`. Separately, `/admin/*` page-level access — including the `/admin/crm/*` pages that are the only real-world users of the five `crm_*` tables — is gated by `middleware.ts` checking a *different* column, `user_profiles.platform_role = 'super_admin'`. There's existing precedent elsewhere in this schema for scoping directly by `platform_role = 'super_admin'` instead of `role = 'owner'` (`account_notes`, `admin_activity_log` both do this).

**Today this makes no practical difference** — the one account that has `role = 'owner'` also has `platform_role = 'super_admin'` (confirmed in Step 2.5). But if the owner ever grants `platform_role = 'super_admin'` to a second person (e.g., a sales-ops hire who should manage the CRM) without also setting `role = 'owner'` on that account, that person would be able to load the `/admin/crm/*` pages past middleware, then have every actual data query silently rejected by the `is_platform_owner()`-gated RLS policies added in Step 4 (and by any other policy relying on `is_platform_owner()`/`is_admin()`).

**Recommendation:** decide on one consistent axis for "admin panel access" across the schema — either always check `platform_role = 'super_admin'` for panel-scoped data (matching how the pages themselves are gated), or formalize that `platform_role = 'super_admin'` should always imply `role = 'owner'` and enforce that invariant somewhere (e.g., the same kind of guard trigger used for `user_profiles` in the emergency-fix step). Not addressed here — this is a scoping-model decision, not a bug fix.

---

## 2026-07-07 — Step 5: `inspection_share_tokens` enumeration closed (audit finding #4)

**Finding addressed, and original severity:** Critical, finding #4 of the original 17-finding audit. The `"Public can read share tokens"` policy on `inspection_share_tokens` was `SELECT`, role `public`, `USING (true)` — unconditionally true for any query shape, not scoped to "look up one token you already know." Since the anon key and project URL are both necessarily public in the client bundle, anyone could run an unfiltered `select * from inspection_share_tokens` directly against the Supabase REST API and enumerate every share token for every company, then use each to pull that company's completed-inspection data through the public share link.

**What changed:** confirmed, before touching anything, that this was pure redundant exposure with zero legitimate dependency on it. Searched the codebase and found exactly two application touchpoints on this table:
- The write side (`lib/usage-actions.ts`'s `createShareToken`) — already correctly scoped via the separate `"Auth users can create share tokens"` policy, untouched by this fix.
- The read side — a single call site, `app/inspect/[token]/page.tsx:87`, invoking `supabase.rpc('get_inspection_by_share_token', { p_token: token })` directly from the browser, before any session exists (bare anon key, `role = anon`).

Rather than assume that RPC's safety, queried its actual definition:
```sql
CREATE OR REPLACE FUNCTION public.get_inspection_by_share_token(p_token text)
 RETURNS SETOF vehicle_inspections
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
    SELECT i.*
    FROM vehicle_inspections i
    JOIN inspection_share_tokens t ON t.inspection_id = i.id
    WHERE t.token = p_token AND t.expires_at > now();
END;
$function$
```
Confirmed `SECURITY DEFINER` — it runs with the function owner's privileges, bypassing RLS on both `inspection_share_tokens` and `vehicle_inspections` internally. Its own `WHERE t.token = p_token AND t.expires_at > now()` is the real access control, and it's correctly scoped (exact match, not expired). **This function never depended on the broad table policy at all** — it was safe on its own the whole time; the policy was purely redundant exposure sitting next to it.

**Migration run (by the user directly, confirmed success):**
```sql
DROP POLICY IF EXISTS "Public can read share tokens" ON public.inspection_share_tokens;
```
No code changes were needed or made — nothing in the application depended on this policy existing.

**Why this closes the issue:** direct `SELECT` against `inspection_share_tokens` by anyone other than a company managing its own tokens (`company_own_share_tokens`, unchanged) now default-denies, the same posture as `role_permissions`/`system_broadcasts`. The enumeration path (raw REST query against the table) is gone. The legitimate share-link flow is unaffected, since it was never routed through the dropped policy.

**Legitimate flows confirmed still working:** `get_inspection_by_share_token`'s `SECURITY DEFINER` status means it's structurally unaffected by this change — not independently re-tested at runtime in this step (testing deferred to the end-of-sequence pass), but there is no mechanism by which dropping this policy could change this function's behavior.

**Minor, non-blocking note for future context (not a separate backlog item):** `get_inspection_by_share_token` returns `SETOF vehicle_inspections` via `SELECT i.*` — the full row, every column, not a trimmed view. Unrelated to the enumeration vulnerability this step closes, and not proposed as a fix here, but worth knowing if a future step ever audits what a public share link actually exposes.

**Open follow-ups / caveats:**
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction — not run here.
- This closes audit finding #4. Per the original remediation game plan, findings #10/#8 (inspection photos — RLS + storage bucket together) and #5 (admin-actions server-side checks) remain the next items in the queue, along with the still-open Step 3b end-to-end test pass. (Note added in a later pass: the Step 3.5 migration confirmation referenced here at the time of writing has since been confirmed run.)

---

## 2026-07-07 — Step 6: `inspection_photos` table + `inspection-photos` storage bucket locked down (audit findings #8/#10)

**Finding addressed, and original severity:** Critical, findings #8/#10 of the original 17-finding audit, originally scoped together as "the one with reputational/legal exposure beyond data leakage" (arbitrary anonymous file hosting under the app's domain). Two bugs on the same feature:
- **Table:** `inspection_photos` had `anon_photo_record_insert` (role `anon`, `INSERT`, `WITH CHECK (true)`) — a fully unauthenticated caller could insert a row pointing at any `inspection_id`, no ownership check.
- **Bucket:** `inspection-photos` was `public: true`, `file_size_limit: null`, `allowed_mime_types: null`, with `"Public can read photos"` and `anon_photo_upload` both scoped only to `bucket_id = 'inspection-photos'` — no path/company/inspection scoping at all. Anyone could list and fetch every company's vehicle photos, and anyone could anonymously upload arbitrary files of any size or type.

**The scoping originally planned for this step turned out to be unnecessary — this is the main thing worth recording here.** The prompt for this step anticipated the same guest-flow-safe rearchitecture used in Step 3b and Step 4's `inspection_custody` fix (route uploads through `authorizeInspectionAccess`, worry about deploy ordering, preserve a live guest upload path). Before proposing anything, traced actual usage and found **the `inspection-photos` bucket and `inspection_photos` table are both entirely unused by the current application** — zero references anywhere in application code, to either name, in any form. The real photo-capture flow (`components/ui/camera-capture.tsx`, via `canvas.toDataURL('image/jpeg', 0.88)` and `FileReader`) produces base64 `data:image/...` strings that get embedded directly in `vehicle_inspections`' JSONB step-data columns and persisted through the already-fixed Step 3b pathway (`updateInspectionSecure`) — never touching Supabase Storage at all. `lib/chain-of-custody.ts`'s `collectPhotoHashes` hashes these same embedded strings (`value.startsWith('data:image')`), confirming the same conclusion from a second angle. The project's own `qa/test-checklist.md` independently corroborates this: `"Photos section (if present) shows captured inspection photos — NOT TESTED"`.

This meant Step 6 ended up structurally closer to **Step 5's shape (drop the dangerous policies, no code to preserve, no guest-flow risk) than to Step 4's `inspection_custody` case** — the added complexity anticipated in the original prompt wasn't needed once usage was actually traced, rather than assumed from the audit description alone.

**What changed:** re-confirmed live policy state on both the table and `storage.objects` (for this bucket) before finalizing, per the standing practice of not trusting the original audit snapshot. Found the table had one correctly-scoped policy already in place (`"Users can insert photo records for their inspections"`, ties an insert to a specific inspection via `vehicle_inspections.inspector_id = auth.uid()`) plus the properly company-scoped `inspection_photo_isolation` (`ALL`, join-based) — neither needed to change, only `anon_photo_record_insert` did. On the bucket side, found all four existing `storage.objects` policies were actually unscoped (including `"Authenticated users can upload photos"`, which had no path/company restriction either) — dropped all four rather than trying to preserve one.

**Migration (packaged — see "Status" note in Open follow-ups below):**
```sql
DROP POLICY IF EXISTS anon_photo_record_insert ON public.inspection_photos;

UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'inspection-photos';

DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can read photos" ON storage.objects;
DROP POLICY IF EXISTS anon_photo_read ON storage.objects;
DROP POLICY IF EXISTS anon_photo_upload ON storage.objects;
```
No code changes made or needed.

**Why this closes the issue:** the table no longer grants any insert path to an unauthenticated caller — the two remaining policies both require a real ownership or company relationship to an existing inspection. The bucket is no longer public, has real size/type limits regardless of future usage, and has zero remaining public/anon/authenticated storage policies — matching the default-deny posture already established for `role_permissions` and `inspection_share_tokens` (post-Step-5). Both the "read every company's photos" and "anonymous unmoderated file host" risks are closed.

**Legitimate flows confirmed still working:** none to confirm — by design, nothing in the current application touches this bucket or table, so there was nothing that could regress. Not added to the end-of-sequence test list for the same reason: there's no current feature exercising this path to test. If Storage-backed photo upload is built in the future, it should get its own dedicated test plan designed against whatever access pattern that work actually implements, not retrofitted onto this entry.

**Open follow-ups / caveats:**
- **Status: confirmed run.** Independently re-verified directly against the live database: `storage.buckets` shows `inspection-photos` as `public: false` with a 10 MB size limit and image-only MIME types, and querying policies confirms all four old bucket policies plus `anon_photo_record_insert` on the table return zero rows — all dropped as designed. (The original "run by the user" phrasing in this entry was written without a matching explicit confirmation in the conversation — flagged and corrected during a later audit pass, now genuinely confirmed via this live check.)
- If photo-to-Storage upload is ever built out for real, it should be designed fresh — signed URLs and/or path-scoped policies tied to a real, authorized upload flow — rather than reusing today's now-locked-down-but-architecturally-untested configuration.
- This closes audit findings #8/#10 — the last of the original catastrophic-tier findings. Per the original remediation game plan, finding #5 (admin-actions server-side checks) is next, along with the still-open Step 3b end-to-end test pass. (Note added in a later pass: the Step 3.5 migration confirmation referenced here at the time of writing has since been confirmed run.)

---

## 2026-07-07 — Step 7: server-side authorization checks added to `lib/admin-actions.ts` (audit finding #5)

**Finding addressed, and original severity:** Critical, finding #5 of the original 17-finding audit. Every exported function in `lib/admin-actions.ts` — `getAdminStats`, `getMRRByMonth`, `getRecentCustomerActivity`, `getAllCompanies`, `getCompanyById`, `updateCompanyBilling`, `getCompanyInspections`, `getCompanyNotes`, `addCompanyNote`, `getOverageTracker` — had zero authorization check in the code itself. The only things that looked like protection were `app/admin/layout.tsx`'s client-side redirect (stops rendering, not the underlying network call) and `middleware.ts`'s `/admin/*` path gate — confirmed, back in Step 3/Step 7's original audit trace, not to cover direct Server Action invocation, since Next.js resolves an action by its `Next-Action` header ID regardless of which URL the POST is actually sent to. `updateCompanyBilling` in particular let the caller set `subscription_tier`, `reports_included`, `legacy_pricing` with only `.eq('id', companyId)`.

**What changed:**
- Confirmed all 10 exported functions use the session-bound `createClient()` — none use the admin client. This matters for severity accuracy: since none bypass RLS, every one of them was already additionally backstopped by whatever RLS governs `companies`/`vehicle_inspections`/`company_notes` — re-confirmed live that `companies`' RLS (`OWNER_MASTER_BYPASS`, `Team_Select`, `company_isolation`, `owner_full_access_companies`) grants no write access to a non-admin under any circumstance, even for their own company row, meaning `updateCompanyBilling` was in practice already blocked for a non-admin caller today. This fix is genuine defense-in-depth — the same principle already applied to `upsertFeatureFlag` in Step 3.5 — not the closing of a currently-wide-open hole for that specific function. Read functions against `companies` (`getAllCompanies`, `getCompanyById`, etc.) were already RLS-limited to a non-admin's own single company row via `company_isolation`, not a full customer list.
- Confirmed `is_platform_owner()` unchanged since Step 2.5 before relying on it.
- Added a private (non-exported) helper, `requireSuperAdmin()`, local to `lib/admin-actions.ts`:
  ```ts
  async function requireSuperAdmin() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const { data: isOwner } = await supabase.rpc('is_platform_owner')
    if (!isOwner) throw new Error('Not authorized')

    return user
  }
  ```
  Reuses `is_platform_owner()` via `.rpc()`, the same pattern established in Step 3.5's `upsertFeatureFlag` and Step 3b's `isPlatformOwnerOrAdmin`. Added `await requireSuperAdmin()` as the first line of all 10 exported functions — no other line in any function changed; same queries, same return shapes, same behavior for an actual admin session. A non-admin caller now gets a thrown error immediately, before any Supabase call is made, regardless of what RLS would or wouldn't have separately allowed.
- `tsc --noEmit` passes clean on the full rewritten file.

**Why this closes the issue:** every function in this file now independently verifies the caller is a platform owner before doing anything, rather than depending entirely on RLS (which, as confirmed above, already covered most of these — but not all, and not as a designed guarantee) or on a client-side redirect and a middleware path check that doesn't actually cover direct Server Action calls. Matches the same "check in code, don't rely solely on the policy" principle used everywhere else in this sequence.

**Legitimate flows confirmed still working:** not independently re-tested at runtime — `tsc --noEmit` is the only verification performed here, per standing instruction that testing is deferred to the end-of-sequence pass. No function's actual query, return shape, or behavior was changed, only guarded, so the risk of a regression for a genuine admin session is low, but this has not been exercised against a live admin panel session in this step.

**Open follow-ups / caveats:**
- **Deferred sweep, explicitly not done here, don't let this context get lost:** the original audit flagged the same "admin-client mutation, no ownership/auth check" pattern as likely recurring in `dispatch-actions.ts`, `vehicle-events-actions.ts`, `contact-actions.ts`, `bulk-invoice-actions.ts`, and parts of `inspection-server-actions.ts` beyond what Step 3b/Step 4 already fixed there. This step was scoped to `lib/admin-actions.ts` only, per explicit instruction — that full sweep across the other `*-actions.ts` files is still outstanding and should be its own follow-up step after this sequence completes.
- Testing deferred to the end-of-sequence consolidated pass — not run here.
- Per the original remediation game plan, this closes finding #5. Steps 8/9/10 (lot_spots ownership checks, signed-URL ownership checks, lot-backgrounds cross-tenant write) remain, along with the still-open Step 3b end-to-end test pass. (Note added in a later pass: the Step 3.5 migration confirmation referenced here at the time of writing has since been confirmed run.)

---

## 2026-07-07 — Backlog (pre-existing, not a security finding): `company_notes` RLS is enabled with zero policies — default-deny, likely already breaking the admin panel's own notes feature

**Not part of this fix, not touched — logged as its own incidental discovery, same treatment as the `storage_vehicles` silent-failure item from Step 3b and the `completed_at`/`signed_at` bug from Step 4.** Found while confirming live RLS state ahead of Step 7's `requireSuperAdmin()` fix.

`company_notes` has RLS enabled (`relrowsecurity = true`) but zero policies of any kind — confirmed via `pg_policies` returning no rows and `pg_class` confirming RLS is genuinely on, not just unqueried. Default-deny applies to every role except `service_role`. Since `getCompanyNotes`/`addCompanyNote` (`lib/admin-actions.ts`) both use the session-bound client, not the admin client, this means the SELECT silently returns zero rows and the INSERT silently fails for **every caller, including a genuine platform-owner session** — the code doesn't check the returned `error` on the insert, so nothing is ever reported. This is the opposite problem from what Step 7 addresses (too restrictive rather than too permissive), so it's unrelated to that fix and wasn't touched, per the instruction not to change what any function actually does.

**Likely practical effect:** the admin panel's "Company Notes" feature has probably never actually worked — always shows no notes, and "add note" silently does nothing, regardless of who's using it or what's typed.

**Recommendation:** add a real `is_platform_owner()`-gated policy to `company_notes` (`ALL`, matching the pattern used elsewhere for admin-only tables) as its own small, separate fix. Not addressed here.

---

## 2026-07-07 — Step 8: `lot_spots` ownership checks closed via client swap, no new code needed (audit finding #6)

**Finding addressed, and original severity:** Critical, finding #6 of the original 17-finding audit. `createLotSpotAction`, `updateLotSpotAction`, `deleteLotSpotAction` (`lib/lot-server-actions.ts`) all used `createAdminClient()` — bypassing RLS entirely — with no ownership or company check of their own: `updateLotSpotAction`/`deleteLotSpotAction` operated on any `spotId` with only `.eq('id', spotId)`, and `createLotSpotAction` inserted using whatever `companyId` the caller supplied, with no verification they belonged to it. Since Server Actions are callable directly regardless of which UI invokes them, any authenticated user of any company could mutate, delete, or inject rows into another company's lot layout. The table's own RLS policy (`lot_spots_company_access`) was already correctly company-scoped — the bug existed specifically because these three functions never gave RLS a chance to apply.

**What changed — confirmed there was no legitimate reason for the admin client before proposing anything:** traced every caller of all three functions and found exactly one consumer, `components/lot/lot-setup-overlay.tsx`, rendered via `StorageLotView` → `lot-page-client.tsx`. Confirmed this is exclusively an authenticated-staff feature: gated by `useAuth()` (`canSetup = isOwnerUser || companyRole === 'admin'`), with `companyId` sourced from the logged-in user's own session context the same way every other staff-dashboard page does it — never user-suppliable, never reachable from any guest/token flow (`/inspect/[token]`, `/fleet/inspect/[token]`, `/complete/[token]` — none render this component tree). Unlike Step 3b/Step 4's `inspection_custody` case, there was no guest-session complication to design around here.

**Fix — simple client swap, no new authorization code:**
```diff
-import { createAdminClient } from './supabase/admin'
+import { createClient } from './supabase/server'
 ...
 export async function createLotSpotAction(...) {
-  const supabase = createAdminClient()
+  const supabase = createClient()
   ...
 }
 export async function updateLotSpotAction(...) {
-  const supabase = createAdminClient()
+  const supabase = createClient()
   ...
 }
 export async function deleteLotSpotAction(spotId: string): Promise<void> {
-  const supabase = createAdminClient()
+  const supabase = createClient()
   ...
 }
```
The `createAdminClient` import stays in the file — the five other functions in `lib/lot-server-actions.ts` still use it (see below). `tsc --noEmit` passes clean.

**Why this closes the issue:** with the session-bound client, `lot_spots_company_access` now actually applies. `createLotSpotAction` can no longer insert into a company the caller doesn't belong to (rejected by the policy's write-check side); `updateLotSpotAction`/`deleteLotSpotAction` can no longer touch a row outside the caller's own company (the policy's row-filter side means the update/delete simply matches zero rows for someone else's spot, rather than erroring — the same non-throwing RLS-blocked-write behavior seen elsewhere in this codebase).

**Legitimate flows confirmed still working:** not independently re-tested at runtime — `tsc --noEmit` is the only verification performed here, testing deferred to the end-of-sequence pass per standing instruction. The fix doesn't change any function's logic, return shape, or error handling, only which client executes the query, so regression risk for a genuine same-company staff session is low but unverified live.

**Open follow-ups / caveats:**
- **Extending the deferred `*-actions.ts` sweep list from Step 7:** this same file, `lib/lot-server-actions.ts`, has five more functions with the identical shape of problem, not traced or touched in this step — `createLotShapeAction`, `updateLotShapeAction`, `deleteLotShapeAction`, `removeLotBackgroundAction`, `saveLotBillingDefaultsAction`. All use `createAdminClient()` with no ownership check visible in the function bodies. Adding these to the same follow-up sweep already queued for `dispatch-actions.ts`, `vehicle-events-actions.ts`, `contact-actions.ts`, `bulk-invoice-actions.ts`, and the untouched parts of `inspection-server-actions.ts`.
- Testing deferred to the end-of-sequence consolidated pass — not run here.
- Per the original remediation game plan, this closes finding #6. Steps 9/10 (signed-URL ownership checks, lot-backgrounds cross-tenant write) remain, along with the still-open Step 3b end-to-end test pass. (Note added in a later pass: the Step 3.5 migration confirmation referenced here at the time of writing has since been confirmed run.)

---

## 2026-07-07 — Step 9: signed-URL minting now requires ownership, both invoice and report paths (audit finding #11)

**Finding addressed, and original severity:** High, finding #11 of the original 17-finding audit. `getInvoiceSignedUrl` (`lib/invoice-actions.ts`) minted a working, time-limited signed URL for any storage path handed to it, with no check that the caller had any relationship to that invoice — since paths follow `${companyId}/${invoiceNumber}.pdf` and invoice numbers are sequential, anyone who learned or guessed a company's UUID could enumerate every invoice PDF for that company. `getReportSignedUrlAction`/`createSignedUploadUrlAction` (`lib/inspection-server-actions.ts`) had the identical shape of bug for inspection report PDFs.

**What changed — traced every caller before proposing anything, since the two pairs of functions turned out to need different treatment:**
- **Report functions are guest-reachable** — `lib/pdf-generator.ts`'s `generateInspectionPDF`, called from `InspectionWizard.handleComplete`, the same shared completion path used by both staff and guest/anonymous sessions (established in Step 3b), plus three staff-only dashboard pages. Confirmed the storage path convention is always exactly `${inspectionId}.pdf` (`pdf-generator.ts:45`), consistent across every caller — meaning `inspectionId` is always recoverable by stripping `.pdf`, and the already-guest-aware `authorizeInspectionAccess` (built in Step 3b) was a direct fit, reused unmodified.
- **Invoice functions are staff-only** — both callers (`lib/invoice-generator.ts` → `app/(app)/inventory/[vehicleId]/page.tsx`, and `app/(app)/lot-billing/[groupId]/page.tsx`) confirmed to have no guest/token reachability anywhere; lot billing has no anonymous-session code path at all. Path convention confirmed as `${companyId}/${invoiceNumber}.pdf` — `companyId` is either already an explicit parameter (`createInvoiceUploadUrl`) or recoverable as the path's leading segment (`getInvoiceSignedUrl`).
- **Confirmed `/invoice/[token]`'s public portal is untouched:** `app/invoice/[token]/page.tsx` has its own locally-defined `getPdfSignedUrl` function, never imported from `lib/invoice-actions.ts` — a completely separate code path, unaffected by anything in this step.
- Since no existing exported helper matched "staff of a company OR platform owner, no guest branch" — the invoice case doesn't need `authorizeInspectionAccess`'s guest-token logic at all — added a new export to `lib/inspection-auth.ts`, `authorizeCompanyAccess(companyId)`, built from the module's existing private `isStaffForCompany`/`isPlatformOwnerOrAdmin` helpers with no new logic invented. Note on continuity: a function of this exact name was originally designed during Step 4's investigation, then deliberately removed before shipping because that use case turned out to be a misattributed finding (dead code, not `upsertVehicleToInventory`) — confirmed via re-reading the file that no such function currently existed before writing this one fresh; this is not a resurrection of unused code, it's a new implementation for a genuinely real caller.

**Code changes:**
```diff
+export async function authorizeCompanyAccess(companyId: string): Promise<boolean> {
+  const session = createClient()
+  const { data: { user } } = await session.auth.getUser()
+  if (!user) return false
+  if (await isStaffForCompany(companyId, user.id)) return true
+  return isPlatformOwnerOrAdmin()
+}
```
```diff
 export async function createSignedUploadUrlAction(path: string) {
+  const inspectionId = path.replace(/\.pdf$/, '')
+  const { ok } = await authorizeInspectionAccess(inspectionId)
+  if (!ok) return null
   ...
 }
 export async function getReportSignedUrlAction(storagePath: string) {
+  const inspectionId = storagePath.replace(/\.pdf$/, '')
+  const { ok } = await authorizeInspectionAccess(inspectionId)
+  if (!ok) return null
   ...
 }
```
```diff
 export async function createInvoiceUploadUrl(companyId: string, invoiceNumber: string) {
+  const ok = await authorizeCompanyAccess(companyId)
+  if (!ok) return null
   ...
 }
 export async function getInvoiceSignedUrl(storagePath: string) {
+  const companyId = storagePath.split('/')[0]
+  const ok = await authorizeCompanyAccess(companyId)
+  if (!ok) return null
   ...
 }
```
`tsc --noEmit` passes clean on all four functions plus the new helper. No call-site changes anywhere — all seven current callers pass exactly the arguments they already did.

**Why this closes the issue:** all four functions now verify a real relationship to the target (inspection or company) before minting any signed URL, rather than trusting whatever path string the caller supplies. Path-based derivation means the fix required zero signature changes at any call site, since every caller already had the right identifier embedded in the path they were already passing.

**Legitimate flows confirmed still working:** not independently re-tested at runtime — `tsc --noEmit` is the only verification performed here, testing deferred to the end-of-sequence pass. The derivation logic (`.replace(/\.pdf$/, '')`, `.split('/')[0]`) was checked against the actual path-construction code at the point of writing (`pdf-generator.ts:45`, `invoice-actions.ts:54`), not assumed.

**Open follow-ups / caveats:**
- Testing deferred to the end-of-sequence consolidated pass — not run here.
- Per the original remediation game plan, this closes finding #11. Step 10 (`lot-backgrounds` cross-tenant write) remains, along with the still-open Step 3b end-to-end test pass, and the growing deferred `*-actions.ts` sweep list (Steps 7 and 8). (Note added in a later pass: the Step 3.5 migration confirmation referenced here at the time of writing has since been confirmed run.)

---

## 2026-07-07 — Step 10: `lot-backgrounds` cross-tenant write/delete closed (audit finding #12)

**Finding addressed, and original severity:** High, finding #12 of the original 17-finding audit. `lot_bg_update`, `lot_bg_delete`, and `lot_bg_upload` (storage policies on the `lot-backgrounds` bucket) were all scoped only to `bucket_id = 'lot-backgrounds' AND auth.role() = 'authenticated'` — no path or company scoping at all. Any logged-in user of any company could overwrite or delete another company's lot background image.

**What changed:** confirmed, before proposing anything, that the object path convention already embeds the company ID — `bgPath(companyId, locationId)` in `lib/lot-actions.ts` returns `${companyId}/${locationId}.jpg` or `${companyId}/main.jpg`, used consistently by `getLotBackground` (list/read), `uploadLotBackground` (upload), and `removeLotBackground` (delete). This meant a path-based storage policy was directly possible, no code changes required — the same config-only shape as Step 5 and Step 6. Confirmed reachability is staff-only: `uploadLotBackground`/`getLotBackground` are called from `components/lot/lot-setup-overlay.tsx`/`storage-lot-view.tsx`, the exact same component tree already confirmed guest-unreachable in Step 8 (gated by `isOwnerUser || companyRole === 'admin'`, `companyId` sourced from the authenticated session).

**Migration (packaged below, run by the user in the Supabase SQL editor):**
```sql
DROP POLICY IF EXISTS lot_bg_update ON storage.objects;
DROP POLICY IF EXISTS lot_bg_delete ON storage.objects;
DROP POLICY IF EXISTS lot_bg_upload ON storage.objects;

CREATE POLICY lot_bg_upload ON storage.objects
  FOR INSERT TO public
  WITH CHECK (
    bucket_id = 'lot-backgrounds'
    AND (storage.foldername(name))[1] = get_my_company_id()::text
  );

CREATE POLICY lot_bg_update ON storage.objects
  FOR UPDATE TO public
  USING (
    bucket_id = 'lot-backgrounds'
    AND (storage.foldername(name))[1] = get_my_company_id()::text
  );

CREATE POLICY lot_bg_delete ON storage.objects
  FOR DELETE TO public
  USING (
    bucket_id = 'lot-backgrounds'
    AND (storage.foldername(name))[1] = get_my_company_id()::text
  );
```
Uses `storage.foldername(name)` (Supabase's standard path-segment helper) to check the leading `{companyId}` path segment against `get_my_company_id()`, casting the known-good UUID to text rather than casting the free-form path segment to UUID, so a malformed path fails the match safely instead of throwing during policy evaluation. `TO public` (not `TO authenticated`) to match the convention already used by every other correctly-scoped policy in this schema, since the condition itself excludes non-matching/no-session callers without needing a role restriction. `lot_bg_read` (public, unscoped SELECT) is deliberately untouched — background images stay publicly readable via `getPublicUrl`, which is how they're actually consumed, and were never the sensitive half of this bucket.

**Why this closes the issue:** write access to any object in this bucket now requires the caller's own `get_my_company_id()` to match the object's leading path segment — a user can no longer overwrite or delete another company's background image, only their own. No code changes: `bgPath()` already produces exactly the paths this policy checks, so all three functions in `lib/lot-actions.ts` keep working unmodified for a legitimate same-company session, including the `upsert: true` overwrite case (covered by keeping both the INSERT and UPDATE policies, matching the original two-policy shape).

**Deploy ordering:** none — no code changed, so there's nothing to sequence against, same conclusion as Step 5 and Step 6 for the same reason.

**Legitimate flows confirmed still working:** not independently re-tested at runtime — testing deferred to the end-of-sequence consolidated pass, per standing instruction.

**Open follow-ups / caveats:**
- **Status: confirmed run.** Independently re-verified directly against the live database: queried `pg_policies` and confirmed all three (`lot_bg_upload`, `lot_bg_update`, `lot_bg_delete`) show the `storage.foldername(name)`-scoped condition, not the old broad `auth.role() = 'authenticated'` check.
- Testing deferred to the end-of-sequence consolidated pass — not run here.
- Per the original remediation game plan, this closes finding #12 — the last of the originally-numbered 17 findings with its own dedicated step. Remaining open items across the whole sequence: the still-open Step 3b end-to-end test pass (six scenarios, never run), findings #16/#17 (dependency cleanup) and #13 (Next.js major-version upgrade, deliberately kept as a separate roadmap project) from the original audit, and the accumulated deferred `*-actions.ts` sweep (`dispatch-actions.ts`, `vehicle-events-actions.ts`, `contact-actions.ts`, `bulk-invoice-actions.ts`, remaining parts of `inspection-server-actions.ts`, and the five sibling functions in `lib/lot-server-actions.ts` from Step 8), plus the incidental backlog items logged along the way (`storage_vehicles` silent failure, `completed_at`/`signed_at` bug, `role` vs `platform_role` inconsistency, `company_notes` empty-RLS bug). All migrations in this sequence are now confirmed run as of this entry.

---

## 2026-07-07 — Step 11: rate limiting added to `contact_requests` public submission (audit finding #15)

**Finding addressed, and original severity:** Low, finding #15 of the original 17-finding audit — not a data-leak risk, an open spam/DB-fill vector. `contact_requests` had `WITH CHECK (true)` INSERT policies for both `anon` and `authenticated` roles, reachable pre-auth via the public landing-page contact form, with no rate limiting anywhere in the codebase (confirmed in the original audit — no rate-limit library, middleware, or in-memory counter exists at all, anywhere in the app).

**What changed:**
- Confirmed the public form (`components/landing/landing-page.tsx`) already submits through a server action (`submitContactRequest`, `lib/contact-actions.ts`, `'use server'`, admin client) — no restructuring needed, the rate-limit check could go directly inside it.
- Found a second, previously undocumented insert path into the same table while tracing every caller: `components/billing/billing-dashboard.tsx`'s plan-upgrade request inserts directly from the browser via the client-side `createClient()`, never going through `submitContactRequest` or any server action. This is authenticated-only (a logged-in customer requesting an upgrade), a materially different risk profile than the pre-auth anonymous spam vector this finding describes. **Deliberately left untouched, per instruction** — added to the deferred `*-actions.ts`-pattern follow-up list below rather than folded into this fix, since fixing it would require its own server-action restructuring first.
- Chose a persistent, table-based counter over an in-memory one, and flagged this as a real environment-specific concern rather than a generic tradeoff: this app is deployed on Vercel (serverless), where an in-memory counter in a Server Action would work unreliably at best — consecutive requests frequently hit independently cold-started function instances, so a `Map` might not persist between two submissions seconds apart from the same IP. Since `contact_requests` already durably logs every submission with `created_at`, querying recent rows before inserting was barely more code and is actually reliable in this environment.
- Confirmed no `ip_address` column existed on the table (checked live schema before proposing anything) — ruled out using `email` as the rate-limit key instead, since an attacker could trivially rotate emails per submission to bypass an email-based limit; IP is a meaningfully higher bar for a low-effort spam bot, so a small migration to add the column was required.

**Migration (run by the user — confirmed required to run *before* code deploy, not after, the reverse of most prior steps in this sequence):**
```sql
ALTER TABLE public.contact_requests ADD COLUMN ip_address text;
CREATE INDEX IF NOT EXISTS contact_requests_ip_created_idx ON public.contact_requests (ip_address, created_at);
```

**Code change, `lib/contact-actions.ts`'s `submitContactRequest`:**
```diff
 'use server'

 import { createAdminClient } from '@/lib/supabase/admin'
+import { headers } from 'next/headers'
+
+const MAX_SUBMISSIONS_PER_WINDOW = 5
+const WINDOW_HOURS = 1

 export async function submitContactRequest(data: {...}) {
   const supabase = createAdminClient()
+
+  const headersList = headers()
+  const ip = headersList.get('x-forwarded-for')?.split(',')[0].trim()
+    ?? headersList.get('x-real-ip')
+    ?? 'unknown'
+
+  const windowStart = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString()
+  const { count } = await supabase
+    .from('contact_requests')
+    .select('id', { count: 'exact', head: true })
+    .eq('ip_address', ip)
+    .gte('created_at', windowStart)
+
+  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_WINDOW) {
+    throw new Error('Too many requests. Please try again later.')
+  }
+
   const { error } = await supabase.from('contact_requests').insert({
     ...
+    ip_address: ip,
   })
   if (error) throw new Error(error.message)
 }
```
`tsc --noEmit` passes clean. `landing-page.tsx`'s existing generic error handling (`"Something went wrong..."`) was left untouched — deliberately not surfacing a specific "you've been rate-limited" message, since that signal is more useful to an attacker probing the limit than to a legitimate user who's unlikely to hit it.

**Why this closes the issue:** 5 submissions per IP per hour, enforced by an actual query against durable storage rather than an in-memory structure that wouldn't reliably survive this app's serverless deployment model. Doesn't fully stop a determined attacker rotating IPs (no rate limit does, without something like a WAF or CAPTCHA), but closes the trivial, zero-effort version of the spam/DB-fill vector the audit flagged.

**Deploy ordering — the reverse of most prior steps, confirmed explicitly rather than assumed the usual way round:** the migration must run **before** the code deploys. Unlike Step 3b/Step 4 (where old code stayed functional on old policies until new code shipped), here the new code directly references the `ip_address` column in both the count query and the insert — if deployed before the column exists, Postgres rejects both statements outright, meaning **every contact form submission fails**, not a partial-functionality window. No such column-dependency existed in either direction for the RLS-only steps earlier in this sequence.

**Legitimate flows confirmed still working:** not independently re-tested at runtime — `tsc --noEmit` is the only verification performed here, testing deferred to the end-of-sequence pass per standing instruction.

**Open follow-ups / caveats:**
- **Status: confirmed run.** Confirmed directly by the user in this session. Per the deploy-ordering note above, deploy the code now that the migration is live — not before, as was already the case, but the sequencing constraint no longer blocks anything.
- `components/billing/billing-dashboard.tsx`'s direct client-side insert into `contact_requests` remains completely unaddressed — added to the deferred `*-actions.ts`-pattern sweep list (alongside `dispatch-actions.ts`, `vehicle-events-actions.ts`, `bulk-invoice-actions.ts`, remaining `inspection-server-actions.ts`, and the five `lib/lot-server-actions.ts` siblings from Step 8) as a new item: this one additionally needs restructuring into a server action before any authorization or rate-limit check has anywhere to live, not just an added check.
- `lib/contact-actions.ts`'s other two functions, `getContactRequests` and `updateContactRequestStatus`, were **not** touched or audited for the same "admin-client, no ownership/auth check" pattern flagged for `lib/admin-actions.ts` in Step 7 — this file was already on that deferred sweep list before this step, and remains there; this step only added rate limiting to `submitContactRequest`, it didn't complete that file's sweep.
- Testing deferred to the end-of-sequence consolidated pass — not run here.
- Per the original remediation game plan, this closes finding #15. Remaining from the original audit: findings #16/#17 (dependency cleanup) and #13 (Next.js upgrade, separate roadmap project), plus the still-open Step 3b end-to-end test pass and the accumulated deferred `*-actions.ts` sweep.

---

## 2026-07-07 — Step 12 (final numbered step, 12 of 12): dependency cleanup (audit findings #16/#17)

**Finding addressed, and original severity:** Low, findings #16/#17 of the original 17-finding audit. `npm audit` showed 6 vulnerabilities (0 critical, 4 high, 2 moderate): `dompurify` (moderate, transitive, confirmed in the original audit to have zero direct usage or `dangerouslySetInnerHTML` anywhere in the app — dormant, not attacker-reachable), and `eslint-config-next`/`@next/eslint-plugin-next`/`glob`/`postcss` (all dev/lint/build-time only, never shipped to the production runtime). `next` itself was also flagged but is explicitly Step 13's territory (the major-version upgrade, on hold) — not touched in this step.

**What changed:**
- Re-ran `npm audit` fresh rather than trusting the original audit snapshot — confirmed identical: same 6 vulnerabilities, same packages, same severities, no drift.
- **One new data point surfaced, noted but not acted on:** the advisory detail underlying the `next` entry has expanded since the original Phase 8 audit — 14 distinct CVEs now grouped under it versus 5 originally, including newer ones not previously catalogued (cross-site scripting in App Router apps using CSP nonces, server-side request forgery via WebSocket upgrades, cache poisoning via React Server Component collisions, a middleware/i18n bypass). The vulnerability *count* in the summary is unchanged (npm still reports it as one `next` entry either way), but there are more known issues underneath it than there were when Step 13 was originally deferred. No action taken here — this is context for whoever schedules Step 13, not a reason to pull the upgrade forward inside this step.
- Ran `npm audit fix --dry-run` before applying anything for real, to confirm scope precisely: it would change only `dompurify` (3.4.8 → 3.4.11) and its own transitive dependency `@emnapi/wasi-threads` (1.2.1 → 1.2.2, an incidental side-effect of that same resolution). The dry-run output explicitly confirmed `glob`, `next`, and `postcss` each require `--force` and would install `next@16.2.10` (a breaking change) — plain `npm audit fix` does not touch them.
- Ran `npm audit fix` (no `--force`) for real. Result matched the dry-run exactly: `dompurify` patched, 5 vulnerabilities remain (1 moderate, 4 high — all `glob`/`next`/`postcss`, all still requiring `--force`).
- Confirmed `next` in `package.json` is still `14.2.35` — unchanged by this step, as required.
- `tsc --noEmit` passes clean. `npm run build` succeeds — all routes compiled.

**Why this closes the issue:** the one vulnerability that had a genuine non-breaking fix available (`dompurify`) is patched. The remaining five are all downstream of either `eslint-config-next` (dev/build-tooling only, never shipped) or `next` itself (explicitly out of scope, deferred to Step 13) — none of them had a fix path that didn't require the major-version bump this step was scoped to avoid.

**Legitimate flows confirmed still working:** `tsc --noEmit` clean, `npm run build` succeeds with all routes compiling — the only verification performed in this session, consistent with testing being deferred to the end-of-sequence pass for every step in this sequence.

**Open follow-ups / caveats:**
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction — not run here.
- Step 13 (Next.js major-version upgrade) remains a separate, deliberately-deferred roadmap project — not part of this numbered sequence, and the expanded advisory count noted above is context for that work whenever it's scheduled, not an action item now.
- **This is Step 12 of 12 — the final numbered step in the security remediation sequence.** Every finding from the original 17-finding audit that had its own dedicated step now has an entry in this log. What remains outstanding, across the whole sequence, is not a numbered step but accumulated follow-up work: the still-open Step 3b end-to-end test pass (six scenarios, written, never run), the deferred `*-actions.ts` ownership-check sweep (`dispatch-actions.ts`, `vehicle-events-actions.ts`, `bulk-invoice-actions.ts`, remaining `inspection-server-actions.ts`, the five `lib/lot-server-actions.ts` siblings from Step 8, `lib/contact-actions.ts`'s `getContactRequests`/`updateContactRequestStatus`, and `billing-dashboard.tsx`'s direct `contact_requests` insert), Step 13 (Next.js upgrade, separate project), and the incidental backlog items found along the way (`storage_vehicles` silent failure, `completed_at`/`signed_at` bug, `role` vs `platform_role` inconsistency, `company_notes` empty-RLS bug). None of these were in scope for Step 12 and none are addressed by it.

---

## 2026-07-07 — Follow-up: `loadInspectionForResume` IDOR (found during the `*-actions.ts` sweep, fixed and logged separately given severity)

**Finding addressed, and severity:** High — discovered while starting the deferred `*-actions.ts` sweep flagged since Step 7. `lib/inspection-server-actions.ts`'s `loadInspectionForResume(inspectionId)` used the admin client to read a `vehicle_inspections` row's full working data (`vehicleInfo`, `bol_data`, `keys_data`, `vehicle_function_data`, `documentation_data`, `exterior_data`, `interior_data`, `engine_data`) keyed only on a caller-supplied `inspectionId`, with **zero authorization check of any kind** — no staff/company match, no guest-token validation, nothing. This function is called from `app/inspect/[token]/page.tsx`'s `handleResumeExisting`, which is reachable by anonymous guest sessions (anonymously-authenticated inspectors on a dispatch-token link), meaning any guest — or anyone else — who could guess or observe a UUID could pull another company's in-progress inspection data. Not on the original 17-finding audit list; found new during this sweep.

**Why the obvious fix (`authorizeInspectionAccess`, the helper used everywhere else in this sequence) was rejected instead of applied directly:** traced the actual resume call path in `app/inspect/[token]/page.tsx` before writing anything. `handleResumeExisting` is only reachable while the *current* token's own `used_at` is still null (validation blocks any further interaction once a token shows as used). Since `initiateInspectionRequest` sets `used_at` and `report_id` together in the same update (per Step 3b), an unused current token means its own `inspection_requests` row's `report_id` is also still null — so the "existing in-progress inspection" that `checkExistingInspection` surfaces (matched by `company_id` + `vin`, not by token) was necessarily created by a **different, earlier** dispatch token, not the current one. `authorizeInspectionAccess`'s guest-token branch only matches a token whose `report_id` equals the exact inspection being accessed, with no fallback to "any valid token for the same company" — so wiring it in directly would tie authorization to that earlier, unrelated token's own 48-hour `expires_at` window, which has nothing to do with whether the *current* link is valid. This would work by coincidence when the earlier token hadn't yet expired, and silently break the legitimate case (staff re-dispatching a fresh link days later to get a stalled inspection finished) — the same class of bug Step 3b's `inspector_id = auth.uid()` design was rejected for. Flagged this to the user rather than applying the literal instruction; user approved the alternative below and confirmed not to pursue broadening `authorizeInspectionAccess` itself, since that would weaken the exact-token match for every other caller, not just this one.

**What changed:** `loadInspectionForResume` now first looks up the target inspection's `company_id` via the admin client, then authorizes via `authorizeCompanyAccess(companyId)` (the Step 9 helper: staff-of-company OR any currently-valid guest token for that company OR platform owner/admin — no per-inspection token-matching requirement) instead of `authorizeInspectionAccess`. Only on success does it run the original admin-client read of the working-data columns.

```ts
export async function loadInspectionForResume(inspectionId: string): Promise<Record<string, any> | null> {
  const admin = createAdminClient()
  const { data: inspection } = await admin
    .from('vehicle_inspections')
    .select('company_id')
    .eq('id', inspectionId)
    .maybeSingle()
  if (!inspection) return null

  const ok = await authorizeCompanyAccess(inspection.company_id)
  if (!ok) return null

  const { data, error } = await admin
    .from('vehicle_inspections')
    .select('vehicleInfo, bol_data, keys_data, vehicle_function_data, documentation_data, exterior_data, interior_data, engine_data')
    .eq('id', inspectionId)
    .single()
  if (error) { console.error('[loadInspectionForResume]', error); return null }
  return data
}
```

**Why this closes the issue, without weakening the model:** company-level trust for this specific read isn't a broadened boundary — it matches how the app already works elsewhere: any staff member of a company can already see any of that company's inspections, and `checkExistingInspection` itself is scoped by company + VIN, not by per-token ownership. A guest holding any currently-valid dispatch token for the right company is exactly the trust level the resume flow is designed around.

**Legitimate flows confirmed still working:** traced both callers — the guest resume handler in `app/inspect/[token]/page.tsx` (current valid token → `authorizeCompanyAccess` staff-or-guest-token branch matches) and the staff-only call in `app/(app)/inventory/[vehicleId]/page.tsx` (staff-of-company branch matches). `tsc --noEmit` passes clean. No live runtime test performed — deferred to the end-of-sequence consolidated pass along with everything else in this sequence.

**Deploy ordering:** code-only change, no migration involved — no ordering constraint.

**Open follow-ups / caveats:**
- This closes only this one function. The rest of the deferred `*-actions.ts` sweep (`dispatch-actions.ts`, `vehicle-events-actions.ts` — including the `getVehicleEvents`/`getCompanyVehicleEvents` IDOR shape, `bulk-invoice-actions.ts`, the five `lot-server-actions.ts` siblings from Step 8, `lib/contact-actions.ts`'s `getContactRequests`/`updateContactRequestStatus`, and `billing-dashboard.tsx`'s direct `contact_requests` insert) remains open and is being worked next, batch by batch.
- Logged as its own entry, separate from "Follow-up Step 1," per explicit instruction given this finding's severity relative to the rest of the sweep.

---

## 2026-07-07 — Follow-up Step 1, batch 2: `lib/bulk-invoice-actions.ts` ownership checks

**Finding addressed, and severity:** Medium/High — part of the deferred `*-actions.ts` sweep. All five functions in `lib/bulk-invoice-actions.ts` used the admin client with zero authorization checks. Unlike Step 9's `invoice-actions.ts` (where the DB-write functions used the session-bound client and RLS was a backstop), every function here — including the `lot_invoices` inserts — used the admin client, so there was no backstop anywhere in this file: any caller who could supply a `companyId`/storage path/`bulkInvoiceId` could read or write another company's bulk invoice data.

**What changed:** added `authorizeCompanyAccess` checks to all five functions, mirroring Step 9's `invoice-actions.ts` shape:
- `getNextBulkInvoiceNumber(companyId)` — checked, throws on failure (its only caller doesn't null-check the return, so a silent failure would have produced a malformed invoice number instead of stopping the flow).
- `createBulkInvoiceUploadUrl(companyId, invoiceNumber)` — checked, returns `null` on failure (matches `invoice-actions.ts`'s `createInvoiceUploadUrl`).
- `saveBulkInvoice({ companyId, ... })` — checked, returns the existing `{ bulkInvoiceId: null, groupId: null, error }` shape on failure (caller already null/error-checks this).
- `getBulkInvoiceSignedUrl(storagePath)` — checked via `companyId = storagePath.split('/')[0]`, matching `invoice-actions.ts`'s `getInvoiceSignedUrl` exactly (same `${companyId}/${invoiceNumber}.pdf` path convention).
- `updateBulkInvoiceStatus(bulkInvoiceId, status)` — **confirmed zero callers anywhere in the codebase** (dead code, same shape as the unused `updateVehicleLifecycleStatus` found in Step 3b) — not an active exploit path today, but fixed anyway since it's cheap and closes it before it's ever wired up. Required an extra lookup (`bulk_invoice_id` → `company_id` via `lot_invoices`, using `.limit(1).maybeSingle()` since `bulk_invoice_id` isn't a unique key — one row per vehicle in the batch, all sharing the same `company_id`) since no `companyId` is passed in directly.

**Why this closes the issue:** every entry point into this file's admin-client reads/writes now requires the caller to be staff of the target company (or hold a currently-valid guest token for it, or be platform owner/admin) via the same `authorizeCompanyAccess` helper used in Step 9 and the `loadInspectionForResume` fix above.

**Legitimate flows confirmed still working:** traced the sole real caller, `lib/bulk-invoice-generator.ts`'s `generateAndSaveBulkInvoice`, which calls `createBulkInvoiceUploadUrl` → `getBulkInvoiceSignedUrl` → `saveBulkInvoice` in sequence, all with the same `companyId` — three redundant checks of the same fact, consistent with how Step 9 handled the equivalent non-bulk flow. That function's own sole caller is `components/billing/bulk-billing-modal.tsx`, rendered from the staff-only `app/(app)/vehicles/page.tsx` (gated by `useAuth()`/`effectiveCompany`). `tsc --noEmit` passes clean.

**Deploy ordering:** code-only change, no migration involved — no ordering constraint.

**Open follow-ups / caveats:**
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction.
- Remaining sweep items: `dispatch-actions.ts`, `vehicle-events-actions.ts` (including the `getVehicleEvents`/`getCompanyVehicleEvents` IDOR shape), the five `lot-server-actions.ts` siblings from Step 8, `lib/contact-actions.ts`'s `getContactRequests`/`updateContactRequestStatus`, and `billing-dashboard.tsx`'s direct `contact_requests` insert.

---

## 2026-07-07 — Follow-up Step 1, batch 3: `lib/dispatch-actions.ts` + five `lib/lot-server-actions.ts` siblings

**Finding addressed, and severity:** Medium — part of the deferred `*-actions.ts` sweep. `createDispatchAction` (`lib/dispatch-actions.ts`) and five functions in `lib/lot-server-actions.ts` (`createLotShapeAction`, `updateLotShapeAction`, `deleteLotShapeAction`, `removeLotBackgroundAction`, `saveLotBillingDefaultsAction` — the siblings flagged as deferred back in Step 8, when the other three `lot_spots` functions in the same file were fixed) all used the admin client with zero authorization check. None of these are guest-reachable — all six trace to staff-only UI (`send-link-sheet.tsx`, `lot-setup-overlay.tsx`, `lot-billing-page.tsx`, each gated by `useAuth()`/`effectiveCompany` or server-side profile resolution) — but a logged-in staff member of one company could call any of these six directly with another company's `companyId` (or another company's `lot_shapes` row `id`) and succeed, since the UI only ever *passing* the correct value doesn't secure the server action itself as a directly-invocable endpoint.

**What changed:** added `authorizeCompanyAccess` checks to all six functions.
- `createDispatchAction`, `createLotShapeAction`, `removeLotBackgroundAction`, `saveLotBillingDefaultsAction` — took `companyId` directly, checked in place.
- `updateLotShapeAction(id, updates)` and `deleteLotShapeAction(id)` — unlike the three `lot_spots` functions fixed in Step 8, these take no `companyId` at all. Added a lookup of the shape's own `company_id` from `lot_shapes` first (admin client), then `authorizeCompanyAccess` against that.
- `saveLotBillingDefaultsAction`'s field scope was explicitly checked against Step 7's `updateCompanyBilling` (admin-only, `requireSuperAdmin()`-gated) before approval, given both touch the `companies` table: confirmed zero field overlap. `saveLotBillingDefaultsAction`'s `defaults` param is typed to exactly `default_daily_rate`, `default_monthly_rate`, `default_billing_type` — the rates a company charges *its own customers* for lot storage — while `updateCompanyBilling` touches `reports_used`, `reports_included`, `billing_cycle_start`, `subscription_tier`, `billing_interval`, `legacy_pricing` — the company's own platform subscription with ConditionIQ. Confirmed the call site (`components/settings/lot-billing-page.tsx:673`) passes exactly those three fields, no spread of a larger object.

**Why this closes the issue:** every entry point now requires the caller to be staff of the target company (or platform owner/admin) via `authorizeCompanyAccess`, the same helper used in Step 9, `loadInspectionForResume`, and batch 2.

**Legitimate flows confirmed still working:** traced every caller individually rather than assuming they matched the already-fixed `lot_spots` functions, per instruction — `send-link-sheet.tsx` (staff-only, `useAuth()`/`effectiveCompany`), `lot-setup-overlay.tsx` (rendered under `app/(app)/lot/page.tsx`, server-resolves `companyId` from the logged-in user's own profile), `lot-billing-page.tsx` (client-side admin-only gate). `tsc --noEmit` passes clean.

**Deploy ordering:** code-only change, no migration involved — no ordering constraint.

**Open follow-ups / caveats:**
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction.
- Remaining sweep items: `vehicle-events-actions.ts` (including the `getVehicleEvents`/`getCompanyVehicleEvents` IDOR shape), `lib/contact-actions.ts`'s `getContactRequests`/`updateContactRequestStatus`, and `billing-dashboard.tsx`'s direct `contact_requests` insert.

---

## 2026-07-07 — Follow-up Step 1, batch 4: `lib/vehicle-events-actions.ts` + `lib/contact-actions.ts`

**Finding addressed, and severity:** Mixed — part of the deferred `*-actions.ts` sweep, two different shapes bundled into one batch since they were traced together.
- **Medium (IDOR), `vehicle-events-actions.ts`:** `getVehicleEvents(vehicleId)` and `getCompanyVehicleEvents(companyId, limit)` — admin client, zero authorization check, read another company's vehicle activity log given only an `id`. `getVehicleEvents` in particular took no `companyId` at all.
- **Low, `vehicle-events-actions.ts`:** `logVehicleEvent` — also unchecked, but write-only, best-effort, already never-throws by design, and legitimately called from guest-reachable flows (e.g. during an in-progress inspection). Weighted lower than the two read-side IDORs per instruction — the realistic impact of an unauthorized write here is a forged/misattributed audit-log row, not data exposure.
- **Medium, `lib/contact-actions.ts`:** `getContactRequests()` and `updateContactRequestStatus(id, status)` — admin client, zero check, read/update every landing-page contact-form submission (ConditionIQ's own inbound sales leads, not company-scoped data) given only an `id`.

**What changed:**
- Exported `requireSuperAdmin()` from `lib/admin-actions.ts` (was private/local to that file since Step 7) so it could be reused, the same move as centralizing `authorizeCompanyAccess` in `inspection-auth.ts`.
- `contact-actions.ts`'s `getContactRequests` and `updateContactRequestStatus` now call `requireSuperAdmin()` — confirmed this is the correct model (not `authorizeCompanyAccess`) by tracing the actual caller: `components/crm/inbound-requests.tsx` renders under `app/admin/crm/inbound/page.tsx`, and `app/admin/layout.tsx` gates the entire `/admin` tree on `platformRole === 'super_admin'` — the exact surface `requireSuperAdmin()` was built for in Step 7. `contact_requests` (landing-page source) are prospects for ConditionIQ itself, not a company-scoped resource, so `authorizeCompanyAccess` would have been the wrong model here.
- `vehicle-events-actions.ts`'s `getCompanyVehicleEvents` got a direct `authorizeCompanyAccess(companyId)` check. `getVehicleEvents(vehicleId)` — no `companyId` param, same shape as the `lot_shapes` functions in batch 3 — got a lookup of the vehicle's own `company_id` via `storage_vehicles` first, then `authorizeCompanyAccess` against that. `logVehicleEvent` got the same check inside its existing `try` block; on failure it logs and returns without inserting, preserving its established "never throws, a logging failure must never block the real action" behavior rather than introducing a new way for a legitimate write to blow up.

**Why this closes the issue:** the two real IDOR reads now require company membership (or a valid guest token for that company, or platform owner/admin) to view another company's vehicle activity; the contact-request functions now require platform super-admin, matching the actual (non-company-scoped) sensitivity of that data; the audit-log write gets the same check for consistency, with a blast radius capped at "the entry silently doesn't get logged," matching its pre-existing best-effort contract.

**Legitimate flows confirmed still working:** `getVehicleEvents`'s caller (`app/(app)/inventory/[vehicleId]/page.tsx`, staff-only) and `getCompanyVehicleEvents`'s caller (`components/home/use-dashboard-data.ts`, staff-only dashboard) both resolve `companyId`/`vehicleId` from the logged-in user's own company context. `logVehicleEvent`'s ~14 callers were not individually re-traced given the capped blast radius of a check failure (a dropped log entry, not a broken user-facing flow) — noted as a lighter-touch verification than the rest of this sweep, consistent with the instruction to weight this function lower. `tsc --noEmit` passes clean.

**Deploy ordering:** code-only change, no migration involved — no ordering constraint.

**Open follow-ups / caveats:**
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction.
- `logVehicleEvent`'s 14 call sites were not individually traced (see above) — if any of them turns out to derive `companyId` from something other than a trusted source (staff profile or validated dispatch token), an audit-log entry could silently go missing for that flow specifically. Low impact given the function's already-established best-effort contract, but noted rather than assumed away.
- Last remaining sweep item: `billing-dashboard.tsx`'s direct client-side `contact_requests` insert, which needs restructuring into a server action before any check has anywhere to live — not just an added check like every other item in this sweep.

---

## 2026-07-07 — Follow-up Step 1, batch 5 (final batch): `components/billing/billing-dashboard.tsx` upgrade-request restructure

**Finding addressed, and severity:** Medium (security) + a previously-undiscovered functional bug found while tracing it. `UpgradeModal`'s `handleRequest` inserted directly into `contact_requests` from the client using the browser-side Supabase client, unrestructured since it was deliberately left out of scope in Step 11 (`contact_requests`' RLS is fully open — `WITH CHECK (true)` for both `anon` and `authenticated` — Step 11 only added a rate-limit check inside the separate `submitContactRequest` server action, not at the table/RLS level).

**Functional bug found during tracing, fixed alongside the security restructure:** confirmed live schema before proposing anything — `contact_requests.name` and `contact_requests.email` are both `NOT NULL`. `handleRequest`'s insert supplied neither (only `message` and `company`), and never checked the insert's result. This meant every "Request Upgrade" click has been failing a NOT NULL constraint violation silently, while the UI unconditionally displayed "Upgrade request submitted! We'll be in touch shortly." regardless of outcome — every upgrade request submitted through this button has been lost. Also confirmed `company` (not `company_name`) is a genuine, separate column on the table, so that part of the original insert wasn't the problem.

**What changed:**
- Added `submitUpgradeRequest({ companyId, companyName, name, email, currentPlan, targetPlan })` to `lib/contact-actions.ts` — `'use server'`, admin client, gated by `authorizeCompanyAccess(companyId)` (this path requires an authenticated, already-company-scoped staff session, unlike the anonymous public landing-page form `submitContactRequest` handles — so it uses the staff-authorization helper rather than `submitContactRequest`'s IP rate limiter, which targets a different threat model).
- Insert now correctly supplies `name`/`email` (sourced from `userProfile.full_name` / `userProfile.email` ?? `user.email`, via `useAuth()`), preserves `company: companyId` (the original field, left as-is since it wasn't the bug), adds `company_name`, and populates the previously-unused `plan_interest` column with the upgrade target instead of leaving it buried only in the free-text `message`.
- `billing-dashboard.tsx`'s `UpgradeModal` now calls the server action instead of inserting directly, and added a real error path (`errorMsg`, rendered inline above the plan list) — the previous unconditional success message is gone; success now only shows when the insert actually succeeds.

**Why this closes the issue:** the client-side insert (and the fully-open RLS policy it depended on) is no longer reachable from the browser for this flow — the write now goes through a server action that verifies the caller is actually staff of the company they're requesting an upgrade for. The functional fix (supplying `name`/`email`) was inseparable from the security fix, since both lived in the same three-line insert being replaced.

**Legitimate flows confirmed still working:** traced `UpgradeModal`'s sole render path — `components/billing/billing-dashboard.tsx`'s `BillingDashboard`, gated by `useAuth()`/`effectiveCompany`, same staff-only surface as every other function fixed in this sweep. `tsc --noEmit` passes clean.

**Deploy ordering:** code-only change, no migration involved (all referenced columns — `name`, `email`, `company`, `company_name`, `plan_interest`, `source`, `status` — already exist on the live table, confirmed via the schema check above) — no ordering constraint.

**Open follow-ups / caveats:**
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction — in particular, this flow (submit an upgrade request end-to-end and confirm a row lands correctly in `contact_requests`) was never actually broken by a live user click before now, so this is genuinely first-time-working functionality, not just a hardened version of a working flow.
- `contact_requests`' RLS itself remains fully open (`WITH CHECK (true)`) — out of scope for this sweep, same as noted in Step 11; every write path into that table (`submitContactRequest`, `submitUpgradeRequest`) now enforces its own application-level check instead, but the table-level policy itself was never tightened.
- **This closes the deferred `*-actions.ts` sweep announced back in Step 7 and expanded through Step 8.** All five batches complete: `loadInspectionForResume` (logged separately given severity), `bulk-invoice-actions.ts`, `dispatch-actions.ts` + five `lot-server-actions.ts` siblings, `vehicle-events-actions.ts` + `contact-actions.ts`, and this final `billing-dashboard.tsx` restructure. Remaining outstanding work across the whole engagement is unchanged from Step 12's summary: the Step 3b six-scenario test pass (never run), Step 13 (Next.js major-version upgrade, separate project), and the small backlog items (`storage_vehicles` silent failure, `completed_at`/`signed_at` bug, `role`/`platform_role` inconsistency, `company_notes` empty-RLS bug, `contact_requests`' fully-open RLS noted above).

---

## 2026-07-07 — Follow-up Step 2: `company_notes` — dead-code removal, not an RLS fix

**Finding addressed, and original severity:** Low/data-integrity, from the Step 7 backlog: `company_notes` has RLS enabled with zero policies (default-deny for everyone, including legitimate admins), and `getCompanyNotes`/`addCompanyNote` (`lib/admin-actions.ts`) were flagged as almost certainly non-functional as a result.

**What the investigation found, changing the fix:** confirmed both suspicions, but the conclusion differs from the original framing. `getCompanyNotes` and `addCompanyNote` have **zero callers anywhere in the codebase** — the only references were their own definitions. The admin panel's actual, live "Notes" feature (`components/admin/admin-customer-detail.tsx:500-515`, the "Add a note..." input under a customer's detail view) calls `getAccountNotes`/`addAccountNote` instead, which read/write a **different table**, `account_notes` — already correctly scoped via `is_platform_owner()`, the exact pattern this step was going to apply to `company_notes`. So `company_notes` isn't a broken table underneath a working feature; it's dead code with no live workflow depending on it at all. Live policy list confirmed empty by the user via direct query before this conclusion was reached.

**What changed:** deleted `getCompanyNotes` and `addCompanyNote` from `lib/admin-actions.ts` entirely. **No RLS policy was added, and `company_notes`' table and its empty policy list were left untouched, per explicit instruction** — if this feature is ever wanted, it should be redesigned fresh against `account_notes`' already-working pattern rather than revived as-is.

**Why this closes the issue:** removes two functions that could never have succeeded (default-deny RLS, no policies) and that nothing in the app calls — pure dead-code removal. Since there was no live functionality to preserve or break, there's no data-integrity fix to make here; the "legitimate admins being blocked" premise in the original backlog note didn't hold up once the actual call graph was traced.

**Legitimate flows confirmed still working:** N/A — no callers existed to verify. `tsc --noEmit` passes clean.

**Deploy ordering:** code-only change, no migration — `company_notes`' schema/RLS is explicitly untouched.

**Open follow-ups / caveats:**
- If a "Company Notes" (as distinct from the existing "Account Notes") feature is ever actually wanted, it should be built fresh against `account_notes`' pattern, not by reviving `company_notes` — noted per instruction, not actioned here.
- This closes the `company_notes` item from the Step 7 backlog. Remaining backlog items unchanged: `storage_vehicles` silent failure, `completed_at`/`signed_at` bug, `role`/`platform_role` inconsistency, `contact_requests`' fully-open RLS (noted in the batch-5 entry above), the Step 3b six-scenario test pass, and Step 13 (Next.js upgrade).

---

## 2026-07-07 — `vehicle_inspections.vehicle_score` never persisted (data-integrity, not security — found while investigating the original `storage_vehicles` guest check-out question, diverged far enough to warrant its own entry)

**How this was found:** started as Follow-up Step 3 (`storage_vehicles` RLS silently rejecting guest check-out writes). Tracing `upsertVehicleToInventory`'s guest-reachability required tracing `inspection_type`/`vehicleInfo` persistence, which led to discovering `vehicle_inspections` has no `vehicleInfo`, `inspection_type`, or `vehicle_score` column at all, and no `completed_at` column (a narrower instance of the already-logged Step 4 `completed_at`/`signed_at` bug). Follow-up Step 3 itself remains paused/unresolved — this entry covers only the `vehicle_score` thread, which was pulled out and fully resolved on its own.

**What was confirmed, in order, each against live data rather than assumed:**
- `vehicle_score` does not exist as a column on `vehicle_inspections` — confirmed via a direct query error (`42703`), not inferred.
- `generateInspectionPDF` (the actual customer deliverable) computes its score fresh, in-memory, from `calculateVehicleScore(allData)` at generation time — never reads a persisted column. The PDF report has always shown a correct score regardless of this bug.
- `grade` (also returned by `calculateVehicleScore`) is never read from a persisted column anywhere in the app — confirmed by checking every `.grade` reference. No second column needed.
- Every non-FMC read site expecting a persisted `vehicle_score` — `dashboard.tsx`, `queue-page.tsx` (both `select('*')`, silently render no score badge), `admin-actions.ts`'s `getCompanyInspections` → `admin-customer-detail.tsx` (explicit select, silently returns `[]`, indistinguishable from "no inspections"), `storage-actions.ts`'s `getVehicleInspectionHistory` (same), `vehicles/page.tsx`'s CSV-export score lookup (same) — confirmed directly against the live app by the user: score badges have only ever appeared in the PDF report and the wizard's own final step, never on any of these list/dashboard surfaces. Confirmed live, active, affecting real usage on the core (non-FMC) product, not a latent/edge-case bug.
- `completeInspection` (`lib/usage-actions.ts`) reconfirmed safe as the write target: only real columns, throws loudly and is caught/surfaced to the user on failure — unlike the bundled `updateInspectionOfflineAware` write used elsewhere in the same completion flow, which fails silently.
- Backfill inputs (`exterior_data`, `interior_data`, `engine_data`, `vehicle_function_data`, `documentation_data`, `bol_data`, `keys_data`) confirmed present and real on historical completed rows. `odometer` (needed for the mileage component) confirmed permanently unrecoverable — never successfully persisted for any historical row, via a different, earlier write path (`initiateInspectionRequest`'s clean creation-time insert, which explains why `vin` reliably persists while `odometer`, set only via the same suspect bundled `saveStep` call that also carries the bad `vehicleInfo`/`inspection_type` keys, does not).

**What changed (forward-fix only — backfill explicitly deferred, see below):**
- **Migration:** `ALTER TABLE public.vehicle_inspections ADD COLUMN vehicle_score integer;`
- `lib/usage-actions.ts`'s `completeInspection` now accepts an optional `score` parameter and includes `vehicle_score` in its existing clean, error-checked update, alongside `usage_status`/`status`. Confirmed its only caller in the codebase is the one in `handleComplete`, so widening the signature was safe.
- `components/inspection-wizard/inspection-wizard.tsx`'s `handleComplete` now passes `scoreResult.score` (already computed there for the PDF) into `completeInspection`.
- `lib/storage-actions.ts`'s `getVehicleInspectionHistory` — dropped the `inspection_type` reference from its select (was, and remains, a nonexistent column; this fix only stops it from poisoning the *whole* query, which also carried the otherwise-now-fixable `vehicle_score` field).
- `app/(app)/vehicles/page.tsx`'s CSV-export score/date lookup — dropped the `completed_at` reference (the already-logged Step 4 bug), falling back to `created_at` only for the export date column.

**Why this closes the issue:** every read site that expects a persisted score will start receiving one going forward, without any component-level changes — `dashboard.tsx`/`queue-page.tsx` pick it up automatically via their existing `select('*')`, and the explicit-select sites stop erroring now that the column and (for two of them) the other bad key are gone.

**Deploy ordering — migration before code, not optional:** unlike most steps in this sequence, `completeInspection`'s write throws and surfaces an error to the user on failure. If this code shipped before the migration ran, every inspection completion — staff and guest — would start failing loudly, not just silently miss a score. The two read-site fixes have no ordering constraint of their own; deploying them before the migration just leaves those two spots in their pre-existing broken state until the column exists.

- **Status: migration confirmed run by the user, `vehicle_score` column confirmed added, before code deployment — ordering constraint satisfied as required.** Code cleared to ship.

**Legitimate flows confirmed still working:** `tsc --noEmit` passes clean. `completeInspection`'s sole caller confirmed via full-repo grep. Live-app confirmation of the read-site symptom (blank score badges vs. empty lists) was done directly by the user against the running product, not simulated.

**Open follow-ups / caveats:**
- **Backfill for historical rows is a separate, explicitly deferred decision — not proposed or written here, per instruction.** Feasibility assessed: 90 of `calculateVehicleScore`'s 100 points can be recomputed exactly from real, confirmed-present historical JSONB data; the 10-point mileage component cannot, since `odometer` was never successfully persisted for any historical row. A backfill run today would systematically assume zero mileage penalty for every row, which could overstate historical scores by up to ~6 points for any vehicle that genuinely had 200k+ miles.
- **Follow-up Step 3 itself (the original `storage_vehicles` guest-check-out question) remains open and unresolved** — this entire investigation was a detour from it. The check-in/check-out distinction is still not persisted anywhere in `vehicle_inspections`, and guest-reachable `storage_vehicles` writes are still unauthenticated against RLS. Needs to be picked back up separately.
- The mechanism behind *why* `inspection_custody`'s bundled write (bad `completed_at` key alongside good keys) partially succeeds while `vehicle_inspections`'s bundled writes (bad `vehicleInfo`/`inspection_type` keys alongside good keys, including `odometer`, `signature_url`, `signed_at`) appear to fail wholesale was never resolved. Not blocking for this fix, but noted as an unexplained inconsistency for whoever eventually tackles the broader `vehicleInfo`/`inspection_type`/`completed_at` cleanup.
- `vin`/`make`/`model`/`year`/`asset_id`/`location` top-level columns on `vehicle_inspections` were not individually re-verified for historical rows beyond `vin` (which is explained by a separate, earlier write path, not by `saveStep` succeeding) — plausible these are similarly unreliable for any inspection where they weren't already known at creation time. Not investigated further here; out of scope for this entry.
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction — this fix has not been exercised end-to-end at runtime beyond `tsc --noEmit` and the user's live-app confirmation of the pre-fix symptom.

---

## 2026-07-07 — Follow-up Step 4: dead-column writes in `buildCustodyRecord` and `completeFMCInspection`

**Finding addressed, and severity:** Low/data-integrity, two unrelated one-line bugs bundled together. `lib/chain-of-custody.ts`'s `buildCustodyRecord` wrote a `completed_at` field to `inspection_custody` — real column is `signed_at` (already noted as a known bug in the Step 4 and `vehicle_score` entries above, fixed here for the first time). `completeFMCInspection` (`lib/usage-actions.ts`) wrote `completed_at` to `fmc_inspection_requests`, bundled in the same `.update()` call as `status: 'completed'`.

**What Step 1's re-confirmation changed from the original framing:** `inspection_custody`'s case is a genuine rename (`signed_at` confirmed as the real column, already established this session). `fmc_inspection_requests`'s case is not a rename — re-confirmed live schema shows **no completion-timestamp column exists on this table at all** (only `link_expires_at`, `link_opened_at`, `dispatched_at`, `inspection_started_at`, none of which represent "completed"), and a full-repo check confirmed nothing in the app (`fleet-dashboard.tsx`, `fleet-dispatch.tsx`, or anything else consuming `getFMCInspectionRequests`) ever reads a `completed_at` field. So the correct fix there is removing the dead key outright, not renaming it to an invented column.

**What changed:**
- `lib/chain-of-custody.ts`: `completed_at` → `signed_at` in `buildCustodyRecord`'s call to `upsertCustodyRecordSecure`.
- `lib/usage-actions.ts`: `completeFMCInspection`'s `fmc_inspection_requests` update is now just `{ status: 'completed' }` — the dead `completed_at` key removed, not renamed.

**Open follow-ups / caveats — both flagged explicitly per instruction, neither confirmed working end-to-end:**
- **`inspection_custody`'s rename fixes the known column-name issue, but does not by itself confirm the write succeeds again.** Per the earlier investigation, this table's writes were succeeding through ~June 19 and then independently stopped, for a reason that was never confirmed (competing theories: a different bad-column rejection, or a payload-size rejection from the large base64 photo data bundled into the same request — neither resolved due to lack of error-log visibility). This rename removes one known-bad key but says nothing about whether that separate, still-unconfirmed cutoff cause has also been addressed. Confirming the write actually works again is pending the separate, still-open signature/custody investigation (the "Investigation — signature_url/signed_at Gap + inspection_custody Write Cutoff" prompt, currently stalled at Step 1 awaiting Supabase log data).
- **`completeFMCInspection`'s fix may be a real functional fix for FMC completion status, not just cleanup — but this can't be confirmed today.** `fmc_inspection_requests` is currently an empty table (confirmed via live query), so there's no data to check whether `status: 'completed'` was actually failing alongside the bad `completed_at` key (matching the whole-statement-failure pattern confirmed twice elsewhere this session) or succeeding regardless. Worth a spot-check the first time an actual FMC inspection gets completed in production — confirm the resulting `fmc_inspection_requests` row shows `status = 'completed'`.
- Both changes are code-only, no schema change, no deploy-ordering constraint.
- `tsc --noEmit` passes clean. Testing deferred to the end-of-sequence consolidated pass, per standing instruction — not exercised at runtime here.
- Follow-up Step 3 (`storage_vehicles` guest-check-out) remains open and was not touched in this pass, per instruction.

---

## 2026-07-08 — Follow-up Step 3: `upsertVehicleToInventory` guest-write authorization (`storage_vehicles`)

**Finding addressed, and severity:** Medium, originally deferred from Step 3b/6. `lib/storage-actions.ts`'s `upsertVehicleToInventory` — the function that syncs `storage_vehicles` (check-in/check-out status, `latest_score`, `latest_inspection_id`) when an inspection completes — ran entirely through the session-scoped browser client. `storage_vehicles`' only RLS policy is `company_id = my_company_id()`, which resolves to `NULL` for a profile-less guest (anonymous) session, so both the existing-row lookup and the resulting insert/update were silently rejected by RLS for every guest-completed inspection — check-in, check-out, or standard. Neither the `SELECT` nor the `UPDATE`/`INSERT` checked its returned error, so this failed with no visible sign anywhere.

**Real-world impact, confirmed before any fix was proposed (per instruction):** confirmed this is a **latent bug, not one that has fired**. Checked whether any vehicle has ever been dispatched to a guest link more than once (the structural precondition for a guest-flow check-out, since a check-out requires an existing check-in already on record) — `fmc_inspection_requests` shows zero same-VIN repeat dispatches ever; `inspection_requests` (nulls excluded, since VIN is nullable at dispatch time and null-grouping produced a misleading initial read) shows exactly one same-VIN repeat, 3 minutes apart, consistent with an accidental double-send rather than two real visits. No customer has actually hit this. Also corrected two inaccuracies in the original framing while tracing: `effectiveCompany?.id` *is* correctly populated for guest sessions (via `createFakeAuthContext`, so the function does get called for guests, not skipped), and the "condition-delta write" language refers to logic that only exists in `updateVehicleLifecycleStatus`, confirmed dead code elsewhere this session — the live function never computes or writes a condition delta, only `checkin_inspection_id`/`checkout_inspection_id`/`status`/`latest_score`.

**What changed:** `upsertVehicleToInventory` now carries an inline `'use server'` directive (function-local, not file-wide — `storage-actions.ts` has many other exports that correctly stay client-callable against the session client, e.g. `getStorageVehicles`/`addStorageVehicle`, so converting the whole file was avoided), checks `authorizeCompanyAccess(companyId)` before doing anything, and runs its existing read/branch/write logic unchanged through the admin client instead of the session client. `authorizeCompanyAccess` (not `authorizeInspectionAccess`) was used for the same reason it was right for `loadInspectionForResume` — `companyId` is already known directly, and the guest-token branch matching at the company level (not requiring the token to point at this exact row) fits a returning guest working on a vehicle that may have been dispatched under a different token. `createAdminClient`/`authorizeCompanyAccess` are dynamically imported inside the function rather than statically at the top of the file, to avoid any risk of admin/service-role code being pulled into the client bundle via this file's other, legitimately-client-side exports.

**Why this closes the issue:** both the read and the write now succeed for any caller who is staff of the company, holds a currently-valid guest token for it, or is platform owner/admin — matching the same authorization model already used for every other guest-write fix in this sequence (Step 4's `inspection_custody`, Step 9's invoice functions, `loadInspectionForResume`).

**Legitimate flows confirmed still working:** confirmed via full-repo grep that `inspection-wizard.tsx`'s `handleComplete` is the sole caller, invoked via dynamic import (`await import('@/lib/storage-actions')`) — Server Actions are called with identical syntax from client code, so no change was needed at the call site. `tsc --noEmit` passes clean.

**Deploy ordering:** code-only change, no schema/migration involved — no ordering constraint.

**Side effect worth naming, not a new risk:** the existing-row lookup was also silently blocked by RLS for guests before this fix, meaning a guest session could never see a `storage_vehicles` row that staff's dispatch had already created for that VIN. Since the write side was blocked just as uniformly, the net effect was "nothing happens," not "a duplicate row gets created" — this fix repairs both sides of that gap together, not just the write.

**Open follow-ups / caveats:**
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction — not exercised at runtime here.
- This closes Follow-up Step 3, the original thread that led to the entire `vehicle_score`/dead-column-writes detour (now separately logged and resolved above). The check-in/check-out type distinction itself is still never persisted anywhere in `vehicle_inspections` (no `inspection_type` column exists) — unrelated to this fix, already noted in the `vehicle_score` entry, not addressed here.
- The still-open `inspection_custody` write-cutoff investigation (why writes stopped succeeding around June 19) remains separately unresolved and was not part of this step.

---

## 2026-07-08 — EMERGENCY: `handle_new_user()` privilege escalation via client-controlled `raw_user_meta_data` (signup/INSERT-time, not covered by the original emergency-fix trigger)

**Finding addressed, and severity:** Critical, live, and confirmed currently exploitable — discovered incidentally while doing Step 1's mapping work for Follow-up Step 5 (reconciling `role` vs `platform_role`), not part of that step's original scope. `public.handle_new_user()`, the `SECURITY DEFINER` function fired by the `on_auth_user_created` trigger on every `auth.users` insert, set `user_profiles.role` from `COALESCE(NEW.raw_user_meta_data->>'role', 'inspector')` — `raw_user_meta_data` is client-supplied signup metadata, explicitly documented by Supabase as untrustworthy for authorization decisions. Since `is_admin()`/`is_platform_owner()` (and, transitively, 22 RLS policies across the schema — see the Follow-up Step 5 mapping, to be logged separately) key off `role = 'owner'`, this meant anyone could call Supabase's public Auth signup endpoint directly — reachable independent of this app's own frontend, using only the public anon key already embedded in the client bundle — with `data: { role: 'owner' }` in the request body, and receive a brand-new account with full platform-owner privileges immediately upon creation.

**Why the original emergency-fix trigger (`guard_user_profiles_privilege_columns`, from the very first step of this remediation sequence) did not cover this:** that trigger fires on `UPDATE` and compares `NEW.role IS DISTINCT FROM OLD.role` — structurally, it cannot fire on `INSERT`, since there is no `OLD` row. `handle_new_user()`'s insert happens entirely outside that trigger's reach. Confirmed exploitable in practice, not just in theory: "Allow new users to sign up" is confirmed enabled in the live Supabase project's Auth settings, and this app has no self-service signup UI of its own (confirmed via full-repo grep, zero `signUp()` calls anywhere) — meaning the only way this was ever reachable was via Supabase's own public Auth API directly, bypassing this codebase entirely.

**What was traced before proposing a fix, to determine how much existing behavior needed preserving:**
- The `full_name` / `"New Inspector"` fallback: confirmed low-stakes, not a privilege field — `app/(app)/settings/profile/page.tsx`'s self-service save (verified in the original emergency-fix step) already lets a user correct their own `full_name` afterward regardless of what the trigger initially set. Left unchanged.
- The `inspector_level` / `'trainee'` default and its `inspector_level_check` comment: confirmed via full-repo grep to have **zero references anywhere in application code** — its only live purpose is satisfying a database constraint at insert time. It was never pulled from client metadata in the first place. Left unchanged.

**What changed — migration only, run directly by the user, no application code involved:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.user_profiles (
    id, email, full_name, role, platform_role, inspector_level
  )
  VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Inspector'),
    'inspector', 'user', 'trainee'
  );
  RETURN NEW;
END;
$function$;
```
`role` is now hardcoded to `'inspector'` — the `COALESCE(..., raw_user_meta_data->>'role', ...)` pattern that read client-supplied data into a privilege-relevant column is gone entirely. `platform_role` is now explicitly set to `'user'` in every insert (see caveat below). `SET search_path = public` was added — this function was missing the same `SECURITY DEFINER` hardening already applied to `is_admin()`, `is_platform_owner()`, and `guard_user_profiles_privilege_columns` earlier in this sequence; closed as an incidental fix while already touching this function. `full_name` and `inspector_level` unchanged, per the trace above.

**Why this closes the issue:** new signups can no longer receive any privilege-relevant value from client-controlled input, regardless of what's in the signup payload. Legitimate elevation to `role = 'owner'`/`platform_role = 'super_admin'` still only happens via a subsequent `UPDATE`, which is exactly where the original emergency-fix trigger already requires the actor to already be `is_admin()`/`is_platform_owner()`/`service_role` — that protection is untouched and still the only path to privilege elevation post-signup.

**Deploy ordering:** migration-only, no application code involved, no dependency on anything else in this sequence — confirmed safe to run immediately, same as the original emergency fix. **Status: confirmed run by the user directly following this proposal, in this same session.**

**Open follow-ups / caveats, per explicit instruction:**
1. **This closes a live, currently-exploitable privilege-escalation path via signup** — not a latent/theoretical risk. Found incidentally while doing Follow-up Step 5's Step 1 mapping work; Follow-up Step 5 itself was paused for this and resumes separately.
2. **The `platform_role` column-default gap (`platform_role` was absent from the original insert's column list entirely, relying on an unconfirmed database-level default) is now closed by explicit assignment in this fix, not resolved as a separate open question** — it no longer matters what that column's default is or ever becomes, since this trigger always supplies `'user'` explicitly.
3. **`company_id` assignment at signup remains untraced and explicitly out of scope for this fix** — it was not in the original insert's column list either, is not pulled from metadata (nothing to fix there), but how a new user's company gets assigned at all is a separate, unexamined flow. Noted, not investigated here.
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction — this fix has not been exercised end-to-end (e.g., a real signup attempt) beyond the SQL being confirmed run.
- Follow-up Step 5's original mapping work resumes next, separately.

---

## 2026-07-08 — Follow-up Step 5: `role` vs `platform_role` reconciled — `platform_role` is now the single source of truth for platform-admin authority

**Finding addressed:** architectural, not an active vulnerability at the time of this step (treated with deliberative care per instruction, not rushed). Two different columns on `user_profiles` both gated admin-level access: `role = 'owner'` (checked by `is_admin()`/`is_platform_owner()`, gating the majority of admin-bypass RLS policies across the schema) and `platform_role = 'super_admin'` (checked by `middleware.ts`'s `/admin/*` route gate, and directly by 5 RLS policies). Both were true for the one existing account, so nothing was broken in practice — but the two mechanisms could drift apart the moment a second admin was ever granted.

**Step 1 — complete usage map, confirmed against live data before any decision was made:**
- **22 RLS policies** gated via `is_admin()`/`is_platform_owner()` (i.e., via `role`): `billed_inspections` (×2), `companies` (×3), `company_feature_flags` (×2), all five `crm_*` admin-only tables, `damage_reports`, `inspection_audit_log`, `inspection_custody`, `inspection_photos`, `inspection_queue`, `inspection_snapshots`, `user_profiles` (×2), `vehicle_inspections` (×2).
- **5 RLS policies** gated directly via `platform_role = 'super_admin'` (no function, inline subquery): `account_notes` (×2), `admin_activity_log` (×2), `company_members`.
- **`middleware.ts`** gates all of `/admin/*` on `platform_role`. **`app/admin/users/page.tsx` + `role-actions.ts`'s `updatePlatformRole`** — confirmed to be the *only* admin-granting UI in the entire app, and it exclusively manages `platform_role`; there has never been any UI path to set `role = 'owner'`, only direct SQL. **`auth-context.tsx`'s `isOwnerUser`** (used app-wide) already derives from `platform_role`, not `role` — its own comment notes it was kept for backward compatibility, implying an earlier migration off `role` already happened for this flag specifically.
- **`user_profiles.role` confirmed to have zero other live purpose** — full-repo grep found no application-code reference to it beyond what `is_admin()`/`is_platform_owner()` check server-side. (Distinct from the unrelated `company_members.role`, a separate table backing company-scoped roles — not in scope.)
- This mapping work also directly led to discovering and closing the `handle_new_user()` signup privilege-escalation vulnerability, logged separately above as its own emergency-priority entry.

**Decision (made by the user, not this session):** `platform_role` becomes the single source of truth. `role` stays in the table, untouched and unused going forward — not dropped in this migration, deliberately deferred as a separate, lower-priority future cleanup once nothing references it (including no longer being read by `is_admin()`/`is_platform_owner()` after this fix).

**Interaction with `guard_user_profiles_privilege_columns` (the original emergency-fix trigger), explicitly checked before running anything:** that trigger guards `role`, `platform_role`, and `company_id`, authorizing changes to any of the three only if the acting user already passes `is_admin()`/`is_platform_owner()`/`service_role`. Since that check evaluates the *acting* user's current, already-committed state via a fresh `auth.uid()` lookup — not the `NEW` values being written — the self-service-escalation protection this trigger exists for is unaffected by which column the two functions consult; a non-privileged attacker fails identically before and after. Additionally, and not something originally asked about: this fix closes a related, previously-unnoticed latent bug — `updatePlatformRole` (the admin-granting UI's sole backing function) runs through the session-bound client and was therefore itself subject to this same trigger; under the old `role`-based check, a hypothetical second admin holding only `platform_role = 'super_admin'` would have been blocked by this trigger from using the admin UI to grant access to anyone else. Redefining the two functions to check `platform_role` resolves this automatically, with no change to the trigger itself.

**Sanity check performed before writing anything, mirroring Step 2.5's precedent:** confirmed via live query that the account behind `tysonwhitebusiness@gmail.com` has both `role = 'owner'` and `platform_role = 'super_admin'` — redefining the check would not lock out platform-owner access.

**What changed — migration only, run directly by the user, no application code touched:**
```sql
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND platform_role = 'super_admin'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN public.is_platform_owner();
END;
$function$;
```
`is_admin()` unchanged in shape — still a thin alias delegating to `is_platform_owner()`, per Step 2.5. Only `is_platform_owner()`'s internal condition changed, from `role = 'owner'` to `platform_role = 'super_admin'`. No application code required changes, since every caller invokes these functions by name with an unchanged signature and return type.

**Why this closes the issue:** all 22 previously `role`-gated RLS policies, plus `guard_user_profiles_privilege_columns`, plus every server-side `requireSuperAdmin`/`isPlatformOwnerOrAdmin`/feature-flag check, now agree with `middleware.ts` and the only admin-granting UI on the same single column. A future second admin granted access through the only mechanism that exists to grant it (`app/admin/users/page.tsx`) will now correctly pass every check, everywhere, with no possibility of the split-brain scenario the original background described.

**Deploy ordering:** migration-only, no application code involved, no dependency on anything else in this sequence — confirmed safe to run immediately. **Status: confirmed run by the user directly following this proposal, in this same session.**

**Open follow-ups / caveats:**
- `role` remains in the `user_profiles` table, untouched, per explicit instruction — dropping it is a separate, deliberately deferred future step once full confidence exists that nothing else references it.
- `company_id` assignment at signup remains untraced (noted in the emergency-fix entry above) — unrelated to this step, not investigated here.
- Testing deferred to the end-of-sequence consolidated pass, per standing instruction — not exercised at runtime beyond the SQL being confirmed run and the pre-migration sanity check.

---

## 2026-07-08 — Follow-up Step 6: signup-trigger blind spot closed (verification only, no fix needed)

**Finding addressed:** verification, not a fix. The emergency-fix entry's `company_id`-at-signup caveat was based only on an application-code search (no code path found that legitimately updates `user_profiles.company_id`) — the same class of blind spot that let `is_admin()`'s hardcoded-email bypass go unnoticed originally, since that too was only visible by inspecting the live database directly, not application code. This step closes that gap by inspecting `auth.users`' triggers directly rather than relying on the app-code search alone.

**What was checked:**
```sql
select t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where c.relname = 'users' and n.nspname = 'auth' and not t.tgisinternal;
```

**Result:** exactly one non-internal trigger exists on `auth.users` — `on_auth_user_created`, `tgenabled = 'O'` (actively enabled), calling `handle_new_user()`. This is the same function already fully inspected and fixed in the emergency-priority entry above. Its current definition (post-fix) does not reference `company_id` anywhere in its column list.

**Why this closes the blind spot:** it's not that no application code sets `company_id` at signup — it's now confirmed that no *database trigger* does either, checked directly rather than inferred. A new user's `company_id` is `NULL` at row creation and can only be set by a later, separate `UPDATE`, which `guard_user_profiles_privilege_columns` (the original emergency-fix trigger) already requires the actor to be `is_admin()`/`is_platform_owner()`/`service_role` to perform. No gap found; no fix needed.

**Open follow-ups / caveats:**
- This closes the "`company_id` assignment at signup remains untraced" caveat from the emergency-fix entry — resolved as "no signup-time mechanism exists to trace," not by finding and validating one.
- How a user's `company_id` gets legitimately set *after* signup (the actual onboarding/invite flow) remains unexamined — out of scope for this verification step, which was specifically about the signup-trigger blind spot, not the full onboarding lifecycle.
- Verification-only step, no code or schema changes made.

---

## 2026-07-08 — Follow-up Step 8: Sentry instrumentation for authorization rejections (alert-rule verification still pending — not fully closed out)

**Finding addressed:** observability gap, not a vulnerability — every authorization check built throughout this sequence rejected silently from a monitoring standpoint; a sustained pattern of rejections (e.g., someone probing IDs, or a script hammering the same rejection point) would have been invisible until noticed some other way.

**Step 1 — confirmed existing convention before adding anything new:** `lib/sentry.ts`'s `captureHighSeverityError(error, context?)` was already the established pattern — tags `severity: 'high'`, attaches a `context.details` scope, calls `Sentry.captureException`. Three Sentry config files (client/server/edge) already initialize consistently. Only two prior callers existed (`completeInspection`/`completeFMCInspection` in `usage-actions.ts`), both server-side, both wrapping genuine thrown errors. The function's own doc comment already *describes* the "High Severity Errors" alert rule this step's Step 3 was asking for — but that was documentation of intent, not a confirmed-created dashboard rule.

**What changed:**
- `lib/sentry.ts`: generalized `captureHighSeverityError` into a thin wrapper around a new `captureSecurityEvent(error, severity, context?, fingerprintKey?)`, fully backward-compatible with its two existing callers. Added a `severity: 'medium'` tier and optional per-source `Sentry.setFingerprint()` support — so repeated rejections from the same source (user id, IP) group into one Sentry issue, making a frequency-based alert rule ("N times in M minutes") meaningful *per source* rather than per-check-type-globally.
- `lib/inspection-auth.ts`: `authorizeInspectionAccess` now captures at all three negative-return branches (`inspection_not_found`, `not_authenticated`, `not_authorized`, the latter two fingerprinted by user id where available). `authorizeCompanyAccess` captures at its `not_authenticated` and `not_authorized` branches, same fingerprinting.
- `lib/admin-actions.ts`: `requireSuperAdmin` captures at both its throw points (`not_authenticated`, `not_authorized`), fingerprinted by user id where available.
- `lib/contact-actions.ts`: `submitContactRequest`'s rate-limit rejection now captures via `captureSecurityEvent` at `'medium'` (deliberately not `'high'` — a public form being hit by ordinary bots is expected background noise, not evidence of a breach attempt, and bundling it into the high-severity tag would dilute that signal), fingerprinted by IP — the same IP value already persisted in `contact_requests.ip_address` since Step 11, not a new class of data exposure.
- **The `guard_user_profiles_privilege_columns` database trigger was deliberately left without a Sentry hook.** No legitimate application code path ever attempts the update this trigger rejects — its entire purpose is blocking illegitimate direct API calls that bypass this app's code entirely, so there's no natural `.catch()` to attach a capture to. Recommended against adding an outbound network call (`pg_net`) inside this `SECURITY DEFINER` trigger to reach Sentry directly, given the added risk to an already-sensitive security control for a rejection path that's inherently rare and adversarial. Noted that Supabase's own Postgres logs already capture these `RAISE EXCEPTION` events today (used directly earlier this session), so this isn't fully unobservable, just not proactively alerted — a dedicated log table was offered as optional future follow-up, not implemented here.

**Why this closes the code-side of the issue:** every authorization check built during this remediation sequence (except the one database-trigger exception, explicitly reasoned through above) now emits a Sentry event on rejection, with enough context (resource id, company id, user id where available, a `reason` tag) to investigate without logging anything sensitive beyond what's already persisted elsewhere for the same purpose.

**`tsc --noEmit` passes clean.**

**Step 3 — alert rule: explicitly NOT closed out yet, per instruction.** Two rules are needed, not one: (1) confirming whether the "High Severity Errors" rule already described in `lib/sentry.ts`'s doc comment was ever actually created in the Sentry dashboard (undetermined from code — the user is checking directly), and (2) a second, fingerprint-scoped rule for the new per-source grouping added in this step (recommended threshold: ~5 occurrences in 10 minutes on the `security-event` fingerprint prefix). **If rule (1) turns out not to exist, both rules need to be created, not just the new one.** This is being tracked as a pending sub-item within this same step, not a separate follow-up.

**Open follow-ups / caveats:**
- **Alert-rule verification is pending** — this step is not fully closed until that comes back and both rules (as needed) are confirmed to exist.
- A test rejection was not yet deliberately triggered and confirmed visible in Sentry (Step 4 of the original prompt) — deferred until the alert-rule question above is settled, so both can be verified together rather than in two passes.
- Testing deferred to the end-of-sequence consolidated pass otherwise, per standing instruction.

---

## 2026-07-08 — EMERGENCY: `company_members` self-promotion — any team member could grant themselves company-admin

**Finding addressed, and severity:** Critical, live, and confirmed currently exploitable — discovered during Phase 3 (Authorization & IDOR) of a follow-up full-repo re-audit, while sweeping every `lib/*-actions.ts` file rather than spot-checking. Not part of the original 17-finding audit's list. `company_members`' RLS policies `members_update` and `members_delete` were scoped only by `company_id IN (caller's own companies)` — with no check on the caller's own `role` within that company. `updateCompanyMemberRole(memberId, role)` and `removeCompanyMember(memberId)` in `lib/role-actions.ts`, and `addCompanyMember(companyId, email, role, invitedBy)` in the same file, all wrote via the session-bound client with no in-code authorization check of their own, relying entirely on that RLS policy. Any authenticated member of a company — regardless of their own role — could call `updateCompanyMemberRole(<their own company_members.id>, 'admin')` directly (or, more directly still, `addCompanyMember(companyId, theirOwnEmail, 'admin', theirOwnId)`, which upserts on `(company_id, user_id)` and needs no membership-row id at all) and grant themselves company-admin. The same gap let any member remove or demote other members, including other admins (blocked only from touching the literal `'owner'` role, via a separate pre-existing check).

**Why the existing `company_admin_manage` RLS policy did not cover this:** that policy already existed and already does the correct check — `EXISTS (... cm.role = 'admin')` — but Postgres OR's permissive policies together, and `members_update`/`members_delete` sit alongside it as separate, broader permissive policies. A narrower, correct policy next to a wider, incorrect one is equivalent to the wider one alone; the correct policy was never actually doing anything.

**What was traced before proposing a fix:** confirmed via the complete Phase 3 sweep of all 27 `lib/*-actions.ts` files (not just this one) that `updateCompanyMemberRole`, `removeCompanyMember`, and `addCompanyMember` are the *only* application code paths that write to `company_members` anywhere in the codebase — no other legitimate flow exists that could be broken by tightening the policy or adding the in-code check.

**What changed — code, `lib/role-actions.ts`, `tsc --noEmit` clean:**
- New helper `assertCallerIsCompanyAdmin(companyId)`: resolves the caller's own session server-side (never from a client-supplied argument), returns immediately if `is_platform_owner()`, otherwise looks up the caller's own `company_members.role` for that specific `companyId` via the existing `getUserCompanyRole(userId, companyId)` (from `auth-server-actions.ts` — reused rather than re-implemented, since that function already works around a known RLS/join quirk on self-role lookups), and throws unless that role is `'admin'` or `'owner'`.
- `updateCompanyMemberRole`, `removeCompanyMember`, and `addCompanyMember` all now call this guard before performing their write — `addCompanyMember` was included in this same patch despite not being in the original request, since it's the identical vulnerability (arguably a more direct exploit path, self-upsert without even knowing your own membership row id) in the same file, found while looking at its sibling.
- Added a one-line runtime guard to `updateCompanyMemberRole` rejecting any `role` value other than `'admin'`/`'inspector'` — closes the gap between the `CompanyRole` TypeScript type (which only allows those two values) and what actually gets checked at runtime (nothing, previously — TypeScript types are erased and don't validate a crafted request).

**What changed — RLS migration, handed off for the user to run in the Supabase SQL editor (this session has no direct database execution access):**
```sql
DROP POLICY IF EXISTS members_update ON public.company_members;
CREATE POLICY members_update ON public.company_members
FOR UPDATE TO public
USING (
  EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = company_members.company_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
  OR is_platform_owner()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = company_members.company_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
  OR is_platform_owner()
);

DROP POLICY IF EXISTS members_delete ON public.company_members;
CREATE POLICY members_delete ON public.company_members
FOR DELETE TO public
USING (
  EXISTS (
    SELECT 1 FROM company_members cm
    WHERE cm.company_id = company_members.company_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
  OR is_platform_owner()
);
```
`members_select` was deliberately left untouched — every team member being able to see their own company's roster is normal product behavior; the bug was specifically on the write side.

**Why this closes the issue:** both layers now independently reject the exploit. The in-code check rejects a non-admin caller before any Supabase call is made, regardless of RLS state. The RLS policy independently rejects any write from a non-admin session, regardless of which code path (or a raw API call entirely outside this app) issued it. This matters concretely for this codebase: Supabase's auto-generated REST API is directly reachable by anyone holding a valid anon-key-plus-session JWT — already the normal architecture here, since most of the files audited in Phase 3 call Supabase directly from client-side code with no server action in between at all — so RLS is the actual security boundary, not a backstop the application layer can substitute for.

**Deploy ordering — checked explicitly, not assumed:** both orders are safe (non-breaking to any legitimate flow, per the Phase 3 sweep above), but not equally protective. RLS-first fully closes the vulnerability immediately at both the app layer and the direct-API layer, the moment the migration is applied — a legitimate admin's calls continue to succeed under the still-old code (their own role genuinely satisfies the new check), and a non-admin's write attempt is now excluded by the `USING` clause entirely, which PostgREST reports as zero rows affected rather than a thrown error, so the old code's `if (error) throw` doesn't fire — a silent no-op, confusing but safe. Code-first only closes the in-app exploit path immediately; the direct-PostgREST-API route stays open until the migration also lands. **Recommendation: run the RLS migration first, or simultaneously if achievable — do not ship code first and defer the migration.**

**Legitimate flows confirmed still working:** the Team Members settings page (`app/(app)/settings/members/page.tsx`) already client-side-gates its role-change/remove UI to `platformRole === 'super_admin' || companyRole === 'admin'` — that gate was cosmetic before this fix (the server actions underneath had no matching check) and is now backed by a real one; a genuine admin's session satisfies `assertCallerIsCompanyAdmin` and both new RLS policies, so nothing changes for legitimate use. `tsc --noEmit` passes clean; not yet exercised at runtime beyond that (see Status below).

**Open follow-ups / caveats:**
- **`members_insert` has the identical gap** (feeds `addCompanyMember`) and was deliberately **not** tightened in this fix, per explicit instruction — it has a bootstrapping wrinkle the other two don't: if any code path ever creates a company's *first* membership row through this same end-user-facing policy (rather than through a trusted server-side signup/company-creation flow using the admin client), requiring "caller must already be an admin of this company" would deadlock on company creation. This needs the Phase 7 review of `handle_new_user()` and first-membership provisioning to confirm before it's safe to touch — left exactly as flagged, not silently forgotten.
- `company_admin_manage` is now fully redundant with the fixed `members_update`/`members_delete` (all three express the same admin-role check) — left in place per instruction; harmless, optional future cleanup.
- **Status: code fix written and `tsc --noEmit`-clean; NOT yet deployed to production. RLS migration written and handed off; NOT yet run** — awaiting the user's confirmation after executing it directly in the Supabase SQL editor. Do not treat this entry as closed until both are independently confirmed, consistent with this log's standing practice of distinguishing "proposed" from "confirmed run."
- This entry was logged immediately, out of the normal sequence, given its severity — the fresh full-repo audit that found it is still in progress (currently paused after Phase 3) and will produce its own consolidated findings log separately; this emergency fix is intentionally not folded into that later document.

---

## 2026-07-08 — `NEXT_PUBLIC_OWNER_EMAILS` removed: dead client-bundle exposure, likely the frontend sibling of the Step 2.5 `is_admin()` hardcoded-email bypass

**Finding addressed, and severity:** Low (found during the fresh full-repo audit's Phase 1, Secrets & Exposed Keys) — a `NEXT_PUBLIC_*` environment variable, same category of mistake as the original Anthropic-key incident, shipping a real email address into every client bundle. `lib/auth.ts` read `NEXT_PUBLIC_OWNER_EMAILS` into an `OWNER_EMAILS` array and exposed an `isOwner(user)` function checking membership against it. Severity was rated Low rather than Critical specifically because tracing found it to be dead code — not because the exposure pattern itself is minor.

**What was traced before proposing anything:**
- Every reference to `NEXT_PUBLIC_OWNER_EMAILS` and to `lib/auth.ts`'s `isOwner` confirmed down to exactly one read site (`lib/auth.ts:1`) and one import site (`components/dashboard/dashboard.tsx:6`) — and confirmed, by searching specifically for a call (`isOwner(`) rather than just the import, that the function is **never invoked anywhere in the codebase**. Genuinely dead code, not a live authorization path.
- Distinguished explicitly from an unrelated naming coincidence: `lib/admin-actions.ts`, `lib/feature-flags.ts`, and `lib/inspection-auth.ts` each have a local variable also named `isOwner`, but those are destructured results of `supabase.rpc('is_platform_owner')` calls — a completely different mechanism, not connected to `lib/auth.ts` in any way.
- Actual value confirmed via `.env.local`: a single address, `jeff@conditioniq.com` — a company-domain address, not the personal `@gmail.com` address referenced in the Step 2.5 `is_admin()` entry, so this is not asserted to be the literal same bypass reused, just the same *pattern*.
- **Connection to Step 2.5, stated at the confidence level the evidence actually supports:** `lib/auth.ts` was added in the repository's initial commit (`2026-06-08`) and was never modified again — it predates this entire remediation sequence by about a month. It is the same category of shortcut Step 2.5 removed from `is_admin()` (a hardcoded/env-configured "if your email matches, you're the owner" bypass, superseded by the real `platform_role`/`is_platform_owner()`/`isOwnerUser` mechanism), and Step 2.5's own entry never mentions `lib/auth.ts` or this env var — confirming it was never on that pass's radar. This is presented as a well-supported reading (same pattern, same supersession, one found-and-fixed while the other was missed), not a proven claim of common authorship or timing — there's no way to verify that further, since the database-side `is_admin()` function isn't git-tracked and can't be dated the same way.

**What changed:**
- `lib/auth.ts` deleted entirely — confirmed nothing would be left in the file once `OWNER_EMAILS`/`isOwner` were removed (the file was ten lines, composed of exactly those two things), and confirmed no other file imports from `@/lib/auth` at all.
- `components/dashboard/dashboard.tsx`: removed the single unused import line (`import { isOwner } from '@/lib/auth'`) — no other line in the file changed, since nothing else in it referenced `isOwner`.
- `.env.local`: removed the `NEXT_PUBLIC_OWNER_EMAILS="jeff@conditioniq.com"` line.
- `tsc --noEmit` — clean, exit code 0.

**Why this closes the code-side of the issue:** there is no longer any code path, live or dead, that reads this variable or exposes an email-based ownership check — removing dead code rather than gating it, since nothing depended on it.

**This does NOT close the exposure by itself — stated explicitly, not left implicit:** removing the variable from `.env.local` only stops *this local environment* from having it available to read going forward. The actual exposure — the email address `jeff@conditioniq.com` shipping into the production client JavaScript bundle — is controlled by whatever value is configured in **Vercel's Production environment variables** (and Preview, if set there too), which this session has no access to read or change. **The user still needs to manually delete `NEXT_PUBLIC_OWNER_EMAILS` from Vercel's Production (and Preview) environment variables and redeploy** before this is actually closed. Until that happens, the variable and the email address in it continue to be available to Vercel's build process regardless of what this local `.env.local` or the codebase itself contains.

**Legitimate flows confirmed still working:** N/A — no callers existed to verify, consistent with this being confirmed dead code before anything was removed. `tsc --noEmit` is the only verification performed.

**Deploy ordering:** code-only change from this session's side; no migration involved. The Vercel environment-variable removal is a separate, manual action with no ordering dependency on the code change — either can happen first, but the exposure isn't closed until both the code no longer reads it (done) and Vercel no longer has it configured (pending).

**Open follow-ups / caveats:**
- **Status: code change confirmed made and `tsc --noEmit`-clean in this session. NOT yet deployed. The Vercel Production (and Preview, if applicable) environment variable removal is NOT done and cannot be confirmed or performed from this session — this is a pending manual action for the user.** Do not treat this entry as fully closed until that removal is confirmed.
- The exposed value, for the record: `jeff@conditioniq.com`.
- Logged as its own entry per instruction, connecting it explicitly to Step 2.5 as detailed above rather than treating it as unrelated, but without overclaiming a proven link beyond what the evidence (timing, pattern, supersession) actually supports.

---

## 2026-07-09 — EMERGENCY: orphaned and unchecked `SECURITY DEFINER` RPC functions, directly callable by anyone with the anon key

**Finding addressed, and severity:** Critical, live, confirmed exploitable — discovered while pausing the schema/migration-drift documentation project to inventory every live database function (`pg_proc`), triggers, and RLS policies against the tracked `supabase/migrations/*.sql` files. That inventory surfaced 27 functions total in the `public` schema, none of which had ever been captured in a tracked migration — and among them, an entirely separate, previously-unknown guest-inspection RPC system, plus a handful of other functions never referenced anywhere in this remediation sequence or the fresh audit that preceded it.

**What was traced before proposing anything:**
- Full bodies pulled for every function that wasn't already understood from prior work in this sequence.
- **`submit_remote_inspection(p_token, ...)`** — given only a valid, unexpired, unused `inspection_requests.token`, inserts a complete `vehicle_inspections` row directly with `status: 'completed'`, `report_generated: true`, and arbitrary caller-supplied VIN/year/make/model/odometer/location plus all six JSONB condition-data blobs (exterior/interior/engine/vehicle_function/bol/keys/documentation) — bypassing chain-of-custody, GPS, signature, photo hashes, device fingerprinting, and every company-staff check this entire remediation sequence built into the TypeScript guest-authorization layer (`lib/inspection-auth.ts`, Step 3a/3b). **`create_remote_inspection(p_token, p_anon_user_id)`** shares the same token-only gate and additionally accepts a caller-supplied `p_anon_user_id` with no check it matches the actual calling session, an independent identity-spoofing gap. **`finalize_remote_inspection(p_token)`** takes only a token, no inspection ID, no ownership check — marks a dispatch token used, letting anyone who learns a token grief a legitimate recipient by burning it first. **`get_inspection_request(p_token)`** is the same family, lower severity (read-only, returns nothing beyond what a token holder is already entitled to see).
- **`reset_billing_cycles()`** — no parameters, resets every eligible company's `reports_used` to 0 and advances `billing_cycle_start` by 30 days in one call, for every company whose cycle has elapsed (excluding `demo`/`enterprise` tiers).
- **`get_next_invoice_number(p_company_id)`** — increments and returns `companies.invoice_number_seq` for the given `p_company_id`, with no check the caller belongs to that company.
- **`can_inspect_location`, `get_user_company`, `get_user_role`, `is_user_admin`** — a second, unrelated architectural problem: all four check `user_profiles.role`, the pre-reconciliation column (`is_user_admin()` checks `role = 'admin'` specifically, a value distinct from `role = 'owner'`, so it is very likely permanently `false` even for the real owner). Not referenced by any live RLS policy or trigger (confirmed against the complete policy/trigger inventory). Deliberately **not** touched in this fix, per instruction — queued separately as a lower-priority architectural cleanup, since all four are already de-facto safe (internally gated on `auth.uid()`, returning nothing for an unauthenticated caller).
- **Reachability, confirmed for every one of the above, not assumed:** queried `EXECUTE` privilege for `anon` and `authenticated` on literally all 27 functions in the `public` schema, not just the ones that stood out. `anon` and `authenticated` both showed `true` on every single one — including 9 functions with `RETURNS trigger`/`RETURNS event_trigger`, which are noted but not treated as part of the risk surface, since Postgres structurally refuses to invoke a trigger-type function outside its bound trigger context regardless of grants.
- **Legitimate-caller determination, done exhaustively rather than per-function:** searched for every `.rpc(...)` call site in the entire application codebase (not just the specific function names in question, to rule out a dynamically-constructed call). The complete list of RPC functions the application ever calls is exactly four: `is_platform_owner`, `is_admin`, `get_next_invoice_number`, `get_inspection_by_share_token`. This conclusively confirmed `create_remote_inspection`/`finalize_remote_inspection`/`submit_remote_inspection`/`get_inspection_request` are orphaned — the same shape as the `inspection-photos` bucket in Step 6, live and reachable but zero application dependents.
- **`reset_billing_cycles`'s legitimate caller confirmed via `cron.job`:** a `pg_cron` entry, `reset-billing-cycles`, scheduled daily at midnight, calling `SELECT reset_billing_cycles()`. This caller invokes the function directly in-database, under the cron job's own role — entirely separate from the `anon`/`authenticated` grants that govern PostgREST's REST API surface. Revoking those grants does not affect this scheduled invocation.
- **`get_full_inspection`, `update_inspection_summary`** — confirmed **not** `SECURITY DEFINER` (unlike every other function in this list). They run with the calling role's own privileges, so ordinary RLS on `vehicle_inspections`/`damage_reports`/`inspection_photos` applies exactly as if the caller issued the equivalent query directly — since the anonymous-bypass policies were already dropped in Step 3b, an anon or unrelated caller gets nothing back from either, despite both also being orphaned (no application caller) and also showing `anon`/`authenticated` `EXECUTE = true`. Left untouched — not part of this fix, since they present no privilege-escalation path regardless of grants.

**What changed — migration `supabase/migrations/20260709000000_lock_down_orphaned_and_unchecked_rpc_functions.sql`, handed off for the user to run directly in the Supabase SQL editor (this session has no direct database execution access), and additionally captured as a tracked migration file (a deliberate first step toward the paused documentation project's own goal, rather than adding an eighth untracked ad hoc change):**
- `REVOKE EXECUTE ... FROM anon, authenticated` on `create_remote_inspection`, `finalize_remote_inspection`, `submit_remote_inspection`, `get_inspection_request` — fully closes the orphaned guest-inspection RPC family, with zero legitimate caller to preserve.
- `REVOKE EXECUTE ... FROM anon, authenticated` on `reset_billing_cycles` — closes the zero-auth billing-cycle-reset path without affecting the legitimate `pg_cron` invocation.
- `get_next_invoice_number` redefined with an added caller-authorization check (`EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND company_id = p_company_id) OR is_platform_owner()`, raising an exception otherwise) before its existing logic — the only one of the three fixes that couldn't be a blanket revoke, since it has three real, currently-authenticated call sites (`invoice-actions.ts`, `invoice-group-actions.ts`, `bulk-invoice-actions.ts`) that needed to keep working. `anon`'s grant is additionally revoked on top of the new check, since nothing legitimate ever calls it unauthenticated.
- `can_inspect_location`/`get_user_company`/`get_user_role`/`is_user_admin` deliberately **not** touched in this migration, per instruction — queued separately as a lower-priority architectural cleanup item, not urgent.
- `tsc --noEmit` — clean, exit code 0 (expected: zero application code touched by this fix).

**Why this closes the issue:** the four orphaned functions and `reset_billing_cycles` can no longer be invoked by anyone via `supabase.rpc(...)` or a raw PostgREST call, closing every zero-authentication path this finding covers, without affecting the one legitimate caller (`pg_cron`) that doesn't use that access path in the first place. `get_next_invoice_number` now independently verifies the caller's own company membership (or platform-owner status) before mutating anything, closing the arbitrary-`company_id` gap while its three real callers continue to behave identically.

**Deploy ordering — checked explicitly, not assumed:** pure database-only change, zero application code touched. No ordering constraint of any kind — safe to run immediately, in any order relative to anything else in flight.

**Legitimate flows confirmed still working:** the three real `get_next_invoice_number` callers all invoke it via the authenticated session client using the caller's own actual `company_id`, which will always satisfy the new check — confirmed by re-reading all three call sites, not assumed from the fix's shape alone. `reset_billing_cycles`'s `pg_cron` schedule is unaffected, confirmed via the mechanism explanation above (grants revoked govern a different access path than the one the cron job actually uses). No other legitimate caller exists for any of the other four functions to potentially break.

**Open follow-ups / caveats:**
- **Status: migration file written and committed to the repo; `tsc --noEmit` confirmed clean. NOT yet run against the live database** — awaiting the user's confirmation after executing it directly in the Supabase SQL editor. Do not treat this entry as closed until that's confirmed.
- `can_inspect_location`, `get_user_company`, `get_user_role`, `is_user_admin` remain open, queued on the batch-fix backlog as a lower-priority architectural cleanup (stale `role`-column checks, redundant with `is_platform_owner()`/`get_my_company_id()`) — not urgent, since all four are already de-facto safe today.
- This finding was discovered specifically because the schema/migration-drift documentation project's Step 1 inventory pulled every function's definition rather than assuming the ones already known about (from this sequence's own history) were the complete list — the same discipline `SECURITY_CHECKLIST.md` item 9 now documents ("if something looks broken, check whether it's actually reachable/used... conversely, don't assume something is safe just because it looks unused — confirm with a real search, not a guess").
- The schema/migration-drift documentation project itself remains paused, resuming at its own Step 2 once this migration is confirmed run.

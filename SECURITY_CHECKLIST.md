# CIQ Security Checklist

Read this before writing or approving any code that touches auth, RLS, storage policies, or the admin/service-role Supabase client. Built from patterns that actually recurred multiple times across this codebase's security remediation history — not generic best practices, specific failure modes this app has hit repeatedly.

---

## Before writing any new server action or database function

**1. Does this use `createAdminClient()` (service role)?**
If yes: the function's own code is the *only* protection — RLS does not apply. Ask explicitly: what stops a caller from passing in someone else's ID/company/inspection?
- This exact gap (admin client, zero ownership check) was found and fixed independently in: `lot-server-actions.ts`, `invoice-actions.ts`, `bulk-invoice-actions.ts`, `dispatch-actions.ts`, `vehicle-events-actions.ts`, `contact-actions.ts`, `admin-actions.ts`, `branding-actions.ts`, `admin-activity-actions.ts`, `billing-notification-actions.ts`. It is the single most-repeated bug in this app's history. Assume any new admin-client function has this bug until proven otherwise.
- Fix pattern: reuse `authorizeInspectionAccess()` or `authorizeCompanyAccess()` from `lib/inspection-auth.ts`, or `requireSuperAdmin()` from `lib/admin-actions.ts` — don't invent a new check unless none of these fit.

**2. Does this check "is this caller staff of the company" when it should check "is this caller specifically an admin"?**
`authorizeCompanyAccess()` checks company membership at *any* role — it does not check admin-vs-regular-staff. If a UI hides a feature behind `isOwnerUser || companyRole === 'admin'`, the backing server action needs that same role check, not just company membership. This gap was found in `lot-server-actions.ts` and `contact-actions.ts` — a client-side "admin only" gate with a server action that only checks company membership underneath. Check both layers agree.

**3. Does this write to a privilege-relevant column?**
`role`, `platform_role`, `company_id` on `user_profiles`, and `role` on `company_members` are all protected by database triggers (`guard_user_profiles_privilege_columns`, and the RLS-level fix on `company_members`). If you're adding a new column that gates access to something (a new role field, a new permission flag), it needs the same column-level protection — RLS alone only restricts *which row*, not *which column*, so a self-service `UPDATE` can silently escalate privilege unless a trigger or explicit check stops it.

**4. Is this reachable by an anonymous/guest session (a token-based flow, not a logged-in user)?**
Guest sessions have no `user_profiles` row. Any check based on `auth.uid()` alone will silently reject or silently misbehave for guest sessions. The correct pattern is checking for a valid, non-expired token tied to the right company/resource — see `hasValidGuestToken()` in `lib/inspection-auth.ts`. Do not assume a fix that works for logged-in staff also works for the guest flow without tracing it specifically — this exact assumption broke resume/cancel/start-fresh once already (Step 3b) and needed a full redesign.

**5. Does the bucket/table this touches actually have RLS backing it, or is app-code the only protection?**
Some tables/buckets in this schema have zero RLS policies by design (private, admin-client-only). Others have real RLS as a second layer. Know which one you're touching — if there's no RLS backstop, an app-code mistake is the *only* thing standing between "authorized" and "anyone with the anon key," not a defense-in-depth layer on top of a real boundary.

---

## Before approving any migration

**6. What's the deploy order?**
Don't assume code-first or migration-first is safe by default — check explicitly. A column-dependent write shipping before its column exists can turn a silent bug into a loud, user-facing failure. A migration dropping a policy before new code replaces its protection can open a window of exposure. State the correct order explicitly every time, the same way every migration in this app's remediation history required it to be checked, not assumed.

**7. Does this table have any known naming/schema surprises?**
This schema has repeatedly turned out to differ from what application code assumed — `inspection_id` vs `report_id`, `company_id` vs `fmc_account_id`, `completed_at` vs `signed_at`. Before writing a query against a table you haven't directly queried the live schema for recently, confirm the actual column names rather than trusting what the calling code assumes.

---

## Before calling a "fix" done

**8. Trace the actual callers, don't assume they match a similar function you already fixed.**
Multiple fixes in this app's history initially assumed a sibling function's callers matched a function already fixed nearby — and the assumption was wrong often enough that "trace it explicitly" became a standing rule. Two visually similar functions in the same file can have completely different reachability (one staff-only, one guest-reachable).

**9. If something looks broken, check whether it's actually reachable/used before treating it as urgent.**
Several "critical-looking" findings in this app's history turned out to be dead code with zero live impact (unused buckets, unused columns, unused functions) — confirm actual usage before escalating severity. Conversely, don't assume something is safe just because it looks unused — confirm with a real search, not a guess.

**10. Testing is not optional just because the code review was thorough.**
This app's history includes multiple cases where a carefully-reasoned, code-reviewed fix still needed correction once actually traced end-to-end or tested against real data. Code review catches most things; it does not catch everything a real test run would.

---

*This file should be updated as new recurring patterns emerge — it's a living document, not a one-time artifact.*

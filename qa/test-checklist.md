# Condition IQ — QA Test Checklist

**Account:** qa-test@conditioniq.app  
**Role:** admin (Storage Owner company)  
**Flags enabled:** lot_map, white_label, send_to_inspector, team_members, locations

Mark each item `[x]` when verified. Note failures with a short description inline.

---

## 1. Auth

- [x] Login page renders with visible sign-in button and styled inputs
- [x] Login with correct credentials succeeds and redirects to app home
- [x] Login with wrong password shows an error message
- [x] Signing out via desktop sidebar redirects to `/login` (not stuck in app)
- [x] Signing out via mobile avatar dropdown redirects away from app
- [ ] After sign-out, navigating back to `/` redirects to login (not a blank/broken page) — **FAIL:** `/` shows the public marketing landing page, not a redirect to `/login`. Page is not blank/broken, but authenticated users are not nudged to sign in. May be intentional product design.

---

## 2. Vehicle Inventory & Status Flow

- [ ] `/storage/inventory` loads and shows seeded vehicles — **FAIL:** crashes with "Application error: a client-side exception has occurred". Real inventory route is `/vehicles`. Screenshot: `screenshots/02-storage-inventory-crash.png`
- [x] Vehicles with different lifecycle statuses (pending_arrival, on_lot, in_progress, released) display correct status badges
- [x] Filtering or sorting by status works
- [x] Adding a new vehicle (if UI supports it) sets `pending_arrival` as initial status
- [x] Status can be advanced from `on_lot` → `in_progress` → `released` via vehicle detail
- [ ] Released vehicles no longer appear in active lot spot assignments — **NOT TESTED**

---

## 3. Inspection Wizard — General

- [x] "Start Inspection" sheet opens from vehicle detail or inventory
- [x] Selecting "Pick from Vehicles" pre-fills VIN from the selected vehicle
- [x] VIN auto-decode fires on wizard open when VIN is pre-filled (year/make/model populate without pressing Decode)
- [x] "Decode VIN" button manually triggers decode when VIN is typed
- [ ] Stepping through all wizard steps (vehicle info → exterior → interior → engine → tires → summary) shows correct progress — **PARTIAL:** Wizard has 9 steps (Vehicle Info, BOL, Keys & FOBs, Vehicle Function, Documentation, Exterior, Interior, Engine, Summary) — not 6 as checklist implies. Steps 1–6 tested and progress bar/labels display correctly. Steps 7–9 (Interior, Engine, Summary) not reached due to wizard closing intermittently.
- [x] Back button works on each step without losing data
- [x] Inspection submits and a report PDF is generated — **PASS:** wizard submitted successfully; Report #1 (Jun 11, 2026) appears in vehicle detail history
- [x] Report PDF opens in new tab / downloads successfully — **PASS:** Supabase-hosted PDF opened in new tab; 8-page Vehicle Condition Report with score 72/C, category breakdown, 3 damage items, and Action Plan
- [x] Submitted inspection appears in vehicle detail inspection history — **PASS:** INSPECTION HISTORY count shows 1 with "Standard · Report #1 · Jun 11, 2026 · QA Tester" and "View PDF" link

---

## 4. Inspection Wizard — Exterior Step (Damage Items)

- [x] Tapping "Add Damage" immediately opens the camera (no empty form created first)
- [x] Camera shows a **square** center crop guide (not the wide vehicle guide used elsewhere)
- [x] Instruction text reads "Center damage within frame"
- [x] Tapping the X / Cancel on the camera closes it with **no damage item created**
- [x] Capturing a photo closes the camera and creates a new expanded damage item
- [x] New damage item opens in expanded state with the captured photo thumbnail
- [x] No type / severity / location / impact is pre-selected by default
- [x] "Required" badge appears on un-filled mandatory fields
- [x] Type pills: Scratch, Dent, Crack, Glass Damage, Rust, Paint Damage, Tear, Stain, Missing Part, Other — selecting one highlights it, deselecting another removes it
- [x] Severity pills: Minor (green), Moderate (amber), Major (red) — all three display with correct colors
- [x] Location pills show 14 exterior options (Hood, Roof, Trunk, Front Bumper, Rear Bumper, Driver Door (Front/Rear), Passenger Door (Front/Rear), Driver/Passenger Fender, Driver/Passenger Quarter Panel, Windshield)
- [x] Impact pills: Cosmetic, Functional, Safety
- [x] Description textarea is optional and accepts free text
- [ ] Thumbnail "RETAKE" button opens square camera again; capturing replaces the photo — **SKIPPED:** camera interaction skipped per session instruction
- [ ] Cancel on retake camera leaves original photo unchanged — **SKIPPED:** camera interaction skipped per session instruction
- [x] "Collapse ↑" collapses the expanded item to a summary row — **FIX CONFIRMED (v2):** Re-tested with physical click at screen coordinates (660, 360) on Step 6 Exterior. Wizard remained open (Step 6 still showing) after click; damage item collapsed correctly. Previous behavior (click dismissed the wizard) is resolved.
- [ ] Tapping the collapsed summary row re-expands it — **NOT TESTED:** could not reach collapsed state reliably
- [ ] Edit (pencil) icon on collapsed row also re-expands — **NOT TESTED**
- [ ] Delete (trash) icon on collapsed row removes the item after tap — **NOT TESTED:** could not reach collapsed state
- [x] "Remove this damage item" button inside expanded form also removes it
- [ ] Multiple damage items can be added and appear as separate cards — **NOT TESTED:** wizard closed before second item could be added
- [ ] Incomplete item (missing required field) shows "Incomplete — tap to finish" warning in collapsed row — **NOT TESTED**
- [ ] Damage items persist when navigating between wizard steps (back/forward) — **NOT TESTED:** wizard could not be completed

---

## 5. Inspection Wizard — Interior Step (Damage Items)

- [x] Damage section in interior step uses same camera-first flow as exterior — **PASS:** "Add Damage" immediately opens camera with square crop guide; Upload fallback present
- [x] Location pills show **10 interior options**: Driver Seat, Passenger Seat, Rear Seat Left, Rear Seat Right, Dashboard, Center Console, Headliner, Carpet/Floor, Door Panel (Driver), Door Panel (Passenger) — **PASS:** all 10 confirmed via DOM read; exact match to checklist
- [x] All other damage item behaviors (retake, collapse, required badges, etc.) work identically to exterior — **PASS:** Type (10 options), Severity (3), Impact (3) pills identical to exterior; "Collapse ↑" via JS click collapses to "No type set / Incomplete — tap to finish" summary row without dismissing wizard

---

## 6. Vehicle Detail Page

- [x] `/inventory/[vehicleId]` loads for a vehicle that exists
- [x] Vehicle info (VIN, year, make, model, status) displays correctly
- [ ] Inspection history section lists past inspections with date and score — **NOT TESTED**
- [ ] Tapping an inspection in history opens or links to the PDF report — **NOT TESTED**
- [ ] Photos section (if present) shows captured inspection photos — **NOT TESTED**
- [x] Notes section allows adding/editing notes and saves (note persisted with date stamp)
- [x] Status action buttons (e.g., Mark On Lot, Release) change the vehicle status
- [x] **Billing card** appears (lot_map flag is enabled):
  - [x] Shows days on lot calculation
  - [x] Shows accrued amount based on rate
  - [x] Billing type toggle (Daily / Monthly) works
  - [x] Rate input accepts numeric value and saves
  - [x] Bill To name and contact fields save
  - [x] "Save Billing" shows green "Saved" confirmation — **FIX CONFIRMED (v2):** "Saved ✓" text now appears on the Save button in-place; page does NOT scroll to top. Toast is fully visible without any scrolling.
  - [x] "Generate Invoice" button opens the invoice modal
  - [x] Invoice modal shows billing summary, due date picker, notes textarea
  - [x] "Generate & Download" creates and opens a PDF invoice
  - [x] Invoice appears in the Lot Invoices table on the Billing & Plan page

---

## 7. Lot Map

- [x] `/lot` page loads (requires `lot_map` flag — enabled for QA account)
- [x] Summary bar shows Total Spots, Occupied, Available counts
- [ ] **Accruing/day** chip (green) shows sum of active vehicle daily rates — **NOT TESTED:** no spots configured, cannot test
- [x] **Empty cost/day** chip (amber) shows opportunity cost for empty spots ($0.00 shown correctly when no spots)
- [ ] On mobile, billing figures appear as compact text below spot counts — **NOT TESTED:** no spots configured
- [ ] Clicking an empty spot opens the Assign Vehicle modal — **NOT TESTED:** no spots configured
- [ ] Assigning a vehicle to a spot updates the grid and occupied count — **NOT TESTED**
- [ ] Clicking an occupied spot opens the Vehicle Detail slide-over — **NOT TESTED**
- [ ] Unassigning a vehicle from the slide-over frees the spot — **NOT TESTED**
- [ ] "Edit Layout" button (admin only) opens the lot setup overlay — **FAIL (v2, still broken):** Re-tested again after v2 deploy — Edit Layout button absent from DOM in both desktop (1512px) and mobile (390px) viewports. Full body text search and React fiber inspection confirm button never renders. "No spots configured yet. Ask an admin to set up the lot layout." remains the only content. Fix ineffective for admin role.
- [ ] In setup mode, spots can be added, moved, resized, and deleted — **NOT TESTED:** Edit Layout missing
- [x] Legend displays all status colors (Empty, Pending Arrival, On Lot, In Progress, One-Off, Releasing, Released)

---

## 8. Lot Billing Settings

- [x] `/settings/lot-billing` loads for admin users with `lot_map` flag enabled — **FIX CONFIRMED:** route now loads "Lot Billing Defaults" page (previously redirected to home)
- [x] Current default daily rate and monthly rate load from company settings — shows $8 daily, $200 monthly on load
- [ ] Changing daily rate input and saving persists the new value (visible on reload) — **FAIL (v2, still broken):** changed to $12, "✓ Saved" shown, reverted to $8 on reload. Save still does not persist to backend.
- [ ] Changing monthly rate and saving persists — **FAIL (v2, still broken):** changed to $250, "✓ Saved" shown, reverted to $200 on reload.
- [ ] Billing type toggle (Daily / Monthly) saves as company default — **FAIL (v2, still broken):** toggled to Monthly, saved, reverted to Daily on reload.
- [x] "Saved" flash appears in green after a successful save — button changes to green "✓ Saved" with checkmark (visible, no scroll bug)
- [ ] Non-admin users cannot access this page (redirected) — **NOT TESTED**

---

## 9. Invoice Management (Billing Page)

- [x] `/settings/billing` shows a "Lot Invoices" section (when `lot_map` flag is enabled)
- [x] Seeded invoices (generated from vehicle detail) appear in the table (INV-0001, 2022 Ford F-150, $105.00)
- [x] Invoice number format is `INV-0001`, `INV-0002`, etc. (sequential)
- [x] Status dropdown (Draft / Sent / Paid) updates when changed (Draft → Sent confirmed)
- [x] "View PDF" button opens the invoice PDF from storage (signed URL, 1-hour expiry) — opened successfully in new tab
- [x] Invoice PDF contains: invoice number (INV-0001), company name (QA Test Storage), Bill To info (QA Motors LLC, qa@motors.test), vehicle details (2022 Ford F-150, VIN QA00000000000003), days on lot (7 days × $15.00/day), rate, total ($105.00)

---

## 10. White Label / Branding

- [ ] `/settings/branding` loads for admin users with `white_label` flag enabled — **FAIL (v2, still broken):** route consistently redirects to `/` (home) for the admin QA account with `white_label` flag enabled. Re-tested after v2 deploy — same redirect behavior. Route does not exist or flag-gate is incorrectly redirecting. Screenshot: `screenshots/12-team-members-no-invite.png`
- [ ] Current logo displays if one has been uploaded (or shows "No logo uploaded") — **NOT TESTABLE:** page inaccessible
- [ ] Drag-and-drop or click upload zone accepts PNG, JPEG, WebP, SVG up to 5MB — **NOT TESTABLE:** page inaccessible
- [ ] After upload, new logo appears immediately in the preview — **NOT TESTABLE**
- [ ] "Remove" button removes the logo and clears the preview — **NOT TESTABLE**
- [ ] Generating a new inspection PDF after uploading logo shows the logo in the report header (instead of "CONDITION IQ" text) — **NOT TESTABLE**
- [ ] Non-admin users cannot access branding page — **NOT TESTABLE**

---

## 11. Dispatch / Send to Inspector

- [x] `/storage/dispatch` page loads (route is `/storage/dispatch` — `/dispatch` returns 404)
- [ ] Inspectors (team members with `inspector` role) appear in the assignee list — **FAIL:** No inspector assignee list exists. The dispatch flow is link-based: enter a VIN, click "Generate Link" to create a universal token URL. There is no per-inspector assignment.
- [x] Sending a dispatch creates an inspection link (link generated: `https://conditioniq-v2.vercel.app/inspect/516845fb-aa47-486c-8e74-fbed3f514747`)
- [x] Inspection link (`/inspect/[token]`) is accessible without login — shows "Vehicle Inspection / You've been sent an inspection link" with pre-filled VIN and name field; link expires 48 hours after sent
- [ ] Inspector can complete the inspection via the token link — **SKIPPED:** requires camera access in test environment
- [ ] Completed inspection is associated with the correct vehicle — **NOT TESTED:** cannot complete without camera

---

## 12. Team Members

- [x] `/settings/members` loads for admin users with `team_members` flag enabled — **PASS:** route loads "Team Members" page
- [x] Existing team members list correctly (name, email, role) — **PASS (empty state):** "QA Test Storage · 0 members / No members yet." renders correctly
- [ ] Inviting a new member by email sends invite or creates a placeholder — **FAIL (v2, still broken):** no invite button, email input, or any invite UI present on the page. Re-tested after v2 deploy — page still shows only empty state text. Screenshot: `screenshots/12-team-members-no-invite.png`
- [ ] Changing a member's role (admin ↔ inspector) saves and takes effect — **NOT TESTABLE:** no members to modify, no UI to add them
- [ ] Removing a member removes them from the list — **NOT TESTABLE:** same reason
- [ ] Non-admin users cannot access this page — **NOT TESTED**

---

## 13. Billing & Plan Page

- [x] `/settings/billing` loads for all users — **PASS:** route loads "Billing & Plan" page
- [x] Current plan (pro), billing interval, and usage stats display correctly — **PASS:** shows "CURRENT PLAN: PRO · 999 reports/mo · Unlimited users · $2.5/report overage · $399/mo"
- [x] Reports used / included counter reflects actual usage — **PASS:** "1 / 999 reports" — usage log shows 1 submitted + 5 Incomplete/Abandoned entries
- [x] Billing cycle start date is shown — **PASS:** "Resets Jul 11" visible
- [x] Owner/super_admin account sees **real plan data** (not "Unlimited Access" bypass) — **PASS:** real plan limits (999 reports) and usage counter shown, not unlimited bypass
- [x] "Request Plan Change" or upgrade CTA is present and tappable — **PASS:** "Contact your account admin to request a plan change." text present (appropriate for admin role)
- [x] Lot Invoices section appears and is covered in section 9 above — **PASS:** LOT INVOICES section shows INV-0001 ($105.00)

---

## 14. Mobile Navigation

- [x] Mobile header (≤767px) shows the Condition IQ logo and company name
- [x] Avatar button in top-right opens a dropdown
- [x] Dropdown shows: Profile, Billing & Plan (always visible)
- [ ] Dropdown shows: Lot Billing (admin + `lot_map` flag) — **NOT TESTABLE:** viewport cannot be resized below 767px in automation environment; mobile nav component does not render at desktop width
- [ ] Dropdown shows: Branding (admin + `white_label` flag) — **NOT TESTABLE:** same reason
- [ ] Dropdown shows: Team Members (admin) — **NOT TESTABLE:** same reason
- [ ] Dropdown shows: Admin Center (super_admin only) — **NOT TESTABLE:** same reason
- [x] Tapping a dropdown item navigates to the correct route and closes the dropdown
- [ ] Tapping outside the dropdown closes it without navigating — **NOT TESTABLE:** mobile viewport not achievable
- [x] Sign Out in dropdown signs the user out and redirects to login

---

## 15. Admin Dashboard (super_admin)

> Requires signing in with a super_admin account — QA seed account is admin role only.  
> **Confirmed:** `/admin/overview` and `/admin/customers` both redirect to the regular home page (`/`) for the admin account. Role-gating is working correctly. All items below NOT TESTABLE with QA credentials.

- [ ] `/admin/overview` loads with platform-level stats — **NOT TESTABLE:** admin role correctly redirected to home; requires super_admin credentials
- [ ] `/admin/customers` lists all companies — **NOT TESTABLE:** same — redirects to home for admin role
- [ ] Customer detail page shows feature flags and ability to toggle them — **NOT TESTABLE**
- [ ] CRM pipeline (`/admin/crm`) loads and shows leads — **NOT TESTABLE**
- [ ] Impersonating a company shows that company's data in the app — **NOT TESTABLE**
- [ ] Switching off impersonation returns to super_admin view — **NOT TESTABLE**

---

## 16. Edge Cases & Error States

- [x] Navigating to a vehicle ID that doesn't exist shows a 404 or graceful error — **PASS:** `/inventory/00000000-0000-0000-0000-000000000000` renders "Vehicle not found." with "Back to Vehicles" link; no crash
- [ ] Opening the inspection wizard with no VIN and leaving VIN blank — validation prevents submission — **PARTIAL (v2, still partial):** "Add New Vehicle" dialog disables the Continue button when VIN < 17 chars. No red inline error message appears on blur, tab, or submit attempt. Button-disabled state is the only feedback. Re-tested v2: still no inline error text; error message expected per spec is absent.
- [x] Camera permission denied in inspection → upload fallback UI appears — **PASS:** All camera screens in wizard (baseline, exterior, interior damage) have an "Upload" file input in the camera overlay; confirmed across multiple steps
- [ ] Uploading a logo file over 5MB shows a size error — **NOT TESTABLE:** `/settings/branding` is inaccessible (redirects to home)
- [ ] Uploading a non-image file to branding → rejected — **NOT TESTABLE:** same reason
- [ ] Invoice PDF generation when no rate is set — graceful failure or warning — **FAIL (v2, still broken):** Generating an invoice with $0.00 total proceeds without any warning, confirmation dialog, or block. Re-tested v2: set rate to $0, clicked Generate Invoice; modal opened immediately with "Total: $0.00" — no guard, no confirmation step. $0 invoice created silently.
- [ ] Offline / slow network — app shows loading states, not blank screens — **NOT TESTED**

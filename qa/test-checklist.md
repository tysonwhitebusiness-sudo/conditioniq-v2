# Condition IQ — QA Test Checklist

**Account:** qa-test@conditioniq.app  
**Role:** admin (Storage Owner company)  
**Flags enabled:** lot_map, white_label, send_to_inspector, team_members, locations

Mark each item `[x]` when verified. Note failures with a short description inline.

---

## 1. Auth

- [ ] Login page renders with visible sign-in button and styled inputs
- [ ] Login with correct credentials succeeds and redirects to app home
- [ ] Login with wrong password shows an error message
- [ ] Signing out via desktop sidebar redirects to `/login` (not stuck in app)
- [ ] Signing out via mobile avatar dropdown redirects away from app
- [ ] After sign-out, navigating back to `/` redirects to login (not a blank/broken page)

---

## 2. Vehicle Inventory & Status Flow

- [ ] `/storage/inventory` loads and shows seeded vehicles
- [ ] Vehicles with different lifecycle statuses (pending_arrival, on_lot, in_progress, released) display correct status badges
- [ ] Filtering or sorting by status works
- [ ] Adding a new vehicle (if UI supports it) sets `pending_arrival` as initial status
- [ ] Status can be advanced from `on_lot` → `in_progress` → `released` via vehicle detail
- [ ] Released vehicles no longer appear in active lot spot assignments

---

## 3. Inspection Wizard — General

- [ ] "Start Inspection" sheet opens from vehicle detail or inventory
- [ ] Selecting "Pick from Vehicles" pre-fills VIN from the selected vehicle
- [ ] VIN auto-decode fires on wizard open when VIN is pre-filled (year/make/model populate without pressing Decode)
- [ ] "Decode VIN" button manually triggers decode when VIN is typed
- [ ] Stepping through all wizard steps (vehicle info → exterior → interior → engine → tires → summary) shows correct progress
- [ ] Back button works on each step without losing data
- [ ] Inspection submits and a report PDF is generated
- [ ] Report PDF opens in new tab / downloads successfully
- [ ] Submitted inspection appears in vehicle detail inspection history

---

## 4. Inspection Wizard — Exterior Step (Damage Items)

- [ ] Tapping "Add Damage" immediately opens the camera (no empty form created first)
- [ ] Camera shows a **square** center crop guide (not the wide vehicle guide used elsewhere)
- [ ] Instruction text reads "Center damage within frame"
- [ ] Tapping the X / Cancel on the camera closes it with **no damage item created**
- [ ] Capturing a photo closes the camera and creates a new expanded damage item
- [ ] New damage item opens in expanded state with the captured photo thumbnail
- [ ] No type / severity / location / impact is pre-selected by default
- [ ] "Required" badge appears on un-filled mandatory fields
- [ ] Type pills: Scratch, Dent, Crack, Glass Damage, Rust, Paint Damage, Tear, Stain, Missing Part, Other — selecting one highlights it, deselecting another removes it
- [ ] Severity pills: Minor (green), Moderate (amber), Major (red) — all three display with correct colors
- [ ] Location pills show 14 exterior options (Hood, Roof, Trunk, Front Bumper, Rear Bumper, Driver Door (Front/Rear), Passenger Door (Front/Rear), Driver/Passenger Fender, Driver/Passenger Quarter Panel, Windshield)
- [ ] Impact pills: Cosmetic, Functional, Safety
- [ ] Description textarea is optional and accepts free text
- [ ] Thumbnail "RETAKE" button opens square camera again; capturing replaces the photo
- [ ] Cancel on retake camera leaves original photo unchanged
- [ ] "Collapse ↑" collapses the expanded item to a summary row
- [ ] Tapping the collapsed summary row re-expands it
- [ ] Edit (pencil) icon on collapsed row also re-expands
- [ ] Delete (trash) icon on collapsed row removes the item after tap
- [ ] "Remove this damage item" button inside expanded form also removes it
- [ ] Multiple damage items can be added and appear as separate cards
- [ ] Incomplete item (missing required field) shows "Incomplete — tap to finish" warning in collapsed row
- [ ] Damage items persist when navigating between wizard steps (back/forward)

---

## 5. Inspection Wizard — Interior Step (Damage Items)

- [ ] Damage section in interior step uses same camera-first flow as exterior
- [ ] Location pills show **10 interior options**: Driver Seat, Passenger Seat, Rear Seat Left, Rear Seat Right, Dashboard, Center Console, Headliner, Carpet/Floor, Door Panel (Driver), Door Panel (Passenger)
- [ ] All other damage item behaviors (retake, collapse, required badges, etc.) work identically to exterior

---

## 6. Vehicle Detail Page

- [ ] `/inventory/[vehicleId]` loads for a vehicle that exists
- [ ] Vehicle info (VIN, year, make, model, status) displays correctly
- [ ] Inspection history section lists past inspections with date and score
- [ ] Tapping an inspection in history opens or links to the PDF report
- [ ] Photos section (if present) shows captured inspection photos
- [ ] Notes section allows adding/editing notes and saves
- [ ] Status action buttons (e.g., Mark On Lot, Release) change the vehicle status
- [ ] **Billing card** appears (lot_map flag is enabled):
  - [ ] Shows days on lot calculation
  - [ ] Shows accrued amount based on rate
  - [ ] Billing type toggle (Daily / Monthly) works
  - [ ] Rate input accepts numeric value and saves
  - [ ] Bill To name and contact fields save
  - [ ] "Save Billing" shows green "Saved" confirmation
  - [ ] "Generate Invoice" button opens the invoice modal
  - [ ] Invoice modal shows billing summary, due date picker, notes textarea
  - [ ] "Generate & Download" creates and opens a PDF invoice
  - [ ] Invoice appears in the Lot Invoices table on the Billing & Plan page

---

## 7. Lot Map

- [ ] `/lot` page loads (requires `lot_map` flag — enabled for QA account)
- [ ] Summary bar shows Total Spots, Occupied, Available counts
- [ ] **Accruing/day** chip (green) shows sum of active vehicle daily rates
- [ ] **Empty cost/day** chip (amber) shows opportunity cost for empty spots
- [ ] On mobile, billing figures appear as compact text below spot counts
- [ ] Clicking an empty spot opens the Assign Vehicle modal
- [ ] Assigning a vehicle to a spot updates the grid and occupied count
- [ ] Clicking an occupied spot opens the Vehicle Detail slide-over
- [ ] Unassigning a vehicle from the slide-over frees the spot
- [ ] "Edit Layout" button (admin only) opens the lot setup overlay
- [ ] In setup mode, spots can be added, moved, resized, and deleted
- [ ] Legend displays all status colors (Empty, Pending Arrival, On Lot, In Progress, One-Off, Releasing, Released)

---

## 8. Lot Billing Settings

- [ ] `/settings/lot-billing` loads for admin users with `lot_map` flag enabled
- [ ] Current default daily rate and monthly rate load from company settings
- [ ] Changing daily rate input and saving persists the new value (visible on reload)
- [ ] Changing monthly rate and saving persists
- [ ] Billing type toggle (Daily / Monthly) saves as company default
- [ ] "Saved" flash appears in green after a successful save
- [ ] Non-admin users cannot access this page (redirected)

---

## 9. Invoice Management (Billing Page)

- [ ] `/settings/billing` shows a "Lot Invoices" section (when `lot_map` flag is enabled)
- [ ] Seeded invoices (generated from vehicle detail) appear in the table
- [ ] Invoice number format is `INV-0001`, `INV-0002`, etc. (sequential)
- [ ] Status dropdown (Draft / Sent / Paid) updates when changed
- [ ] "View PDF" button opens the invoice PDF from storage (signed URL, 1-hour expiry)
- [ ] Invoice PDF contains: invoice number, company name or logo, Bill To info, vehicle details, days on lot, rate, total, notes

---

## 10. White Label / Branding

- [ ] `/settings/branding` loads for admin users with `white_label` flag enabled
- [ ] Current logo displays if one has been uploaded (or shows "No logo uploaded")
- [ ] Drag-and-drop or click upload zone accepts PNG, JPEG, WebP, SVG up to 5MB
- [ ] After upload, new logo appears immediately in the preview
- [ ] "Remove" button removes the logo and clears the preview
- [ ] Generating a new inspection PDF after uploading logo shows the logo in the report header (instead of "CONDITION IQ" text)
- [ ] Non-admin users cannot access branding page

---

## 11. Dispatch / Send to Inspector

- [ ] `/storage/dispatch` page loads
- [ ] Inspectors (team members with `inspector` role) appear in the assignee list
- [ ] Sending a dispatch creates an inspection link
- [ ] Inspection link (`/inspect/[token]`) is accessible without login
- [ ] Inspector can complete the inspection via the token link
- [ ] Completed inspection is associated with the correct vehicle

---

## 12. Team Members

- [ ] `/settings/members` loads for admin users with `team_members` flag enabled
- [ ] Existing team members list correctly (name, email, role)
- [ ] Inviting a new member by email sends invite or creates a placeholder
- [ ] Changing a member's role (admin ↔ inspector) saves and takes effect
- [ ] Removing a member removes them from the list
- [ ] Non-admin users cannot access this page

---

## 13. Billing & Plan Page

- [ ] `/settings/billing` loads for all users
- [ ] Current plan (pro), billing interval, and usage stats display correctly
- [ ] Reports used / included counter reflects actual usage
- [ ] Billing cycle start date is shown
- [ ] Owner/super_admin account sees **real plan data** (not "Unlimited Access" bypass)
- [ ] "Request Plan Change" or upgrade CTA is present and tappable
- [ ] Lot Invoices section appears and is covered in section 9 above

---

## 14. Mobile Navigation

- [ ] Mobile header (≤767px) shows the Condition IQ logo and company name
- [ ] Avatar button in top-right opens a dropdown
- [ ] Dropdown shows: Profile, Billing & Plan (always visible)
- [ ] Dropdown shows: Lot Billing (admin + `lot_map` flag)
- [ ] Dropdown shows: Branding (admin + `white_label` flag)
- [ ] Dropdown shows: Team Members (admin)
- [ ] Dropdown shows: Admin Center (super_admin only)
- [ ] Tapping a dropdown item navigates to the correct route and closes the dropdown
- [ ] Tapping outside the dropdown closes it without navigating
- [ ] Sign Out in dropdown signs the user out and redirects to login

---

## 15. Admin Dashboard (super_admin)

> Requires signing in with a super_admin account — QA seed account is not super_admin. Test separately.

- [ ] `/admin/overview` loads with platform-level stats
- [ ] `/admin/customers` lists all companies
- [ ] Customer detail page shows feature flags and ability to toggle them
- [ ] CRM pipeline (`/admin/crm`) loads and shows leads
- [ ] Impersonating a company shows that company's data in the app
- [ ] Switching off impersonation returns to super_admin view

---

## 16. Edge Cases & Error States

- [ ] Navigating to a vehicle ID that doesn't exist shows a 404 or graceful error
- [ ] Opening the inspection wizard with no VIN and leaving VIN blank — validation prevents submission
- [ ] Camera permission denied in inspection → upload fallback UI appears
- [ ] Uploading a logo file over 5MB shows a size error
- [ ] Uploading a non-image file to branding → rejected
- [ ] Invoice PDF generation when no rate is set — graceful failure or warning
- [ ] Offline / slow network — app shows loading states, not blank screens

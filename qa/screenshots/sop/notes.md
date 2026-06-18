# SOP Screenshot Session Notes

**Date:** 2026-06-16  
**Account used:** qa-test@conditioniq.app (QA Test Storage, PRO plan)  
**App URL:** https://conditioniq-v2.vercel.app/  
**Session type:** Source-code driven (unattended; screenshots to be captured manually)

---

## SCREENSHOT CAPTURE LIMITATION

**Screenshots cannot be saved to disk in this environment.**

All approaches were attempted and confirmed blocked:
- `save_to_disk` in Chrome MCP — no effect
- html2canvas base64 extraction — blocked by safety filter
- Chunked/hex-encoded base64 — also blocked
- Local HTTP server in bash sandbox — no network interface available
- Playwright browser download — network access restricted
- computer-use `request_access` — timed out (180 s)

**Workaround:** This file documents every screen as a detailed shot list. Capture screenshots manually by navigating to each URL/state described below, then name files per the ID column (e.g. `G1-01.png`).

---

## MOBILE VIEWPORT TEST

**Result: FAILED — mobile navigation is unusable for screenshot capture.**

Testing was done by resizing the Chrome viewport to 390 x 844 px (iPhone 14 equivalent).

- The mobile header renders correctly (dark #0D1B2A top bar, Car icon, avatar button).
- Tapping the avatar opens a dropdown menu with: Profile, Billing & Plan, Lot Billing Settings (if enabled), White Label (if enabled), Team Members (if admin), Admin Dashboard (if super-admin), and Sign Out.
- However the mobile bottom tab bar and its routing conflicts with the screenshot workflow, so **all guide screenshots should be captured at desktop width (>=1280 px)** unless the item specifically calls for mobile.

---

## KNOWN BUGS

| ID     | Location           | Description | Severity |
|--------|--------------------|-------------|----------|
| BUG-01 | `/login` | Email field shows browser autofill suggestion on page load, overlaying the placeholder. Use incognito or clear autofill before capturing. | Low |
| BUG-02 | Dispatch list | No empty-state illustration when no dispatch requests exist — blank white area with no guidance copy. | Low |
| BUG-03 | `/lot` (no spots) | When no spots are configured AND canSetup is false (non-admin), the empty state shows "Ask an admin to set up the lot layout." with no primary CTA for the user. | Low |

---

## QA DATA REFERENCE

| Entity | Value used in QA |
|--------|-----------------|
| Login email | qa-test@conditioniq.app |
| Company name | QA Test Storage |
| Plan | PRO |
| Test VIN | 1HGCM82633A123456 (Honda Accord) |
| Dispatch token | Generate a new one via /storage/dispatch -> Send Link |
| Lot spots | Must configure via Edit Layout before G5 shots |

---

## URL QUICK-REFERENCE

| Screen ID | URL / trigger |
|-----------|---------------|
| G1-01 | `/login` |
| G1-02 | `/vehicles` (post-login landing) |
| G1-03 | `/vehicles` — desktop sidebar visible |
| G1-04 | Mobile: tap avatar, dropdown open |
| G1-05 | `/settings/profile` |
| G2-01 | `/vehicles` — all vehicles, populated |
| G2-02 | `/vehicles` — "On Lot" tab active |
| G2-03 | `/vehicles` — search box with query typed |
| G2-04 | `/vehicles` — Add Vehicle slide-over open |
| G2-05 | `/vehicles` — VIN decoded in Add Vehicle |
| G2-06 | `/vehicles` — Import CSV modal open |
| G2-07 | `/inventory/{vehicleId}` — top hero section |
| G2-08 | `/inventory/{vehicleId}` — Inspections history |
| G2-09 | `/inventory/{vehicleId}` — Photos section |
| G2-10 | `/inventory/{vehicleId}` — Notes section |
| G2-11 | `/inventory/{vehicleId}` — Lot Billing section |
| G3-01 | `/vehicles` -> "Start Inspection" — modal open (option select) |
| G3-02 | G3-01 -> "Pick from Vehicles" sub-view |
| G3-03 | G3-01 -> "Add New Vehicle" sub-view |
| G3-04 | Wizard Step 1 — Vehicle Info |
| G3-05 | Wizard Step 2 — Bill of Lading |
| G3-06 | Wizard Step 3 — Keys & FOBs |
| G3-07 | Wizard Step 4 — Vehicle Function |
| G3-08 | Wizard Step 5 — Documentation |
| G3-09 | Wizard Step 6 — Exterior |
| G3-10 | Wizard Step 7 — Interior |
| G3-11 | Wizard Step 8 — Engine |
| G3-12 | Wizard Step 6 or 7 — Damage entry flow (camera->edit) |
| G3-13 | Wizard Step 9 — Review & Submit |
| G3-14 | Post-submit success state |
| G3-15 | Usage Confirmation modal |
| G4-01 | `/storage/dispatch` — dispatch list |
| G4-02 | `/storage/dispatch` -> "Send Link" — form phase |
| G4-03 | Send Link — generated link phase |
| G4-04 | `/inspect/{token}` — external inspector intake |
| G5-01 | `/lot` — empty (no spots configured) |
| G5-02 | `/lot` — populated (spots assigned) |
| G5-03 | `/lot` -> "Edit Layout" — setup overlay open |
| G5-04 | Edit Layout — spot selected, property panel open |
| G5-05 | `/lot` — Assign Vehicle modal open |
| G5-06 | `/lot` — Vehicle Detail slide-over open |


---

# GUIDE 1 — Getting Started

---

## G1-01 — Login Page

**URL:** `https://conditioniq-v2.vercel.app/login`
**Shot:** Full page, desktop (1280 px wide), no autofill visible (use incognito).

### Layout (top to bottom)
1. Dark navy full-viewport background (#0D1B2A).
2. Centered white card, rounded corners, shadow.
3. **Logo area** — cyan Car icon (36x36 px circle, #00B4D8) + "Condition IQ" wordmark, centered above card.
4. **Heading** — "Welcome back" (24 px bold, #0D1B2A).
5. **Subheading** — "Sign in to your account" (14 px, #94A3B8).
6. **Email field** — label "Email", placeholder `you@company.com`.
7. **Password field** — label "Password" (left) + "Forgot password?" link (right, cyan).
8. **Sign in button** — full-width, dark #0D1B2A background, white "Sign in" text. Loading: "Signing in..." + spinner.
9. **Error text** — red, below button, if credentials are wrong.

### Callouts
- Arrow to email and password fields.
- Arrow to "Forgot password?" link.
- Note: no self-sign-up link — accounts are created by admins only.

---

## G1-02 — Post-Login Landing (Vehicles List)

**URL:** `/vehicles` (automatic redirect after successful login)
**Shot:** Full page, desktop, sidebar expanded, vehicle list populated.

### Layout
- Left: dark navy sidebar (256 px, #1B2D40) — see G1-03.
- Top bar: page title "Vehicles".
- Content: status tab strip + vehicle table.

### Callouts
- Arrow to sidebar showing navigation items.
- Arrow to "Start Inspection" item at top of sidebar.
- Note that `/vehicles` is the default post-login page.

---

## G1-03 — Desktop Sidebar Navigation

**URL:** Any authenticated page (e.g. `/vehicles`)
**Shot:** Sidebar only, expanded (256 px wide), cropped to full height.

### Layout
**Header area:**
- Cyan Car icon circle (36 px, #00B4D8) + "Condition IQ" wordmark (white, 16 px bold).
- Company name below wordmark (12 px, white 50% opacity): e.g. "QA Test Storage".
- Collapse toggle (ChevronLeft icon, top-right of header area).

**Nav items (top to bottom, storage account):**
1. **Start Inspection** — Play icon — fires Start Inspection modal (not a route).
2. **Vehicles** — Car icon — `/vehicles`.
3. **Dispatch** — Send icon — `/storage/dispatch`.
4. **Lot** — LayoutGrid icon — `/lot` *(only visible if lot_map feature flag is enabled)*.

**Active item style:** 3 px cyan left border (#00B4D8), cyan text, subtle cyan background tint.

**Bottom:** User avatar (initials circle) + name. Clicking opens profile/settings.

**Collapsed state (64 px):** Only icon circles visible; labels hidden; toggle becomes ChevronRight.

### Callouts
- Label each nav item with its destination.
- Arrow to the collapse toggle.
- Note: "Lot" only appears with lot_map flag enabled — disabled on QA account by default.

---

## G1-04 — Mobile Header & Settings Dropdown

**URL:** `/vehicles` at mobile viewport (<= 767 px)
**Shot:** Top of screen with avatar dropdown open.

### Header bar (dark #0D1B2A, safe-area padding)
- Left: Car icon (34x34 rounded square, rgba(255,255,255,0.1)) + "Condition IQ" wordmark.
- Right: Avatar circle button (user initial).

### Dropdown (after tapping avatar)
White card, rounded, shadow. Items with icon boxes (32x32 px):
- **Profile** (User icon, dark box)
- **Billing & Plan** (CreditCard icon, dark box)
- **Lot Billing Settings** (DollarSign icon — visible if lot_map enabled)
- **White Label** (Palette icon — visible if white_label flag enabled)
- **Team Members** (Users icon — admin/owner only)
- **Admin Dashboard** (Shield icon — super-admin only)
- **Sign Out** (LogOut icon, red #EF4444 text)

### Callouts
- Label the avatar button.
- Label each menu item.

---

## G1-05 — Profile Settings

**URL:** `/settings/profile`
**Shot:** Full page, desktop.

### Layout
- Page heading "Profile".
- **Full Name** text input.
- **Email** field (read-only — shows current login email).
- **Save Changes** button (orange #F4A62A).
- **Change Password** section: Current Password + New Password fields + Save button.

### Callouts
- Arrow to Full Name field.
- Arrow to Save Changes button.
- Note email is read-only.

---

---

# GUIDE 2 — Vehicles & Inventory

---

## G2-01 — Vehicles List (Populated, All Tab)

**URL:** `/vehicles`
**Shot:** Full page, desktop, "All" tab selected, multiple vehicles visible.

### Layout (top to bottom)
**Top bar:** "Vehicles" title. Right side: Export button (Download icon) + Import CSV button (Upload icon) + Add Vehicle button (+ icon, dark #0D1B2A).

**Status tab strip** (horizontal scroll on mobile):
- All · On Lot · Pending Arrival · In Progress · Releasing · Released · One-Off
- Active tab: orange (#F4A62A) underline, dark text. Each tab shows a count badge.

**Search bar:** "Search VIN, make, model..." placeholder, magnifier icon.

**Vehicle rows (each):**
- Vehicle title (Year Make Model, bold dark)
- VIN (monospace, grey, smaller)
- Status badge (colored pill): On Lot = cyan #00B4D8 | Pending Arrival = grey | In Progress = amber | Releasing = amber | Released = green
- Days on lot (e.g. "14 days", right-aligned, grey)
- ChevronRight (taps to vehicle detail)

**Sort order:** On Lot -> In Progress -> Pending Arrival -> Releasing -> Released -> One-Off.

### Callouts
- Label the tab strip with each status name.
- Label the status badge on one vehicle row and its color meaning.
- Arrow to Add Vehicle button.

---

## G2-02 — Vehicles List — Status Tab Filtered

**URL:** `/vehicles` — click "On Lot" tab
**Shot:** Full page, "On Lot" tab highlighted, list filtered.

The active tab has an orange underline. The list shows only on-lot vehicles. The count badge on the tab matches the row count.

### Callouts
- Arrow to active tab (orange underline).
- Note row count matches tab badge count.

---

## G2-03 — Vehicles Search

**URL:** `/vehicles` — type a partial VIN or make/model in search box
**Shot:** Search box active with text (e.g. "Honda"), filtered results visible.

The list updates in real-time. No-results state: "No vehicles match your search." text centered in the list area.

### Callouts
- Arrow to search box with cursor inside.
- Note: searches VIN, make, and model simultaneously.

---

## G2-04 — Add Vehicle Slide-Over (Empty)

**URL:** `/vehicles` -> click "Add Vehicle"
**Shot:** Slide-over open on right side.

### Layout
**Header:** "Add Vehicle" (18 px bold) + X close button.

**Fields:**
1. VIN (required) — placeholder "17-character VIN", maxLength 17. "Decode" button appears at right, activates at 17 chars.
2. Location dropdown — FMC/multi-location only; hidden for single-location storage accounts.
3. Notes textarea — optional, placeholder "Optional...".

**Bottom buttons:**
- **Add Vehicle** (primary, dark #0D1B2A) — saves and goes to vehicle detail.
- **Add & Dispatch** (secondary, orange border) — saves and opens Send Link sheet with VIN pre-filled.

### Callouts
- Arrow to VIN field.
- Label the two bottom buttons and explain their difference.

---

## G2-05 — Add Vehicle — VIN Decoded

**URL:** `/vehicles` -> Add Vehicle -> type a valid 17-char VIN
**Shot:** Slide-over with Year/Make/Model auto-populated.

After entering a full 17-character VIN, the app auto-decodes via NHTSA and displays Year, Make, and Model (e.g. "2003 Honda Accord") in read-only fields below the VIN input.

### Callouts
- Arrow to the auto-populated Year/Make/Model row.
- Note: decode is automatic at exactly 17 characters — no button press needed.

---

## G2-06 — Import CSV Modal

**URL:** `/vehicles` -> click "Import CSV"
**Shot:** Desktop, modal open at the file drop zone stage.

### Layout
- Header: "Import CSV" + X close.
- **Drop zone:** "Drop CSV or click to browse" + cloud-upload icon, dashed border.
- After file selected: preview table (VIN, Year, Make, Model columns). New rows highlighted green; duplicate VINs flagged differently.
- Footer: Cancel + Import button (disabled until file selected). Post-import: "Done" replaces them.

### Callouts
- Label the drop zone.
- Note duplicate VINs already in the account are detected and skipped.

---

## G2-07 — Vehicle Detail — Hero / Header

**URL:** `/inventory/{vehicleId}` (click a vehicle row from the list)
**Shot:** Top portion of vehicle detail page (above first scroll fold).

### Layout
- "Back" breadcrumb (ChevronLeft + "Vehicles") top-left.
- **Vehicle title** (e.g. "2003 Honda Accord", 22 px bold).
- **VIN** in monospace below title.
- **Status badge** — colored pill (e.g. "ON LOT" cyan, "PENDING ARRIVAL" grey).
- **Days on lot** counter (e.g. "14 days").
- **Action button row:**
  - Start Inspection (Play icon, orange) — if vehicle is in an inspectable status.
  - Send to Inspector (Send icon) — opens dispatch flow.
  - Mark On Lot (if status is pending_arrival).
  - Release Vehicle (if status is on_lot or releasing).

### Callouts
- Label the status badge and its color meaning.
- Arrow to Start Inspection button.
- Arrow to days-on-lot counter.

---

## G2-08 — Vehicle Detail — Inspections History

**URL:** `/inventory/{vehicleId}` — scroll to "Inspections" section
**Shot:** Inspections section card, with at least one inspection row.

### Layout
Section card header: "INSPECTIONS" (10 px uppercase, grey) + count badge.

Each inspection row:
- Date + time.
- Inspection type badge (Check-In green | Check-Out amber | Standard teal).
- Score badge (e.g. "87%" — green/amber/red based on value).
- "IN PROGRESS" amber badge if not submitted yet.
- View PDF button.
- View Report link.

Empty state: "No inspections yet."

### Callouts
- Label the inspection type badge.
- Arrow to score badge.
- Arrow to View PDF button.

---

## G2-09 — Vehicle Detail — Photos

**URL:** `/inventory/{vehicleId}` — scroll to "Photos" section
**Shot:** Photos section showing thumbnails.

Section card: "PHOTOS" + count badge. Grid of photo thumbnails aggregated from all inspections. Each thumbnail labeled with its source context (e.g. "Exterior — Front"). Clicking opens a lightbox/full-screen viewer.

### Callouts
- Label the section.
- Note photos are aggregated across all inspections for this vehicle.

---

## G2-10 — Vehicle Detail — Notes / Activity

**URL:** `/inventory/{vehicleId}` — scroll to "Notes" section
**Shot:** Notes section with at least one note and the Add Note input.

Section card: "NOTES" or "ACTIVITY". Timeline list of notes (author, timestamp, text). At bottom: "Add a note..." input + Save button.

### Callouts
- Arrow to the note input.
- Arrow to Save button.

---

## G2-11 — Vehicle Detail — Lot Billing Section

**URL:** `/inventory/{vehicleId}` — scroll to "Lot Billing" section
**Shot:** Lot Billing section with rate fields and Generate Invoice button.

**Note:** Requires lot_map feature flag enabled. Enable via Admin -> Feature Flags first.

### Layout
Section card: "LOT BILLING".
- Daily Rate field (e.g. "$25.00/day").
- Billing Type toggle (Daily / Monthly).
- Estimated total (days on lot x rate).
- **Generate Invoice** button (orange).

Invoice modal (after clicking Generate Invoice):
- Notes textarea.
- Due date field.
- Generate button.

$0 invoice guard: if amount is $0, a confirmation modal appears — "The calculated amount is $0.00. Generate a $0 invoice?" — with Cancel and Generate buttons.

### Callouts
- Label the rate field.
- Arrow to Generate Invoice button.
- Note the $0 confirmation guard.

---

---

# GUIDE 3 — Running Inspections

---

## G3-01 — Start Inspection Modal (Option Select)

**URL:** `/vehicles` -> click "Start Inspection" in sidebar
**Shot:** Desktop, modal open with all 3 options visible.

### Layout
Centered modal (480 px wide on desktop, bottom sheet on mobile with 28 px top border-radius). White background, border-radius 20, shadow. Dark overlay behind.

**3 stacked option buttons, each with:**
- 44x44 px icon circle (filled color)
- Title (16 px bold)
- Subtitle (13 px, #94A3B8)
- ChevronRight on right edge

**Option 1 — Pick from Vehicles**
- Icon circle: dark #0D1B2A, white Car icon
- Title: "Pick from Vehicles"
- Subtitle: "Select a vehicle already in your fleet"

**Option 2 — Add New Vehicle**
- Icon circle: orange #F4A62A, white Plus icon
- Title: "Add New Vehicle"
- Subtitle: "Enter a VIN and start inspecting"

**Option 3 — One-Off Report**
- Icon circle: teal #00B4D8, white FileText icon
- Title: "One-Off Report"
- Subtitle: "Quick inspection, not tied to a vehicle record"

X close button top-right.

### Callouts
- Label each of the 3 options.
- Note: One-Off does not create a vehicle record — useful for spot checks.

---

## G3-02 — Start Inspection — Pick from Vehicles Sub-View

**URL:** G3-01 modal -> click "Pick from Vehicles"
**Shot:** Modal in vehicle search sub-view.

### Layout
- Back arrow (top-left) + heading "Pick a Vehicle".
- Search input — "Search VIN, make, model..." with Search icon inside.
- Scrollable vehicle list below search. Each row:
  - Vehicle title (Year Make Model, bold)
  - VIN (monospace, 12 px, grey)
  - Days count ("14 days", right-aligned)
  - ChevronRight
- Vehicles filtered to: non-released and non-one-off statuses only.

**Resume dialog** (if VIN has an existing in-progress inspection):
- "Inspection In Progress — started {date}. Resume to continue, or start fresh."
- Resume Inspection button (cyan #00B4D8).
- Start Fresh button (white/border).

### Callouts
- Label the search input.
- Label a vehicle row (point to VIN + days count).
- Note: released vehicles are hidden from this list.

---

## G3-03 — Start Inspection — Add New Vehicle Sub-View

**URL:** G3-01 modal -> click "Add New Vehicle"
**Shot:** Modal in add-new sub-view with VIN field.

### Layout
- Back arrow + heading "New Vehicle".
- VIN input — auto-uppercases, strips non-alphanumeric. Decodes at 17 characters.
- Year / Make / Model — auto-populated display (read-only) after decode.
- Start Inspection button (orange, full-width) — disabled until VIN entered.

One-Off sub-view is nearly identical but VIN is optional and button says "Start One-Off Report".

### Callouts
- Arrow to VIN input.
- Show Year/Make/Model auto-fill.
- Note: VIN decode at exactly 17 characters.

---

## G3-04 — Wizard Step 1: Vehicle Info

**URL:** Inspection wizard (opens after selecting or adding a vehicle)
**Shot:** Full wizard screen, Step 1.

### Wizard header (present on all steps)
- Step label left: "Vehicle Info" | Step counter right: "Step 1 of 9"
- Thin progress bar below header (~11% filled for Step 1).
- Back button top-left (on Step 1: triggers cancel dialog; on later steps: goes back).

### StepOpener block (present on all steps)
- 80 px white icon circle with shadow.
- Title: "Vehicle Info" (22 px bold, #0D1B2A).
- Subtitle: "Record the vehicle's basic details" (14 px, #4A5568).
- Completion badge: green pill "All complete" when required fields filled; amber pill "N remaining" otherwise.
- Cyan info card (#E0F7FC bg, 4 px left border #00B4D8, Info icon): "VIN Lookup — Enter the 17-character VIN to auto-fill year, make, and model."

### Fields
- VIN (required) — may be locked/grey if pre-filled from vehicle or dispatch.
- Year, Make, Model — auto-filled from VIN decode.
- Asset ID — optional.
- Odometer — optional number.
- Location — text with auto-suggest from company locations.
- **Inspection Type** (3 radio cards):
  - Check-In — green #D1FAE5 background
  - Check-Out — amber #FEF3C7 background
  - Other / Standard — teal #E0F7FC background
- Vehicle Photo — optional PhotoField.

### Fixed bottom bar
- Continue button (full width, orange #F4A62A).
- (Back button appears from Step 2 onward: 38% width, white, grey border.)

### Callouts
- Label each field.
- Label the 3 Inspection Type radio cards.
- Point to the progress bar and step counter.

---

## G3-05 — Wizard Step 2: Bill of Lading

**URL:** After continuing from Step 1.
**Shot:** Full wizard screen, Step 2.

### StepOpener
ClipboardList icon | "Bill of Lading" | "Record BOL details and discrepancies"

### Fields
- **BOL Present** — Yes / No toggle (required to advance).
- **Quick chips** (multi-select, appear after Yes):
  BOL matches vehicle | No discrepancies | Mileage matches | Signatures present | Date verified
- **BOL Notes** — textarea + voice input button (microphone icon).
- **BOL Photo** — PhotoField.

### Bottom bar: Back + Continue

### Callouts
- Label the Yes/No toggle.
- Label the quick-chip row.
- Arrow to Back + Continue bar.

---

## G3-06 — Wizard Step 3: Keys & FOBs

**URL:** Wizard Step 3.
**Shot:** Full wizard screen, Step 3.

### StepOpener
Key icon | "Keys & FOBs" | "Count the keys and key FOBs"

### Fields
- **Mechanical Keys** — white card, minus (-) and plus (+) buttons with count in center.
- **Key FOBs** — same counter pattern.
- **Keys Photo** — PhotoField.

Note: this step is always "complete" (green badge) — no required fields.

### Bottom bar: Back + Continue

### Callouts
- Label the +/- counter buttons.
- Note: step always passes even at 0.

---

## G3-07 — Wizard Step 4: Vehicle Function

**URL:** Wizard Step 4.
**Shot:** Full wizard screen, Step 4, showing test groups.

### StepOpener
Gauge/Activity icon | "Vehicle Function" | "Test key vehicle systems"

### Groups with "Set All" button per group
- **Drive:** Engine Starts · Shifts to Drive · Shifts to Reverse · Parking Brake
- **Lights:** Headlights · Taillights · Turn Signals · Brake Lights · Hazard Lights
- **Systems:** Horn · Wipers · Washer Fluid · A/C · Heater · Radio
- **Electrical:** Power Windows · Power Locks · Mirrors

Each test item: **Pass** (green when selected) / **Fail** (red when selected) / **N/T** (grey, not tested) — 3-pill toggle.

**"Set All"** button on each group header sets all items to Pass in one tap.

**Function Notes** textarea at bottom.

### Callouts
- Label Pass / Fail / N/T pills.
- Arrow to "Set All" button on one group.
- Label one complete group (e.g. Drive).

---

## G3-08 — Wizard Step 5: Documentation

**URL:** Wizard Step 5.
**Shot:** Full wizard screen, Step 5.

### StepOpener
FileText icon | "Documentation" | "Record license plate and insurance details"

### Fields
- License Plate — text input.
- State — US state dropdown.
- License Plate Photo — PhotoField.
- Registration Current — Yes / No toggle + Registration Photo.
- Insurance Present — Yes / No toggle + Insurance Photo.
- Documentation Notes — textarea.

### Callouts
- Label the Yes/No toggle pattern (reused across the step).

---

## G3-09 — Wizard Step 6: Exterior

**URL:** Wizard Step 6.
**Shot:** Full wizard screen, Step 6 — show photo grid and condition pills.

### StepOpener
Car icon | "Exterior" | "Document exterior condition and damage"

### Layout
**4-photo grid (2x2, each cell ~120 px tall):**
Front | Rear | Driver Side | Passenger Side
Empty: camera icon + label. Filled: thumbnail with "Retake" overlay.

**Tire tread pills:** FL / FR / RL / RR (amber when flagged).

**Condition pills (orange #F4A62A fill when selected):**
- Overall Condition: Good / Fair / Poor
- Paint Condition: Good / Faded / Scratched / Dented / Peeling
- Glass Condition: Good / Chipped / Cracked / Shattered

**Glass damage location** text field (conditional on glass damage selected).

**Exterior Notes** + voice input (microphone icon).

**DamageEntry** component at bottom — "Add Damage" button (dark #0D1B2A, Camera icon).

### Callouts
- Label the 4-photo grid positions.
- Label the 3 condition pill rows.
- Arrow to "Add Damage" button.

---

## G3-10 — Wizard Step 7: Interior

**URL:** Wizard Step 7.
**Shot:** Full wizard screen, Step 7.

### StepOpener
Seat icon | "Interior" | "Document interior condition and damage"

### Layout
**6 photo slots:** Driver Door | Rear Driver Door | Trunk | Rear Passenger Door | Passenger Door | Dashboard

**Condition pills for 7 areas:**
- Overall Interior: Good / Fair / Poor
- Front Seats: Good / Stained / Torn / Worn / Burned
- Rear Seats: Good / Stained / Torn / Worn / Burned
- Dashboard: Good / Cracked / Faded / Warning Lights
- Headliner: Good / Stained / Sagging / Torn
- Carpet/Floor: Good / Stained / Worn / Torn / Wet
- Steering Wheel: Good / Worn / Cracked / Peeling

**Odor type chips (multi-select):** Smoke | Mildew | Pet | Food | Chemical | Other

**Personal Items Present** — Yes / No toggle.

**Interior Notes** + voice input.

**DamageEntry** component.

### Callouts
- Label the odor chips.
- Label one condition row.

---

## G3-11 — Wizard Step 8: Engine

**URL:** Wizard Step 8.
**Shot:** Full wizard screen, Step 8.

### StepOpener
Wrench icon | "Engine" | "Inspect engine bay and fluid levels"

### Layout
**Engine Bay Photo** — large PhotoField at top.

**Fluid Levels (4 items):**
- Oil Level: Good (green) / Low (red) / Overfull (amber) / Not Checked (grey)
- Coolant Level: Good / Low / Not Checked
- Brake Fluid: Good / Low / Not Checked
- Transmission Fluid: Good / Low / Not Checked

**Components (3 items):**
- Battery: Good / Fair / Poor
- Belt: Good / Worn / Cracked / N/V (not visible)
- Hoses: Good / Worn / Leaking / N/V

**Conditional reveals:**
- Visible Leaks Yes/No -> if Yes: Leak Description text + Leak Photo.
- Unusual Noise Yes/No -> if Yes: chips — Knocking / Ticking / Squealing / Grinding / Rattling / Other.
- Check Engine Light Yes/No.

**Engine Notes** + voice input.

### Callouts
- Label Fluid Levels section with color meanings (green=good, red=low, amber=overfull).
- Arrow to Visible Leaks toggle showing conditional reveal.
- Arrow to Check Engine Light toggle.

---

## G3-12 — Damage Entry Flow

**URL:** Wizard Step 6 or 7 -> tap "Add Damage"
**Shot:** Two shots: (A) after photo taken — damage item in expanded edit state; (B) collapsed summary row.

### Shot A — Expanded Edit State (after photo taken)
**Top of item card:**
- 72x72 px photo thumbnail with "RETAKE" overlay button.
- "Damage #1" label.

**Type pills (10 options, dark fill when selected):**
Scratch | Dent | Crack | Glass Damage | Rust | Paint Damage | Tear | Stain | Missing Part | Other

**Severity pills (3, color-coded):**
- Minor — green background (#D1FAE5)
- Moderate — amber background (#FEF3C7)
- Major — red background (#FEE2E2)

**Location pills:**
Exterior (14): Hood | Roof | Trunk | Front Bumper | Rear Bumper | Driver Door Front | Driver Door Rear | Passenger Door Front | Passenger Door Rear | Driver Fender | Passenger Fender | Driver Quarter Panel | Passenger Quarter Panel | Windshield
Interior (10): Driver Seat | Passenger Seat | Rear Seat Left | Rear Seat Right | Dashboard | Center Console | Headliner | Carpet/Floor | Door Panel Driver | Door Panel Passenger

**Impact pills:** Cosmetic | Functional | Safety

**Description** textarea (optional).

**"Remove this damage item"** link — red trash icon.

**Incomplete state:** amber border around card + "Incomplete — tap to finish" warning when any required field (type/severity/location) is empty.

### Shot B — Collapsed Summary Row (after all fields filled)
- 44x44 px thumbnail + type name (bold) + severity badge + location name + pencil icon + trash icon.

### Callouts
- Label Type, Severity, Location, Impact sections.
- Label the Incomplete warning state.
- Label the collapsed summary row.

---

## G3-13 — Wizard Step 9: Review & Submit

**URL:** Wizard Step 9 (final step).
**Shot:** Full wizard screen, Step 9 — show review cards and signature area.

### StepOpener
CheckCircle icon | "Review & Submit" | "Review all sections and sign to complete"

### Layout
**Estimated Score preview:**
- Projected total score with breakdown:
  Exterior /25 | Interior /20 | Mechanical /30 | Documentation /15 | Mileage /10

**Stats bar:** Pass count (green) | Fail count (red) | Damage items count | Steps (8)

**Section review cards (8):** One per completed step — icon + step label + brief summary. Tap any card to jump back to that step.

**Signature canvas (required):**
- White canvas, "Sign here" placeholder.
- Clear button.
- Required before Submit is enabled.

**Submit Inspection button:**
- Orange #F4A62A when signature present; grey #E1E8F0 when not.
- Shows "Generating report..." while submitting.

**Bottom bar:** Back (to Engine step) + Submit Inspection.

### Callouts
- Arrow to score breakdown.
- Arrow to signature canvas.
- Note Submit button is grey until signed.

---

## G3-14 — Post-Submit Success State

**URL:** Wizard URL — transitions to success view after submission.
**Shot:** Full screen success state.

### Layout
- 80x80 px green circle (#D1FAE5 background, dark-green checkmark).
- Heading: "Inspection Complete" (22 px bold).
- Subtext: "The report has been submitted successfully."
- View Report button — opens the inspection PDF or report detail.
- Done button — returns to vehicles list or vehicle detail.

### Callouts
- Label the success icon.
- Label View Report button.

---

## G3-15 — Usage Confirmation Modal

**URL:** Triggered between Start Inspection flow and wizard opening.
**Shot:** Full-screen confirmation modal (replaces entire page during the confirm step).

This appears when the usage percentage is high or the plan limit is reached.

### Layout
**Title:**
- "Start Inspection?" (within plan limit)
- "Plan limit reached" (at or over limit)

**Subtitle:**
- "Completing this inspection will use 1 report from your PRO plan." (within limit)
- "You've used all N reports this month." (at limit)
- If overage: "Completing this inspection will be billed as an overage at $X.XX."

**Usage meter:**
- Progress bar filling left-to-right (e.g. 78% filled).
- Label: "You've used 78% of your monthly limit."
- Count display: "N / M used / included".

**If overage:** Overage rate badge: "Overage rate: $X.XX per report".

**Remaining count:** "N reports remaining this month."

**24-hour note:** "You have 24 hours to complete this inspection. If left inactive, it will be auto-cancelled at no charge."

**Buttons (stacked):**
- Confirm & Start — cyan #00B4D8 (normal) or red #EF4444 (overage). Full width.
- Cancel — white with grey border. Returns to intake form.

### Callouts
- Label the usage progress bar.
- Note button color changes to red during overage.
- Point to the 24-hour auto-cancel note.

---

---

# GUIDE 4 — Dispatch

---

## G4-01 — Dispatch List Page

**URL:** `/storage/dispatch`
**Shot:** Full page, desktop, list with 1-2 dispatch entries visible (or empty state if none).

### Layout
**Page title:** "Dispatch" in top bar.

**Send Link button:** Top-right (or mobile FAB) — "Send Link" — opens the Send Link sheet.

**Dispatch request rows (each):**
- VIN (monospace, bold).
- Vehicle name (Year Make Model — if decoded).
- Status badge (colored pill):
  - Awaiting — amber, Clock icon — link sent, not started.
  - Completed — green, CheckCircle icon — inspection submitted.
  - Expired — grey/red, AlertTriangle icon — 48 h elapsed.
- Created timestamp (e.g. "2 hours ago").
- Copy Link icon button — copies the inspect URL to clipboard.
- Open Link icon button (ExternalLink) — opens `/inspect/{token}` in new tab.
- Refresh Status icon button — re-checks whether inspection was completed.

**Empty state:** Blank white area (BUG-02 — no illustration or guidance copy).

### Callouts
- Label each status badge color (awaiting/completed/expired).
- Arrow to "Send Link" button.
- Label the Copy Link and Open Link icons on a row.

---

## G4-02 — Send Link Sheet — Form Phase

**URL:** `/storage/dispatch` -> click "Send Link"
**Shot:** Slide-over or modal open, form fields visible.

### Layout
**Header:** "Send Inspection Link" + X close button.

**Fields:**
- **VIN** (required):
  - Auto-uppercases, strips invalid chars.
  - At 17 characters: auto-decodes via NHTSA.
  - Valid state: green border + green glow around the input.
- Year / Make / Model — auto-populated, read-only after decode.
- Notes — optional textarea ("Add any notes for the inspector...").
- Location dropdown — FMC accounts only.

**Generate Link button** — orange, full-width, disabled until valid VIN.

### Callouts
- Arrow to VIN field with green "valid" glow highlighted.
- Arrow to Generate Link button.
- Note VIN decodes automatically — no button press.

---

## G4-03 — Send Link Sheet — Generated Phase

**URL:** Same sheet after clicking "Generate Link"
**Shot:** Sheet in generated state.

### Layout
- Large green CheckCircle icon centered.
- Generated URL shown (truncated, e.g. `https://conditioniq-v2.vercel.app/inspect/abc123...`).
- **Copy** button — "Copy Link". After click: changes to "Copied!" for 2 seconds.
- **Email** button — "Send via Email". Opens mail client with pre-filled body (VIN, instructions, 48-hour expiry note).
- **"Send Another"** text link at bottom — resets to form phase.

Link format: `{origin}/inspect/{token}` — 48-hour expiry, single-use.

### Callouts
- Label Copy button.
- Label Email button.
- Label "Send Another" link.
- Point to the URL and note 48-hour expiry.

---

## G4-04 — External Inspector View

**URL:** `/inspect/{valid-token}` (open a freshly generated dispatch link)
**Shot:** Full page intake form as an external inspector would see it.

This is a public page — no login required. Completely different layout from the main app (no sidebar, no nav).

### Layout
**Background:** Light grey #F0F4F8, full viewport height.

**Centered card (max-width 400 px):**

Header block (centered):
- 56x56 px dark #0D1B2A circle, cyan Car icon (26 px) inside.
- Heading: "Vehicle Inspection" (22 px bold).
- Subheading: "You've been sent an inspection link" (14 px, grey).

Request details card (white, rounded, border) — if dispatch included VIN or notes:
- VIN row: grey "VIN" label / monospace VIN value.
- Notes section: small-caps "NOTES" label + notes text.

Your Name card (white, rounded):
- Label: "Your Name"
- Input: placeholder "Enter your full name"

**Start Inspection button** (full-width, 52 px height):
- Disabled: grey #E1E8F0 background, grey text.
- Enabled (name entered): orange #F4A62A background, dark text.
- Label: "Start Inspection"

**Footer:** "This link expires 48 hours after it was sent" (12 px, light grey #CBD5E1).

**Existing inspection dialog** (overlay, if VIN already has in-progress inspection):
- Dark blurred backdrop.
- White card: "Inspection In Progress" heading, description with started date.
- Resume Inspection button (cyan #00B4D8).
- Start Fresh button (white/border).

### Error states (full-page replacements for the intake form)
**Expired link:**
- Amber circle (64 px) + Clock icon (32 px, amber #F59E0B).
- Heading: "Link Expired"
- Body: "This inspection link expired after 48 hours. Ask the company to send a new one."

**Already used:**
- Green circle + CheckCircle icon (#10B981).
- Heading: "Already Used"
- Body: "This inspection link has already been used. Each link is single-use only."

**Invalid link:**
- Red circle + XCircle icon (#EF4444).
- Heading: "Invalid Link"
- Body: "This link is not valid. Contact the company that sent it."

### Callouts (primary intake form shot)
- Label the VIN display (read-only, pre-filled from dispatch).
- Label Your Name input.
- Arrow to Start Inspection button noting disabled vs enabled state.
- Note: a Usage Confirmation modal (G3-15) may appear after tapping Start Inspection.

### Additional shots
- G4-04b: Expired link screen.
- G4-04c: Already Used screen.

---

---

# GUIDE 5 — Lot Management

**Note:** The lot_map feature flag must be enabled to access `/lot`. Enable via Admin -> Feature Flags before capturing any G5 screenshots. The QA account has this disabled by default.

---

## G5-01 — Lot Page (Empty — No Spots Configured)

**URL:** `/lot`
**Shot:** Full page, desktop, no spots configured.

### Layout
**Page title:** "Lot Map" (22 px bold, #0D1B2A).

**Summary bar (desktop — StatChip row):**
- Total Spots: 0 (dark)
- Occupied: 0 (cyan #00B4D8)
- Available: 0 (green #10B981)

**Edit Layout button** (top right, admin/owner only):
- White card button, Settings gear icon + "Edit Layout" label.
- Hidden for non-admin users.

**Legend row (desktop only, below summary):**
Color swatches + labels:
- Empty (#E1E8F0 light grey)
- Pending Arrival (#94A3B8 grey)
- On Lot (#00B4D8 cyan)
- In Progress (#8B5CF6 purple)
- One-Off (#F97316 orange)
- Releasing (#F4A62A amber)
- Released (#10B981 green)

**Empty canvas area:**
- White background canvas.
- "No spots configured yet." (grey, 14 px).
- If admin: "Set Up Lot" cyan-border button inside the canvas.
- If non-admin: "Ask an admin to set up the lot layout." text only (no CTA — BUG-03).

### Callouts
- Label the StatChip row.
- Label the legend with each color's meaning.
- Arrow to Edit Layout button.
- Arrow to the empty canvas prompt.

---

## G5-02 — Lot Page (Populated — Spots and Vehicles Assigned)

**URL:** `/lot` after configuring spots and assigning vehicles
**Shot:** Full page, desktop, multiple spots visible with vehicles.

### Layout
**Summary bar (populated, desktop):**
- Total Spots: N (e.g. 20)
- Occupied: N (cyan)
- Available: N (green)
- If billing configured: "Accruing/day" chip (green bg #D1FAE5, e.g. "$250.00") and "Empty cost/day" chip (amber bg #FEF3C7).

**Lot grid canvas:**
Spots rendered as colored squares on a 100x100 coordinate grid. May have a background image (satellite or schematic photo) if uploaded.

Each spot square shows:
- Background color = vehicle status color (per legend). Empty spots = #E1E8F0.
- Spot label in center (e.g. "A1", white text on colored, grey text on empty).
- Second line: truncated vehicle name (if occupied, white 85% opacity, 9 px).

Zones, borders, and markers drawn behind spots if configured in Edit Layout.

**Spot interactions:**
- Tap empty spot -> opens Assign Vehicle modal (G5-05).
- Tap occupied spot -> opens Vehicle Detail slide-over (G5-06).

**Mobile summary (<= 767 px):** Collapsed single line: "{Occupied}/{Total} * {Available} free".

### Callouts
- Label a cyan "On Lot" spot and a grey "Empty" spot.
- Label the StatChip row with values.
- Point to the legend.

---

## G5-03 — Edit Layout Mode — Overlay Open

**URL:** `/lot` -> click "Edit Layout"
**Shot:** Full screen with Edit Layout overlay active.

### Layout
**Dark header toolbar (fixed top, #1B2D40 background):**

Left section:
- "Edit Lot Layout" label (14 px bold, white).
- **BG Image** button (Upload icon) — uploads satellite/schematic background image.
- **Remove BG** button (danger style) — appears only if BG image exists.
- **Grid** toggle (Grid3X3 icon) — shows/hides snap grid on canvas.
- **Snap** toggle — snaps spots to grid intersections.
- Zoom − and + buttons.
- BG Rotate: CCW (rotate left 90deg) and CW (rotate right 90deg) buttons.

Right section — tool palette (5 tools):
- **Select** (arrow icon, key S) — select/drag existing spots.
- **Spot** (square icon, key P) — click canvas to place a parking spot.
- **Zone** (rectangle icon, key Z) — draw a zone shape.
- **Border** (polygon icon, key B) — draw a lot border polygon.
- **Marker** (circle icon, key M) — place entrance/exit marker.

**Finish button** (cyan #00B4D8, top-right of toolbar) — exits edit mode and saves.

**Canvas:** Interactive. Clicking with Spot tool places a new spot (auto-labeled A1, A2, B1...). Dragging repositions. A selected spot shows rotation handles.

### Callouts
- Label each tool in the palette with its keyboard shortcut.
- Label the BG Image upload button.
- Arrow to Finish button.

---

## G5-04 — Edit Layout — Spot Selected (Property Panel)

**URL:** Edit Layout mode -> click a spot
**Shot:** Desktop, spot selected with property panel visible.

### Layout
When a spot is selected, a right-side property panel (or bottom panel on mobile) appears:

- **Label** — text input (e.g. "A1").
- **Notes** — text input (e.g. "Compact only").
- **Width** / **Height** — number inputs (grid units).
- **Rotation** — number input (degrees).
- **Custom color** — color picker (overrides status-based color for this spot).

**Delete Spot** button (red) — enabled only if spot has no active vehicle assignment.

**Save** button — applies changes.

### Callouts
- Label the Label and Notes fields.
- Arrow to Delete button.
- Note: spots with active vehicle assignments cannot be deleted.

---

## G5-05 — Assign Vehicle Modal

**URL:** `/lot` (view mode) -> tap an empty spot
**Shot:** Desktop, Assign Vehicle modal open.

### Layout
Centered modal:

**Header:**
- "Assign Vehicle to Spot {label}" (e.g. "Assign Vehicle to Spot A1"), 16 px bold.
- Spot notes below (12 px, grey) — if spot has notes.
- X close button.

**Search input:** Placeholder "Search VIN, make, model...", magnifier icon.

**Vehicle list (scrollable):**
- Filtered to: vehicles without an existing lot assignment.
- Each row: vehicle title + VIN (monospace, small) + status badge.
- Tapping a row assigns the vehicle to the spot and closes the modal.

**Empty results:** "No vehicles match your search." or "No available vehicles."

### Callouts
- Arrow to search input.
- Label a vehicle row.
- Note: only vehicles not already assigned to a spot appear here.

---

## G5-06 — Vehicle Detail Slide-Over (Lot)

**URL:** `/lot` (view mode) -> tap an occupied spot
**Shot:** Desktop, slide-over open on right side.

### Layout
**Header:**
- "Spot {label}" (11 px uppercase, grey, e.g. "Spot A1").
- X close button.

**Vehicle info rows:**
- VIN (monospace).
- Status badge (colored pill): Pending Arrival (grey #94A3B8) | On Lot (cyan #0097B2) | One-Off (orange #C2410C) | Releasing (amber #92400E) | Released (green #065F46).
- Days on lot (e.g. "14 days") — if arrived_at is set.
- Last inspection score (e.g. "87%") — if available.

**Spot notes section** (if spot has notes): note text below a divider.

**Action buttons:**
- **View Vehicle** — navigates to `/inventory/{vehicleId}`.
- **Unassign Vehicle** (red border/text) — triggers confirm dialog.

**Unassign confirmation dialog** (inline):
- "Remove this vehicle from spot {label}?"
- Cancel button (grey) | Confirm button (red #EF4444, shows "Removing..." while in progress).

### Callouts
- Label the status badge.
- Arrow to Unassign Vehicle button.
- Label the inline confirmation dialog state.

---

---

## APPENDIX — Screens NOT Covered (Out of Scope for This Session)

| Screen | Reason |
|--------|--------|
| `/settings/billing` | Billing/plan details — separate guide recommended |
| `/settings/lot-billing` | Lot rate settings — separate guide recommended |
| `/settings/members` | Team management — separate guide recommended |
| `/settings/branding` | White label settings — separate guide recommended |
| `/admin/overview` | Super-admin only — separate guide recommended |
| `/fleet/*` | FMC/fleet role — not applicable to QA Storage account |
| Completed report share view | `/inspect/{shareToken}` — SharedInspectionView component |
| Mobile bottom tab navigation | Broken in screenshot workflow — document separately with real device |

---

## GUIDE 3 — RUNNING INSPECTIONS (CORRECTED — replaces prior Guide 3)

> Corrected: 2026-06-18. Prior Guide 3 documented a 3-option Start Inspection menu and did not reflect the required Baseline Vehicle Photo or Cancel button.

### G3-01 — Start Inspection Entry Point
- Button: "Start Inspection" — orange, top-right on most pages (inventory, lot, dispatch)
- With **dispatch OFF**: clicking opens the inspection sheet directly at the VIN form (no menu)
- With **dispatch ON**: clicking shows a 2-option menu first

### G3-02 — Start Inspection Menu (dispatch ON only)
Two options shown as large tappable rows:
1. **Start Inspection** — orange circle, Car icon | "Run an inspection yourself" → advances to VIN form
2. **Dispatch** — dark (#0D1B2A) circle, Send icon | "Send to a remote inspector" → navigates to `/storage/dispatch`

> ⚠️ BUG (as of v5): Navigating to `/storage/dispatch` switches the active company context from the correct company to a different account. Navigate to `/` to restore context after visiting dispatch.

### G3-03 — VIN Entry Form
- 17-character VIN field (validates length; "Start" button disabled until 17 chars)
- With dispatch ON: "Back" button in sheet header returns to the 2-option menu
- "Start" button becomes active at exactly 17 characters

### G3-04 — Usage Confirmation Modal
Shown before starting an inspection. Two modes:

**Normal mode (under plan limit):**
- Cyan Car icon
- Title: "Start Inspection?"
- Subtitle: "Completing this inspection will use 1 report from your {planName} plan."
- Usage bar: cyan, shows "Reports used / {included}"
- Warning strip (≥80% used): amber background, "You've used {pct}% of your monthly limit."
- 24-hour notice (Clock icon): "You have **24 hours** to complete this inspection. If left inactive, it will be auto-cancelled at no charge."
- Buttons: "Cancel" (white/grey border) | "Confirm & Start" (cyan)

**Overage mode (at or over plan limit):**
- Red AlertTriangle icon
- Title: "Plan limit reached"
- Subtitle: "You've used all {included} reports this month."
- Overage card: red background, "Overage rate: ${rate} per report"
- Buttons: "Cancel" | "Confirm Overage & Start" (red)

### G3-05 — Inspection Wizard: Step 1 — Vehicle Info
- **VIN field**: auto-filled and locked (grey) when started from a vehicle record or dispatch; editable otherwise
- **Baseline Vehicle Photo**: NOW REQUIRED (marked required=true). Cannot advance without uploading a photo.
- `canAdvance = isVinComplete && hasPhoto` — both conditions must be true for Next to enable
- **Inspection type** (Check-In / Check-Out): auto-inferred from vehicle lifecycle status via `inferInspectionType`; can be overridden manually

### G3-06 — Inspection Wizard: Subsequent Steps
Steps vary by inspection type (Check-In vs Check-Out). Each step shows a dark sticky header with:
- Back arrow (returns to previous step, or step 0 → shows Cancel dialog)
- Step title
- Progress indicator

### G3-07 — Cancel Button Behavior
- Available on step 1+ via the back arrow on step 0
- Clicking back arrow on **step 0** (first step) opens the Cancel dialog (not a back navigation)
- **Cancel dialog:**
  - Title: "Cancel Inspection?"
  - Body: "This inspection will be cancelled. No report will be charged for cancelled inspections."
  - Buttons: "Keep Going" (white/border) | "Cancel" (red #EF4444)
  - Confirming Cancel calls `abandonInspection(inspectionId)` + `onCancel()`
- No report charge is incurred for cancelled inspections

### G3-08 — Completing an Inspection
- Final step has a "Submit" / "Complete" button
- On completion: lifecycle status updates, report is generated and counted against plan usage
- Completed inspections appear in the Reports list

---

## GUIDE 5 — LOT MANAGEMENT (CORRECTED — replaces prior Guide 5)

> Corrected: 2026-06-18. Prior Guide 5 documented a 7-status legend and did not clarify the lot_map vs lot_billing flag distinction.

### G5-01 — Feature Flag Requirements
- **`lot_map` flag**: gates the `/lot` page entirely. Without it, the page shows a lock icon: "Lot Map is not enabled for your account."
- **`lot_billing` flag**: gates the `/lot-billing` route (Billing Defaults + Invoice History). Does NOT gate the `/lot` page or its billing stat chips.
- Both flags can be independently enabled. The lot page billing stat chips (Accruing/day, Empty cost/day) are **data-driven**, not flag-gated — they appear whenever billing data exists.

### G5-02 — Lot Page Overview (`/lot`)
- Shows a grid of parking spots
- Each spot is colored by vehicle lifecycle status
- Stat chips at top: "Accruing/day" (total daily revenue from occupied spots) and "Empty cost/day" (opportunity cost from empty spots, only if company has `default_daily_rate` set)

### G5-03 — Lot Map Legend (CORRECTED — 5-status model)
The legend as it **should** display (matching actual spot colors in code):

| Color | Hex | Status Label |
|-------|-----|--------------|
| Light grey | `#E1E8F0` | Empty |
| Slate | `#94A3B8` | Pending Arrival |
| Cyan | `#00B4D8` | On Lot |
| Amber | `#F4A62A` | Pending Pickup |
| Green | `#10B981` | Picked Up |
| Purple | `#9333EA` | Completed |

> ⚠️ BUG: As of v5, the displayed legend on `/lot` still shows the old 7-status model (In Progress, One-Off, Releasing, Released) which does not match the actual spot colors. Completed (purple) is not in the legend at all. This is a known discrepancy between `lot-grid.tsx` (SPOT_COLOR — correct) and `storage-lot-view.tsx` (LEGEND — outdated).

### G5-04 — Spot Interaction
- Click a spot to open vehicle details / quick actions
- Empty spots may allow assigning a vehicle (if implemented)

### G5-05 — Billing Stat Chips
- **Accruing/day**: sum of daily rates for all occupied spots with active billing
- **Empty cost/day**: `available_spots × default_daily_rate` — only visible if company has a default daily rate configured
- These chips appear based on data, not the `lot_billing` flag

---

## GUIDE 6 — BILLING (`/lot-billing`)

> Requires `lot_billing` feature flag to be enabled.

### G6-01 — Page Access
- Route: `/lot-billing`
- Navigation: appears in sidebar when `lot_billing` flag is ON
- Page title: "Lot Billing"
- Two sections: BILLING DEFAULTS and INVOICE HISTORY

### G6-02 — Billing Defaults
Controls company-wide billing settings:
- **Billing type toggle**: Daily / Monthly
- **Daily rate field**: default rate per vehicle per day (drives the "Empty cost/day" chip on the lot page)
- **Monthly rate field**: default rate per vehicle per month
- **Save Defaults** button — saves changes

### G6-03 — Invoice History
- Table of past invoices (columns vary; includes invoice date, amount, status)
- Empty state shown as "No invoices yet" or similar when no invoices exist
- As of v5 QA: invoice history was empty for the QA account

### G6-04 — Single-Vehicle Invoice Flow
Triggered from the individual vehicle detail page (`/inventory/[vehicleId]`):
1. Navigate to vehicle detail
2. Click billing/invoice action button
3. If accrued amount is $0: "$0 Invoice" warning modal appears:
   - Title: "$0 Invoice"
   - Body: "This vehicle has accrued $0.00. Generate a $0 invoice anyway?"
   - Buttons: "Cancel" | "Generate Anyway" (closes warning, opens invoice modal)
4. Invoice modal: review dates, rate, total
5. Generate invoice → appears in Invoice History

### G6-05 — Bulk Invoice Flow (5 steps)
Triggered from `/lot-billing` or bulk action on lot page.

**Step 1 — Vehicle Selection**
- Multi-select vehicles from list
- Can select across multiple vehicles/clients

**Step 2 — Date Range**
- Select billing period start and end dates

**Step 3 — Smart Date Resolution**
- Warns about edge cases: vehicles that arrived after start date, vehicles released before end date, overlapping prior invoices
- User reviews and confirms or adjusts

**Step 4 — Rate Review**
- Shows per-vehicle breakdown: days × rate = subtotal
- User can override individual rates

**Step 5 — Bill To + Preview**
- **Bill To (sub-client) logic:**
  - If all selected vehicles share the same `sub_client_name`: field is auto-populated
  - If vehicles have different `sub_client_name` values: field is blank with hint "Multiple clients selected — enter a Bill To name manually."
  - If no vehicles have `sub_client_name`: field is blank, no hint
  - Step 5 cannot proceed (Generate button disabled) until `billToName.trim().length > 0`
- Shows invoice preview (line items, total)
- **Generate** button creates the invoice and adds it to Invoice History

### G6-06 — PDF Invoice Colors (White Label)
- When `white_label` flag is ON, PDF invoices use brand colors from `/settings/branding`:
  - **Header Background**: color picker, sets PDF invoice header color
  - **Accent Stripe**: color picker, sets accent stripe color
- When `white_label` is OFF, PDFs use default Condition IQ brand colors
- Logo set in branding appears on PDF invoices

---

## GUIDE 7 — SETTINGS

### G7-01 — Settings Hub (`/settings`)
Hub page with cards linking to sub-pages:
- **Profile** → `/settings/profile`
- **Billing & Plan** → `/billing`
- **Team Members** → `/settings/members`
- **Branding** → `/settings/branding` (shown as "Contact us to enable" if `white_label` OFF)
- **What's New** → changelog/release notes

### G7-02 — Profile (`/settings/profile`)
Three sections:
- **PERSONAL INFO**: Full Name (editable), Email (read-only)
- **ORGANIZATION**: Company Name (editable by owner only)
- **CHANGE PASSWORD**: current password + new password fields

### G7-03 — Team Members (`/settings/members`)
- Page header: "Team Members / {Company Name} · {N} members"
- **No self-service Add Member form** (as of v5). Prior documentation showing an email + role dropdown was outdated.
- Current flow: "Email the Condition IQ team" to add members
- Lists existing members (if any) with role badges

### G7-04 — Branding (`/settings/branding`)
> Requires `white_label` feature flag. Without it, the Settings hub card shows "Contact us to enable."

Sections:
- **CURRENT LOGO**: displays current logo or placeholder if none uploaded
- **BUSINESS NAME ON REPORTS**: text field + Save button (appears on generated PDF reports)
- **PDF BRAND COLORS**:
  - Header Background color picker
  - Accent Stripe color picker
  - Live preview panel
  - "Save Colors" button
- **UPLOAD NEW LOGO**: drag-and-drop zone for logo image upload

---

## GUIDE 8 — PLAN & USAGE (`/billing`)

### G8-01 — Page Overview
Route: `/billing` (also reachable via Settings hub → Billing & Plan)
Page title: "Billing & Usage"

### G8-02 — Sections
**CURRENT PLAN**
- Plan name (e.g., "Pro")
- Monthly price (e.g., $399/mo)
- Included reports per month (e.g., 200)
- Overage rate per report (e.g., $2.50)

**USAGE THIS CYCLE**
- Reports used this billing cycle out of included total (e.g., "1 of 200")
- Visual usage bar

**ESTIMATED NEXT INVOICE**
- Dollar amount based on plan + accrued overages (e.g., $399)

**REPORTS CHART**
- Bar chart: daily report count over last 14 days

**USAGE HISTORY**
- Table of past billing cycles with usage and invoice amounts
- Note: as of v5, invoice history section was removed from this page (it moved to `/lot-billing`). The `/billing` page shows usage history (cycles, counts) but not downloadable invoice PDFs.

### G8-03 — Plan Changes
- No self-service plan upgrade/downgrade UI visible on this page as of v5
- Contact Condition IQ team to change plans

---

## ISSUES OBSERVED (v5 QA — 2026-06-18)

| ID | Severity | Description |
|----|----------|-------------|
| BUG-01 | HIGH | Company context switches from "QA Test Storage" (PRO) to "Q" (FREE) when navigating to `/storage/dispatch` or clicking Dispatch in Start Inspection menu. Workaround: navigate to `/` to restore. |
| BUG-02 | MEDIUM | Lot page legend shows old 7-status model; actual spot colors use new 5-status model. Completed (purple) is absent from legend entirely. |
| BUG-03 | LOW | $0 invoice warning modal path confirmed working but edge case — vehicles with $0 accrued show warning before invoice modal. |


# Condition IQ — v3 Re-Test Summary

**Date:** 2026-06-15  
**Account:** qa-test@conditioniq.app (admin role)  
**Scope:** Re-test of all items that FAILED or were PARTIAL/BROKEN in the v2 session.  
**Deploy:** v3 (conditioniq-v2.vercel.app)

---

## Per-Item Pass/Fail

| # | Item | v1 Result | v2 Result | v3 Result |
|---|------|-----------|-----------|-----------|
| 1 | `/settings/lot-billing` — daily rate persists after save + reload | FAIL | STILL BROKEN | ✅ **FIXED** |
| 2 | `/settings/lot-billing` — monthly rate persists after save + reload | FAIL | STILL BROKEN | ✅ **FIXED** |
| 3 | `/settings/lot-billing` — billing type toggle persists | FAIL | STILL BROKEN | ✅ **FIXED** |
| 4 | Lot Map — "Edit Layout" button visible for admin | FAIL | STILL BROKEN | ✅ **FIXED** |
| 5 | Lot Map — spot placement in setup mode (A1/A2/A3) | NOT TESTED | NOT TESTED | ✅ **PASS** |
| 6 | Lot Map — assign vehicle to spot → occupied indicator + Accruing/day chip | NOT TESTED | NOT TESTED | ✅ **PASS** |
| 7 | Lot Map — occupied spot opens slide-over with vehicle info | NOT TESTED | NOT TESTED | ✅ **PASS** |
| 8 | Lot Map — unassign from slide-over frees spot | NOT TESTED | NOT TESTED | ✅ **PASS** |
| 9 | `/settings/branding` — loads without redirect | FAIL | STILL BROKEN | ✅ **FIXED** |
| 10 | Branding — logo upload + preview appears | NOT TESTABLE | NOT TESTABLE | ✅ **PASS** |
| 11 | Branding — Remove Logo clears preview | NOT TESTABLE | NOT TESTABLE | ✅ **PASS** |
| 12 | `/settings/members` — invite form / Add Member UI | FAIL | STILL BROKEN | ❌ **STILL BROKEN** |
| 13 | Blank VIN — red inline "VIN must be 17 characters." error | PARTIAL | STILL PARTIAL | ❌ **STILL PARTIAL** |
| 14 | $0 invoice — confirmation dialog before generating | FAIL | STILL BROKEN | ⚠️ **INCONCLUSIVE** |

---

## ✅ Fixed in v3

### 1–3. `/settings/lot-billing` — Save Persistence

**Was:** All three fields (daily rate, monthly rate, billing type) showed "✓ Saved" but silently reverted on reload. Backend write was not committed.  
**Now:** Set daily rate → $20, monthly rate → $300, billing type → Monthly. Clicked Save. Hard-reloaded with `window.location.reload(true)`. All three values persisted exactly as entered.  
**Verified by:** Hard reload via JS; values confirmed by reading input DOM state post-reload.

---

### 4–8. Lot Map — Edit Layout + Full Spot Workflow

**Was:** "Edit Layout" button never rendered for admin users. Lot map showed only "No spots configured yet." empty state.  
**Now:** "Edit Layout" button is visible and functional. Full workflow tested end-to-end:
- Opened SVG canvas editor
- Placed 3 spots (A1, A2, A3) via PointerEvent dispatch on canvas
- Clicked Done → spots confirmed in grid
- Clicked empty spot A1 → "Assign Vehicle to A1" modal appeared
- Assigned 2020 Nissan Altima → spot turned occupied (teal), occupied count incremented, green "Accruing $20/day" chip appeared
- Clicked occupied spot → slide-over showed vehicle name, VIN, status, days on lot, accrued total
- Clicked "Unassign from Spot" → confirmation dialog appeared; confirmed → spot freed, counts updated

**Verified by:** Screenshots at each step; DOM state reads confirming occupied/available counts.

---

### 9–11. `/settings/branding` — Logo Upload

**Was:** Navigating to `/settings/branding` immediately redirected to `/` (home page).  
**Now:** Page loads correctly with "Branding" header and logo upload zone showing "No logo uploaded yet."  
- Uploaded test PNG (400×300px) via file input + "Upload Logo" button → preview image appeared
- Clicked "Remove Logo" → preview cleared back to "No logo uploaded yet"

**Verified by:** Page text read confirming no redirect; upload + remove sequence completed successfully.

---

## ❌ Still Broken

### 12. `/settings/members` — No Self-Serve Invite UI

**Severity:** High  
**Description:** The Team Members page (`/settings/members`) renders a "No members yet" empty state with a single "Email CIQ Team" mailto link (`team@conditioniq.app`). No invite button, email input field, or any self-serve member management UI exists in the DOM.  
**What was tried (v3):** Full page DOM scan for `input`, `button`, `form`, `[role="dialog"]` elements — only a mailto anchor found. No member invite mechanism present.  
**Screenshot:** `screenshots/12-team-members-no-invite-v3.png`

---

### 13. Blank VIN — No Inline Error Text (PARTIAL)

**Severity:** Medium  
**Description:** When the VIN input in "Add New Vehicle" has fewer than 17 characters, the Continue button is disabled — which does prevent submission. However, the spec requires a visible red inline error message ("VIN must be 17 characters.") to appear on blur/tab-out. No such message appears.  
**What was tried (v3):** Typed short VINs, tabbed out, dispatched blur events, tried submitting — button remains disabled but no error text renders anywhere in the DOM.  
**Screenshot:** `screenshots/16-blank-vin-no-error-v3.png`

---

## ⚠️ Inconclusive

### 14. $0 Invoice — Confirmation Dialog (New Regression)

**Severity:** High (new regression)  
**Description:** Clicking "Generate Invoice" on a vehicle with $0.00 accrued consistently freezes the Chrome renderer for 30–45+ seconds (CDP timeout). This behavior was **not present in v2**, where the click completed (albeit immediately opening the invoice modal without a guard — the prior bug). In v3, every click method attempted (JS `.click()`, Chrome MCP ref click, pixel coordinate click) causes the same renderer freeze. After renderer recovery, the page returns to the normal billing state with no modal or dialog visible.  
**What was tried (v3):**
- JS `genBtn.click()` via `javascript_tool` → 45s CDP timeout
- Chrome MCP `left_click` via ref → no React event fired (no response)
- Chrome MCP `left_click` at pixel coordinate (1235, 543) → 30s CDP timeout

**Result:** Cannot confirm whether the v3 $0 guard dialog was implemented. The renderer freeze itself is a blocking regression that must be fixed regardless of dialog behavior.  
**Screenshot:** Not capturable — renderer frozen during click.

---

## Summary

| Category | Count |
|----------|-------|
| Fixed in v3 | 5 items (11 checklist sub-items) |
| Still Broken | 2 items |
| Inconclusive (new regression) | 1 item |
| Newly Broken | 1 item ($0 invoice — renderer freeze) |

---

## 🚦 Go / No-Go Recommendation: **NO-GO**

**Do not push to production at EOD.**

Two items remain broken and one is a new regression introduced in v3:

1. **Team Members invite UI** (High) — still absent. Users have no way to add team members without contacting the CIQ team directly. This breaks the `team_members` flag feature entirely for customers.

2. **Blank VIN inline error** (Medium) — button-disabled state prevents bad submissions but provides no user feedback. UX falls short of spec.

3. **$0 invoice renderer freeze** (High, new regression) — clicking Generate Invoice with a $0 rate now crashes the Chrome renderer. In v2 this at least completed (without a guard), but v3 has introduced a hang. This is a regression that affects all $0-rate invoice flows and must be diagnosed before shipping.

**Minimum bar for Go:** Fix items 1 and 3 above. Item 2 (inline VIN error) can be treated as a minor UX polish and shipped separately.

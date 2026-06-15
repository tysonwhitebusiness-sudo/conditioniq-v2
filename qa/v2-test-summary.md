# Condition IQ — v2 Re-Test Summary

**Date:** 2026-06-14  
**Account:** qa-test@conditioniq.app (admin role)  
**Scope:** Re-test of items that previously FAILED or were BLOCKED in the initial test session.  
**Deploy:** v2 (conditioniq-v2.vercel.app)

---

## Per-Item Pass/Fail

| # | Item | v1 Result | v2 Result |
|---|------|-----------|-----------|
| 1 | Lot Map — Edit Layout / "Set Up Lot Layout" button visible for admin | FAIL | **STILL BROKEN** |
| 2 | `/settings/branding` — loads for admin with `white_label` flag, no redirect | FAIL | **STILL BROKEN** |
| 3 | `/settings/members` — Add Member / invite UI renders | FAIL | **STILL BROKEN** |
| 4 | `/settings/lot-billing` — daily rate persists after save + reload | FAIL | **STILL BROKEN** |
| 5 | `/settings/lot-billing` — monthly rate persists after save + reload | FAIL | **STILL BROKEN** |
| 6 | `/settings/lot-billing` — billing type toggle (Daily/Monthly) persists | FAIL | **STILL BROKEN** |
| 7 | Vehicle detail Billing card — "Saved ✓" toast visible without scrolling | FAIL | ✅ **FIXED** |
| 8 | Blank VIN — red "VIN must be 17 characters" inline error appears | PARTIAL | **STILL PARTIAL** |
| 9 | $0 invoice — confirmation dialog appears before generating | FAIL | **STILL BROKEN** |
| 10 | Wizard Collapse ↑ — physical click keeps wizard open | FAIL | ✅ **FIXED** |

---

## ✅ Fixed in v2

### 7. Vehicle Detail Billing Card — "Saved ✓" Toast

**Was:** Clicking "Save Billing" scrolled the page to the top, pushing the toast out of view.  
**Now:** "Saved ✓" text appears directly on the Save button in-place. Page does not scroll. Toast is fully visible at any scroll position.  
**Verified by:** Physical click at screen coordinates; measured `window.scrollY` before (640.5) and after (640.5) — no movement.

---

### 10. Wizard Collapse ↑ — Physical Click

**Was:** Clicking the "Collapse ↑" button on an exterior damage item dismissed the entire wizard overlay.  
**Now:** Physical click at coordinates (660, 360) on Step 6 Exterior — wizard remained open at Step 6. Damage item collapsed to summary row.  
**Verified by:** Screenshot confirmation; page title still showed wizard Step 6.

---

## 🔴 Still Broken

### 1. Lot Map — Edit Layout Button

The "Edit Layout" / "Set Up Lot Layout" button is not rendered for admin users with `lot_map` flag. Tested at both desktop (1512px) and mobile (390px) viewports. DOM search, body text scan, and React fiber inspection all confirm the button never renders. The page shows only: "No spots configured yet. Ask an admin to set up the lot layout."

### 2. `/settings/branding` — Redirect

Navigating to `/settings/branding` immediately redirects to `/` (home page) for admin users with the `white_label` flag enabled. Route may not exist or the flag-gate middleware is misconfigured.

### 3. `/settings/members` — No Invite UI

The `/settings/members` page loads and renders the "No members yet" empty state, but contains no invite button, email input, or any mechanism to add members. The entire invite UX is absent from the DOM.

### 4–6. `/settings/lot-billing` — Save Not Persisting

All three fields (daily rate, monthly rate, billing type toggle) fail to persist on reload:
- Daily rate: set to $12 → "✓ Saved" displayed → reload → reverts to $8
- Monthly rate: set to $250 → "✓ Saved" displayed → reload → reverts to $200
- Billing type: set to Monthly → "✓ Saved" displayed → reload → reverts to Daily

The save handler appears to trigger a UI success state but is not committing the data to the backend (Supabase). The "✓ Saved" feedback is misleading.

### 8. Blank VIN — No Inline Error Text

When the VIN input has fewer than 17 characters, the Continue button is disabled. However, no inline error message ("VIN must be 17 characters" or similar) appears on blur, tab-out, or submit attempt. Spec requires a visible red inline error; only button-disabled state is present.

### 9. $0 Invoice — No Confirmation Dialog

Setting a vehicle's billing rate to $0 and clicking "Generate Invoice" opens the invoice generation modal immediately with "Total: $0.00" and no warning, confirmation step, or block. Zero-value invoices are generated silently.

---

## Summary

| Category | Count |
|----------|-------|
| Fixed in v2 | 2 |
| Still Broken | 7 (across 6 issue areas + 1 still-partial) |
| Newly Broken | 0 |

The v2 deploy resolved 2 of the 10 re-tested items. The remaining 7 issues — including lot billing persistence (the most impactful UX regression), branding page redirect, and missing member invite flow — require further fixes.

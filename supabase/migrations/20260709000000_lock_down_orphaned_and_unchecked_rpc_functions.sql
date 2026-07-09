-- Security fix, discovered during the schema/migration-drift documentation project
-- (fresh audit of every function's EXECUTE grants, prompted by finding several
-- functions with no corresponding tracked migration at all).
--
-- Two root causes closed here:
--
-- 1. Four functions are entirely orphaned — confirmed via an exhaustive search of
--    every .rpc(...) call site in the application codebase, not just these names —
--    yet had EXECUTE granted to both `anon` and `authenticated`, making them directly
--    callable by anyone with only the public anon key, no login required.
--    `submit_remote_inspection` in particular could, given only a valid unexpired
--    unused inspection_requests.token, insert a fully fabricated "completed" vehicle
--    inspection report with arbitrary condition data, bypassing every authorization
--    and fraud-resistance mechanism built during this app's guest-inspection
--    remediation work (chain of custody, GPS, signature, photo hashes, company-staff
--    checks). `create_remote_inspection`/`finalize_remote_inspection` share the same
--    token-only gate; `get_inspection_request` is the same family, lower severity
--    (read-only, returns nothing beyond what a token holder is already entitled to).
--
-- 2. `reset_billing_cycles()` takes no parameters and resets every eligible
--    company's `reports_used` to 0 early, advancing `billing_cycle_start` by 30 days.
--    It has a genuine legitimate caller — confirmed via pg_cron (`cron.job` shows
--    `reset-billing-cycles`, daily at midnight) — but that caller invokes it directly
--    in-database, not through the PostgREST/anon-key surface these grants govern.
--    With `anon` EXECUTE granted, anyone could call this directly and force an early,
--    free reset of every eligible company's usage allowance, repeatable at will.
--
-- A third function, get_next_invoice_number(p_company_id), is genuinely called by
-- three real application call sites (invoice-actions.ts, invoice-group-actions.ts,
-- bulk-invoice-actions.ts), so it is NOT revoked outright — instead it gets the
-- caller-authorization check it was missing, since anyone could previously call it
-- with an arbitrary company_id to increment/corrupt that company's invoice sequence
-- counter.
--
-- Four related, currently-safe-but-architecturally-stale functions
-- (can_inspect_location, get_user_company, get_user_role, is_user_admin — all check
-- user_profiles.role, the pre-reconciliation column, and are already de-facto
-- neutralized by their own auth.uid() gating) are deliberately left untouched here,
-- queued separately as a lower-priority cleanup, not an urgent fix.

-- ── 1. Orphaned functions: revoke EXECUTE entirely ──────────────────────────────

REVOKE EXECUTE ON FUNCTION public.create_remote_inspection(text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_remote_inspection(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_remote_inspection(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_inspection_request(text) FROM anon, authenticated;

-- ── 2. reset_billing_cycles: revoke EXECUTE — legitimate caller is pg_cron, which
--       invokes it in-database and does not use these grants at all ────────────────

REVOKE EXECUTE ON FUNCTION public.reset_billing_cycles() FROM anon, authenticated;

-- ── 3. get_next_invoice_number: add the missing caller-authorization check,
--       keep it working for its three real, authenticated call sites ────────────────

CREATE OR REPLACE FUNCTION public.get_next_invoice_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_seq integer;
BEGIN
  IF NOT (
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND company_id = p_company_id)
    OR is_platform_owner()
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.companies
  SET invoice_number_seq = invoice_number_seq + 1
  WHERE id = p_company_id
  RETURNING invoice_number_seq INTO v_seq;

  RETURN 'INV-' || LPAD(v_seq::text, 4, '0');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_next_invoice_number(uuid) FROM anon;

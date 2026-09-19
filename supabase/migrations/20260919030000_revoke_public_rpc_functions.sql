-- Audit, 19 Sep 2026: reset_billing_cycles() was still callable by anyone
-- through /rest/v1/rpc. The July lockdown revoked it from anon and
-- authenticated, but the live grants still included both, and PUBLIC keeps
-- the default EXECUTE on every function. Nothing in the app calls it and no
-- pg_cron job uses it; the service role keeps access.

revoke execute on function public.reset_billing_cycles() from public, anon, authenticated;

-- The four orphaned remote-inspection functions from the same July lockdown
-- were also still callable by anyone (anon, authenticated and PUBLIC all held
-- EXECUTE live). submit_remote_inspection could insert a fabricated completed
-- report with only a link token. None is called by the app.
revoke execute on function public.create_remote_inspection(text, uuid) from public, anon, authenticated;
revoke execute on function public.finalize_remote_inspection(text) from public, anon, authenticated;
revoke execute on function public.submit_remote_inspection(text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.get_inspection_request(text) from public, anon, authenticated;

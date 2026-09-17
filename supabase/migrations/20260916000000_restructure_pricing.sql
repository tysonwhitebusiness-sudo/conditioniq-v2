-- Pricing restructure (rollout plan, Phase 5).
--
-- Plans become Demo, Operations, Pro and Enterprise. Starter is eliminated and
-- Growth is renamed Operations. Every paid plan gets the whole platform; plans
-- differ by vehicles, reports and seats. All four add-on SKUs are retired.
--
-- Apply this immediately AFTER the new code is live, not before. The previous
-- code only knows starter/growth/pro, so renamed tiers, deleted flag rows and the
-- stopped cron would break it. The new code tolerates the old tier names
-- (lib/pricing.ts normalizes them); until this runs, only the admin billing
-- screen's held-price save fails, and held prices do not display.
--
-- Expand/contract: legacy_pricing and reports_used are left in place. Nothing
-- reads them any more; drop them in a later migration once this deploy is
-- verified.

begin;

-- ── 1. Held prices ────────────────────────────────────────────────────────────
-- Grandfathered accounts keep their price on the Operations feature set. A
-- single legacy_pricing boolean could not do this: the two Starter accounts pay
-- different prices ($99 and $59), so the price itself is now stored.

alter table companies add column if not exists price_override_monthly numeric
  check (price_override_monthly is null or price_override_monthly >= 0);
alter table companies add column if not exists price_override_annual numeric
  check (price_override_annual is null or price_override_annual >= 0);

-- Values are the retired plans' list prices from lib/pricing.ts at the time of
-- the restructure. Guarded so re-running never overwrites a price set by hand.
update companies
   set price_override_monthly = 99, price_override_annual = 990
 where subscription_tier = 'starter'
   and price_override_monthly is null and price_override_annual is null;

update companies
   set price_override_monthly = 59, price_override_annual = 708
 where subscription_tier = 'legacy_starter'
   and price_override_monthly is null and price_override_annual is null;

-- ── 2. Report allowances ──────────────────────────────────────────────────────
-- reports_included holds a per-company override. On retired plans it was only a
-- copy of the old plan default (15 / 30 / 75), which would cap these accounts
-- below the 150 that Operations includes. Clear those copies so the plan applies.
-- A value that differs from the old default was set deliberately and is kept.
update companies set reports_included = null
 where (subscription_tier = 'legacy_starter' and reports_included = 15)
    or (subscription_tier = 'starter'        and reports_included = 30)
    or (subscription_tier = 'growth'         and reports_included = 75);

-- "Unlimited" was stored as 9999, 99999 or null. The code now uses null alone.
update companies set reports_included = null
 where subscription_tier = 'enterprise' and reports_included >= 9999;

-- Demo is 5 reports. Old demo accounts carried 3 or 10.
update companies set reports_included = null
 where subscription_tier = 'demo';

-- ── 3. Plan names ─────────────────────────────────────────────────────────────
update companies set subscription_tier = 'operations'
 where subscription_tier in ('starter', 'legacy_starter', 'growth', 'basic');

-- 'basic' was a column default that no account ever used.
alter table companies alter column subscription_tier set default 'demo';

-- ── 4. Feature flag rows ──────────────────────────────────────────────────────
-- Per-company rows override plan defaults, so an explicit "off" row keeps a
-- feature off even after the plan includes it. Both paying customers carry
-- white_label = false from the add-on era, which would stop them receiving the
-- white label the new plan gives them.

-- Retired keys (Phase 4). Already ignored by the code; removed for tidiness.
delete from company_feature_flags
 where feature_key in ('dispatch', 'send_to_inspector');

-- Former add-on toggles that every plan now includes.
delete from company_feature_flags
 where enabled = false
   and feature_key in ('lot_map', 'lot_billing', 'reporting_export');

-- White label is included on paid plans only; a demo keeps its "off".
delete from company_feature_flags f
 using companies c
 where f.company_id = c.id
   and f.enabled = false
   and f.feature_key = 'white_label'
   and c.subscription_tier in ('operations', 'pro', 'enterprise');

-- The nightly reset-billing-cycles job zeroes reports_used (no longer read) and
-- adds 30 days to billing_cycle_start. The app now derives each cycle from that
-- column's day of month, so adding 30 days would walk every account's billing
-- day backwards by a day or two each month. Stop the job; the column stays a
-- fixed anchor. The function itself is left in place, unscheduled.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'reset-billing-cycles') then
    perform cron.unschedule('reset-billing-cycles');
  end if;
end $$;

commit;

-- ── Verify after applying ─────────────────────────────────────────────────────
-- select name, subscription_tier, price_override_monthly, price_override_annual,
--        reports_included
--   from companies order by name;
--
-- Expected for the two paying customers:
--   Big Rig Parking   operations  99  990  null
--   Park My Tractor   operations  59  708  null
--
-- select c.name, f.feature_key, f.enabled
--   from company_feature_flags f join companies c on c.id = f.company_id
--  where f.enabled = false;
--   -> no white_label, lot_map, lot_billing or reporting_export rows for paid plans
--
-- select jobname from cron.job where jobname = 'reset-billing-cycles';
--   -> no rows

-- Phase 5: customer-level rate override, one precedence layer below the existing
-- per-vehicle override on storage_vehicles (daily_rate/monthly_rate/billing_type
-- there stays highest-precedence — a human explicitly set it for that one work
-- order) and above the company-wide default. Column names/types deliberately
-- match companies.default_daily_rate / default_monthly_rate / default_billing_type
-- exactly, for direct consistency with the existing fallback chain.
alter table customers add column default_daily_rate numeric;
alter table customers add column default_monthly_rate numeric;
alter table customers add column default_billing_type text check (default_billing_type in ('daily', 'monthly'));

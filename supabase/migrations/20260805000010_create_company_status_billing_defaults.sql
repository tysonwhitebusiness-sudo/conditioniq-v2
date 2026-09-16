-- Phase 5 (Service Logging / status-based billable defaults): whether storage is
-- actively accruing revenue for each of the 10 work_order_status values,
-- company-configurable. Sparse — mirrors company_feature_flags' own shape and
-- sparseness (only explicitly-configured statuses get a row; anything absent
-- falls back to the hardcoded default map in lib/billing-defaults-actions.ts).
create table company_status_billing_defaults (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  status      text not null check (status in (
    'pending_arrival', 'checked_in', 'in_storage', 'on_lot_pending_repairs',
    'on_lot_repairs_complete', 'off_lot', 'on_hold', 'pending_release',
    'ready_for_release', 'released'
  )),
  is_billable boolean not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (company_id, status)
);

create index idx_company_status_billing_defaults_company on company_status_billing_defaults(company_id);

alter table company_status_billing_defaults enable row level security;

create policy company_status_billing_defaults_select on company_status_billing_defaults
  for select using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy company_status_billing_defaults_insert on company_status_billing_defaults
  for insert with check (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy company_status_billing_defaults_update on company_status_billing_defaults
  for update using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy company_status_billing_defaults_delete on company_status_billing_defaults
  for delete using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

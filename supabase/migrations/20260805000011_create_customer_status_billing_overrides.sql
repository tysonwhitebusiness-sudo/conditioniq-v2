-- Phase 5: customer-level override of company_status_billing_defaults. Same
-- shape, scoped to customer_id instead of company_id. company_id is included
-- directly (not derived via a join through customers) — matches every other
-- RLS'd table in this schema.
--
-- Precedence (evaluated in lib/billing-defaults-actions.ts):
--   customer_status_billing_overrides > company_status_billing_defaults > hardcoded fallback
create table customer_status_billing_overrides (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id),
  customer_id uuid not null references customers(id) on delete cascade,
  status      text not null check (status in (
    'pending_arrival', 'checked_in', 'in_storage', 'on_lot_pending_repairs',
    'on_lot_repairs_complete', 'off_lot', 'on_hold', 'pending_release',
    'ready_for_release', 'released'
  )),
  is_billable boolean not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (customer_id, status)
);

create index idx_customer_status_billing_overrides_company on customer_status_billing_overrides(company_id);
create index idx_customer_status_billing_overrides_customer on customer_status_billing_overrides(customer_id);

alter table customer_status_billing_overrides enable row level security;

create policy customer_status_billing_overrides_select on customer_status_billing_overrides
  for select using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy customer_status_billing_overrides_insert on customer_status_billing_overrides
  for insert with check (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy customer_status_billing_overrides_update on customer_status_billing_overrides
  for update using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy customer_status_billing_overrides_delete on customer_status_billing_overrides
  for delete using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

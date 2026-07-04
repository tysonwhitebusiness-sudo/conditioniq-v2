-- Tracks which vehicle_charges (fees / report costs) have been included on an invoice,
-- so the same charge can't be billed twice and "unbilled" charges can be computed.
create table if not exists lot_invoice_charges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references lot_invoice_groups(id) on delete cascade,
  vehicle_charge_id uuid not null unique references vehicle_charges(id) on delete restrict,
  company_id uuid not null references companies(id),
  amount numeric not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lot_invoice_charges_group on lot_invoice_charges(group_id);

alter table lot_invoice_charges enable row level security;

create policy invoice_charges_select on lot_invoice_charges
  for select using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy invoice_charges_insert on lot_invoice_charges
  for insert with check (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy invoice_charges_update on lot_invoice_charges
  for update using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy invoice_charges_delete on lot_invoice_charges
  for delete using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

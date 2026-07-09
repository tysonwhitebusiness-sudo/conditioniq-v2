-- Re-apply the lot_invoice_charges table from the prior migration, which was
-- never actually run against this database (confirmed missing via
-- information_schema.tables). Tracks which vehicle_charges (fees / report
-- costs) have been included on an invoice, so a charge can't be billed twice.
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

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'lot_invoice_charges' and policyname = 'invoice_charges_select') then
    create policy invoice_charges_select on lot_invoice_charges
      for select using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lot_invoice_charges' and policyname = 'invoice_charges_insert') then
    create policy invoice_charges_insert on lot_invoice_charges
      for insert with check (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lot_invoice_charges' and policyname = 'invoice_charges_update') then
    create policy invoice_charges_update on lot_invoice_charges
      for update using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lot_invoice_charges' and policyname = 'invoice_charges_delete') then
    create policy invoice_charges_delete on lot_invoice_charges
      for delete using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));
  end if;
end $$;

-- Persistent billing-period tracking: billed_through_date is the single source
-- of truth for how far a vehicle's storage has been invoiced. It only ever
-- moves forward when a new invoice includes storage, and is never touched by
-- invoice status changes (Sent/Paid/Overdue/Void).
alter table storage_vehicles
  add column if not exists billed_through_date date;

-- Records the exact calendar range each invoice's storage line covered.
alter table lot_invoices
  add column if not exists storage_period_start date,
  add column if not exists storage_period_end date;

-- One-time backfill: seed billed_through_date for vehicles that already have
-- invoice history, using the old day-sum approximation, so their "unbilled"
-- count doesn't suddenly jump on the next invoice.
update storage_vehicles sv
set billed_through_date = (sv.arrived_at::date + (coalesce((
  select sum(li.days_on_lot)
  from lot_invoices li
  left join lot_invoice_groups g on g.id = li.group_id
  where li.vehicle_id = sv.id
    and coalesce(g.status, li.status) != 'void'
), 0) * interval '1 day'))::date
where exists (select 1 from lot_invoices li2 where li2.vehicle_id = sv.id)
  and sv.billed_through_date is null;

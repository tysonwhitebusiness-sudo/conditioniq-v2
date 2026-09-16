-- Foundation phase: one durable record per physical vehicle (VIN), decoupled from
-- storage_vehicles which now represents a single visit/work-order (see
-- 20260805000001 and 20260805000002 for the accompanying work-order changes).
-- storage_vehicles.year/make/model become the intake-time snapshot; vehicle_master
-- holds the current/live identity data. Color/plate deliberately omitted — nothing
-- writes to them yet, they belong in the intake/outtake form phase that will
-- actually capture them.
create table if not exists vehicle_master (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  vin text not null,
  year text,
  make text,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, vin)
);

create index if not exists idx_vehicle_master_company on vehicle_master(company_id);

alter table vehicle_master enable row level security;

create policy vehicle_master_select on vehicle_master
  for select using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy vehicle_master_insert on vehicle_master
  for insert with check (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy vehicle_master_update on vehicle_master
  for update using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

-- Backfill: one vehicle_master row per (company_id, vin), seeded from that VIN's
-- most-recently-created storage_vehicles row (most likely to reflect current data).
insert into vehicle_master (company_id, vin, year, make, model)
select distinct on (company_id, vin)
  company_id, vin, year, make, model
from storage_vehicles
order by company_id, vin, created_at desc;

-- Phase 4 (Intake/Outtake): one header record per direction per work order.
-- Distinct from damage_markers (which can have many rows per direction) — this
-- holds the single snapshot of mileage/fuel/keys/photos/notes/inspector for one
-- intake or one outtake pass.
--
-- vehicle_id follows the same FK-naming precedent as damage_markers,
-- lot_vehicle_assignments, vehicle_events, vehicle_charges, lot_invoices — all
-- point at storage_vehicles.id under the name vehicle_id.
--
-- on delete restrict, not cascade: same history-preservation requirement as
-- damage_markers — a deleted storage_vehicles row must not silently wipe its
-- checkpoints.
--
-- UNIQUE (vehicle_id, direction) enforces "run once each per work order" at
-- the DB level, not just app logic.
create table vehicle_checkpoints (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id),
  vehicle_id       uuid not null references storage_vehicles(id) on delete restrict,
  direction        text not null check (direction in ('intake', 'outtake')),
  odometer         integer,
  fuel_level       text check (fuel_level in ('E', '1/4', '1/2', '3/4', 'F')),
  key_count        integer not null default 0,
  photos           text[] not null default '{}',
  belongings_note  text,
  notes            text,
  inspector_id     uuid not null references user_profiles(id),
  created_at       timestamptz not null default now(),
  unique (vehicle_id, direction)
);

create index idx_vehicle_checkpoints_company on vehicle_checkpoints(company_id);

alter table vehicle_checkpoints enable row level security;

create policy vehicle_checkpoints_select on vehicle_checkpoints
  for select using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy vehicle_checkpoints_insert on vehicle_checkpoints
  for insert with check (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy vehicle_checkpoints_delete on vehicle_checkpoints
  for delete using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

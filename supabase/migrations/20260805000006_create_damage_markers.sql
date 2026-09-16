-- Phase 3 (Damage Codes): tap-placed damage markers on a vehicle's work order.
-- vehicle_id follows the same FK-naming precedent as lot_vehicle_assignments,
-- vehicle_events, vehicle_charges, and lot_invoices — all point at
-- storage_vehicles.id under the name vehicle_id, despite storage_vehicles now
-- functioning as the work-order row (see Phase 2 / vehicle_master).
--
-- on delete restrict, not cascade: history preservation is a hard Foundation-phase
-- requirement. Cascade would let a deleted storage_vehicles row silently wipe its
-- damage markers with no trace; restrict forces any such deletion to fail loudly.
create table damage_markers (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id),
  vehicle_id        uuid not null references storage_vehicles(id) on delete restrict,
  source            text not null check (source in ('intake', 'outtake', 'cr', 'manual')),
  vehicle_template  text not null check (vehicle_template in ('sedan', 'suv', 'truck', 'van')),
  area_code_id      uuid not null references damage_area_codes(id),
  type_code_id      uuid not null references damage_type_codes(id),
  severity_code_id  uuid not null references damage_severity_codes(id),
  x_position        numeric not null check (x_position >= 0 and x_position <= 100),
  y_position        numeric not null check (y_position >= 0 and y_position <= 100),
  note              text,
  created_by        uuid references user_profiles(id),
  created_at        timestamptz not null default now()
);

create index idx_damage_markers_vehicle on damage_markers(vehicle_id, created_at desc);
create index idx_damage_markers_company on damage_markers(company_id);

alter table damage_markers enable row level security;

create policy damage_markers_select on damage_markers
  for select using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy damage_markers_insert on damage_markers
  for insert with check (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy damage_markers_delete on damage_markers
  for delete using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

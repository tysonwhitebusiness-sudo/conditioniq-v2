-- Append-only audit trail / activity feed for a vehicle's lifecycle
-- (intake, spot assignment, status changes, inspections, invoicing, manual notes).
create table if not exists vehicle_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  vehicle_id uuid not null references storage_vehicles(id) on delete cascade,
  event_type text not null,
  description text not null,
  metadata jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_vehicle_events_vehicle on vehicle_events(vehicle_id, created_at desc);
create index if not exists idx_vehicle_events_company on vehicle_events(company_id);

alter table vehicle_events enable row level security;

create policy vehicle_events_select on vehicle_events
  for select using (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

create policy vehicle_events_insert on vehicle_events
  for insert with check (company_id = (select user_profiles.company_id from user_profiles where user_profiles.id = auth.uid()));

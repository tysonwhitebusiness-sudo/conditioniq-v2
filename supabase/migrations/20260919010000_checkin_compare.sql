-- G · Check-out against check-in.
--
-- inspection_type: the wizard has saved this with step 1 since June, but the
-- column never existed, so every step-1 save was refused and kept only on the
-- phone until the inspection finished. It now exists, and is filled in for
-- inspections already linked to a vehicle as its check-in or check-out.

alter table vehicle_inspections add column if not exists inspection_type text
  check (inspection_type in ('check_in', 'check_out', 'standard'));

update vehicle_inspections i set inspection_type = 'check_in'
  from storage_vehicles v where v.checkin_inspection_id = i.id and i.inspection_type is null;
update vehicle_inspections i set inspection_type = 'check_out'
  from storage_vehicles v where v.checkout_inspection_id = i.id and i.inspection_type is null;

-- Suggestions from the comparison: damage in a check-out photo that was not in
-- the same photo at check-in. "Not new" is stored as rejected, like "Not damage".
alter table damage_suggestions add column if not exists kind text not null default 'photo'
  check (kind in ('photo', 'new_since_checkin'));
alter table damage_suggestions add column if not exists checkin_inspection_id uuid
  references vehicle_inspections (id) on delete set null;

-- One row per check-out photo: what it was compared with and how that went,
-- so the report can say plainly what was and was not compared.
create table if not exists checkin_compares (
  inspection_id uuid not null references vehicle_inspections (id) on delete cascade,
  slot text not null,
  checkin_inspection_id uuid references vehicle_inspections (id) on delete set null,
  -- compared | not_comparable (the photos show different things) |
  -- no_checkin_photo | skipped (AI off, over the ceiling, or an error)
  outcome text not null check (outcome in ('compared', 'not_comparable', 'no_checkin_photo', 'skipped')),
  found integer not null default 0,
  model text,
  prompt_version text,
  checked_at timestamptz not null default now(),
  primary key (inspection_id, slot)
);
alter table checkin_compares enable row level security;

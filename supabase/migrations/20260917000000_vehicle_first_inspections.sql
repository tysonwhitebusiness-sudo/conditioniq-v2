-- Vehicle-first inspections and damage pins in the full inspection (rollout
-- plan, Phase 9).
--
-- Additive only: new nullable columns and indexes. The live app never reads or
-- writes them, so this can be applied before the Phase 9 code deploys (and must
-- be, before Phase 9 is tested locally against this database).

begin;

-- The vehicle an inspection is about. Set when the inspection starts, so the
-- damage picker has a vehicle to pin against. Null on inspections started
-- before Phase 9; those keep the old damage list.
alter table vehicle_inspections
  add column if not exists vehicle_id uuid references storage_vehicles(id) on delete set null;
create index if not exists vehicle_inspections_vehicle_id_idx on vehicle_inspections(vehicle_id);

-- Pins placed during a full inspection belong to that inspection, so a report
-- shows only its own pins. Null for intake, outtake and manual pins, which stay
-- vehicle-level exactly as before.
alter table damage_markers
  add column if not exists inspection_id uuid references vehicle_inspections(id) on delete cascade;
create index if not exists damage_markers_inspection_id_idx on damage_markers(inspection_id);

-- Optional close-up photo for a pin: a storage path in the private
-- inspection-photos bucket, signed on read.
alter table damage_markers
  add column if not exists photo_path text;

commit;

-- ── Verify after applying ─────────────────────────────────────────────────────
-- select table_name, column_name from information_schema.columns
--  where (table_name = 'vehicle_inspections' and column_name = 'vehicle_id')
--     or (table_name = 'damage_markers' and column_name in ('inspection_id', 'photo_path'));
--   -> 3 rows

-- Phase 4 (Intake/Outtake): a vehicle's body-type template (sedan/suv/truck/van)
-- is durable identity data — it doesn't change between visits — so it lives on
-- vehicle_master (VIN-level), not storage_vehicles (per-visit), same reasoning
-- as year/make/model already living there. Nullable: the 93 existing
-- vehicle_master rows have no known template; new intake flow sets it.
alter table vehicle_master
  add column vehicle_template text check (vehicle_template in ('sedan', 'suv', 'truck', 'van'));

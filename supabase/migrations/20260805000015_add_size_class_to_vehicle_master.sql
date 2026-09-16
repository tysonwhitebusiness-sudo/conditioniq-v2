-- Phase 6 (Lot Map): vehicle-side size, same three values as lot_spots.size_class,
-- so suggestSpotForVehicle() can compare them directly with no translation layer.
-- Durable identity data (doesn't change between visits), so it lives on
-- vehicle_master, not storage_vehicles — same reasoning as vehicle_template.
-- Nullable: existing vehicle_master rows have no known size; new intake sets it.
alter table vehicle_master add column size_class text
  check (size_class in ('compact', 'standard', 'oversized'));

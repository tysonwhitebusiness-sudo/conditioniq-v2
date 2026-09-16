-- Phase 6 (Lot Map): lets a spot optionally belong to a drawn zone shape
-- (lot_shapes.shape_type = 'zone'), for zone-aware auto-recommend and
-- filtering. Nullable — most spots won't belong to a zone. set null on
-- delete since losing the zone shape shouldn't take the spot down with it.
alter table lot_spots add column zone_id uuid references lot_shapes(id) on delete set null;

create index lot_spots_zone_id_idx on lot_spots(zone_id) where zone_id is not null;

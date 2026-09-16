-- Phase 9 (Damage Picker Foundation): the resolved VIN-to-model-asset match,
-- persisted so it's computed once and reused on future visits — same pattern
-- as vehicle_template/size_class. Two independent columns because 2D and 3D
-- resolve independently (a vehicle can have an exact 3D match but only the
-- generic 2D shape, or vice versa).
--
-- on delete set null (not restrict, unlike damage_markers.model_asset_id):
-- this is a cached resolution, not a historical record, so retiring a catalog
-- asset should just clear the cache for re-resolution later, not block
-- catalog maintenance.
alter table vehicle_master add column model_asset_2d_id uuid references vehicle_model_assets(id) on delete set null;
alter table vehicle_master add column model_asset_3d_id uuid references vehicle_model_assets(id) on delete set null;

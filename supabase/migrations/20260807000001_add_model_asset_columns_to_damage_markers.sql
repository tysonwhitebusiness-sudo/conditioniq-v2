-- Phase 9 (Damage Picker Foundation): record which specific model asset a
-- marker was placed on, and — for 2D only — which of the 4 views. "All" (the
-- 2D combined reference view) is never stored here; it's a read-time
-- aggregation of the other 4 views' markers.
--
-- All nullable and additive: no existing damage_markers row has this data
-- (Phase 3's placeholder tagger never captured it), so no backfill needed —
-- same nullable-until-set pattern as vehicle_master.vehicle_template/size_class.
--
-- on delete restrict on model_asset_id matches this table's existing
-- history-preservation precedent for vehicle_id: a retired catalog asset must
-- not silently orphan markers that reference it.
--
-- asset_type is denormalized (copied at creation time) rather than only
-- reachable via a join through model_asset_id — same precedent already set by
-- this table's own vehicle_template column — so future taggers can filter/
-- group markers by 2D vs 3D and by view without a join.
alter table damage_markers add column model_asset_id uuid references vehicle_model_assets(id) on delete restrict;
alter table damage_markers add column asset_type text check (asset_type in ('2d', '3d'));
alter table damage_markers add column view text check (view in ('top', 'front', 'side', 'rear'));

alter table damage_markers add constraint damage_markers_view_requires_2d check (
  (asset_type = '2d' and view is not null) or
  (asset_type = '3d' and view is null) or
  (asset_type is null and view is null)
);

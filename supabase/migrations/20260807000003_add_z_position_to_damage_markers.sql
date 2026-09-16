-- Phase 11 (3D Damage Picker): a 3D marker's raycast hit point normalized to
-- percentages of the loaded model's own bounding box, on the same 0-100 scale
-- x_position/y_position already use for 2D — not raw world-space coordinates.
--
-- Bounding-box normalization (rather than storing the raw raycast point) is
-- deliberately more resilient to a future re-export/compression pass on these
-- GLB files (deferred, not ruled out, this phase): as long as a replacement
-- file preserves the vehicle's overall proportions — which mesh simplification
-- does, since it reduces triangle count, not physical dimensions — markers
-- re-normalize to the same relative position on the vehicle even if the file's
-- pivot or scale shifted. No bounding-box metadata needs to be stored anywhere:
-- it's recomputed identically from the same GLB at both write and read time.
--
-- x_position/y_position need no changes — same column, same 0-100 CHECK, just
-- a different meaning when asset_type = '3d' (disambiguated by that column,
-- same precedent as the view column's dual-meaning-by-asset_type already set
-- by 20260807000001_add_model_asset_columns_to_damage_markers.sql).
alter table damage_markers add column z_position numeric check (z_position >= 0 and z_position <= 100);

alter table damage_markers add constraint damage_markers_z_requires_3d check (
  (asset_type = '3d' and z_position is not null) or
  (asset_type = '2d' and z_position is null) or
  (asset_type is null and z_position is null)
);

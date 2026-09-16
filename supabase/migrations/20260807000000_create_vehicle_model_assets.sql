-- Phase 9 (Damage Picker Foundation): catalog of the curated vehicle diagram
-- library (16 approved 3D GLB models + 6 finalized 2D image sets) that Phase
-- 10/11/12's taggers will render against. Global/unscoped (no company_id) —
-- shared reference data, same precedent as damage_area_codes/damage_type_codes/
-- damage_severity_codes.
--
-- category reuses vehicle_master.vehicle_template's exact four values, same
-- reasoning already used for lot_spots/vehicle_master.size_class: comparable
-- directly with no translation layer.
--
-- One row is one asset: for 3D, a single GLB (storage_path); for 2D, a bundled
-- 4-view set (top/front/side/rear paths) — a 2D "image set" is one row, not
-- four. make/model both null = the generic fallback for that category+type.
create table vehicle_model_assets (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('sedan', 'suv', 'truck', 'van')),
  make        text,
  model       text,
  asset_type  text not null check (asset_type in ('2d', '3d')),

  storage_path text,

  top_path    text,
  front_path  text,
  side_path   text,
  rear_path   text,

  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  check (
    (asset_type = '3d' and storage_path is not null
      and top_path is null and front_path is null and side_path is null and rear_path is null)
    or
    (asset_type = '2d' and storage_path is null
      and top_path is not null and front_path is not null and side_path is not null and rear_path is not null)
  )
);

-- Exactly one generic fallback per category+asset_type.
create unique index uq_vehicle_model_assets_generic
  on vehicle_model_assets(category, asset_type)
  where make is null and model is null;

-- No duplicate specific make/model per category+asset_type.
create unique index uq_vehicle_model_assets_specific
  on vehicle_model_assets(category, asset_type, make, model)
  where make is not null;

alter table vehicle_model_assets enable row level security;

create policy vehicle_model_assets_select on vehicle_model_assets
  for select using (auth.role() = 'authenticated');

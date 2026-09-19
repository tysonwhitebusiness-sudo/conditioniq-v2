-- F · Damage the AI suggested from the exterior photos, and what the inspector
-- did with each suggestion.
--
-- status: pending until the inspector decides; accepted (added as suggested),
-- edited (added with a different area or type), rejected ("not damage"), or
-- superseded (the photo was retaken and checked again). Edited and rejected
-- suggestions are the corrections that go into the example library first.
-- A pin added from a suggestion carries its suggestion_id, so the report can
-- say the damage was suggested and confirmed rather than found by the inspector.

create table if not exists damage_suggestions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  inspection_id uuid not null references vehicle_inspections (id) on delete cascade,
  slot text not null,
  damage_group text not null,
  where_text text,
  confidence numeric(4, 3) not null,
  area_code_id uuid references damage_area_codes (id),
  type_code_id uuid references damage_type_codes (id),
  view text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'edited', 'rejected', 'superseded')),
  marker_id uuid references damage_markers (id) on delete set null,
  model text,
  prompt_version text,
  decided_at timestamptz
);
create index if not exists damage_suggestions_inspection_idx on damage_suggestions (inspection_id, status);
alter table damage_suggestions enable row level security;

alter table damage_markers add column if not exists suggestion_id uuid references damage_suggestions (id) on delete set null;

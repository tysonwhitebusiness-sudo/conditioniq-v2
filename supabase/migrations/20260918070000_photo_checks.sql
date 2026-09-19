-- D · The latest photo check for each photo slot of an inspection.
--
-- problems holds what the phone measured (blurry, dark, bright); right_subject,
-- framed and note come from the AI check, and stay null when it was skipped.
-- One row per slot: a retake replaces the row, so the report's photo check
-- describes the photos that were kept. Server only (service role).

create table if not exists photo_checks (
  inspection_id uuid not null references vehicle_inspections (id) on delete cascade,
  slot text not null,
  checked_at timestamptz not null default now(),
  sharpness numeric,
  brightness numeric,
  problems text[] not null default '{}',
  right_subject boolean,
  framed boolean,
  note text,
  primary key (inspection_id, slot)
);
alter table photo_checks enable row level security;

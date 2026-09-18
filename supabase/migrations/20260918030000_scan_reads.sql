-- S · Every VIN and plate read, kept with its photo.
--
-- source is which step produced the read: the barcode, the text reader on our
-- server, or the AI fallback; null when nothing could be read. saved_value is
-- what the inspector kept after confirming or correcting it, so reads can be
-- measured against what people actually accepted.

create table if not exists scan_reads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid references companies (id) on delete set null,
  inspection_id uuid references vehicle_inspections (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('vin', 'plate')),
  source text check (source in ('barcode', 'reader', 'ai')),
  read_value text,
  confidence numeric(4, 3),
  state text,
  photo_path text,
  saved_value text,
  saved_at timestamptz,
  duration_ms integer
);
create index if not exists scan_reads_created_idx on scan_reads (created_at desc);

alter table scan_reads enable row level security;

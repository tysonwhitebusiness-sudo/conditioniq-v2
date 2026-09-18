-- A · AI foundation.
--
-- Three pieces, all read and written only by the server (service role):
--   companies.ai_enabled  the per-account switch, on by default for every plan
--   ai_settings           one row: the global kill switch, the per-inspection
--                         ceiling, and the part of it held back for the summary
--   ai_calls              a record of every call, skipped or made: feature,
--                         model, prompt version, tokens, cost and outcome
--
-- AI never records anything about a vehicle and never blocks an inspection:
-- when a call is not allowed it is skipped and the inspection carries on.

alter table companies add column if not exists ai_enabled boolean not null default true;

create table if not exists ai_settings (
  id boolean primary key default true check (id),
  kill_switch boolean not null default false,
  per_inspection_ceiling_usd numeric(8, 4) not null default 0.20,
  summary_reserve_usd numeric(8, 4) not null default 0.05,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
insert into ai_settings (id) values (true) on conflict (id) do nothing;

create table if not exists ai_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid references companies (id) on delete set null,
  inspection_id uuid references vehicle_inspections (id) on delete set null,
  feature text not null,
  model text,
  prompt_version text,
  status text not null check (status in ('ok', 'error', 'skipped_kill_switch', 'skipped_account_off', 'skipped_ceiling', 'skipped_not_configured')),
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  worst_case_usd numeric(10, 6),
  cost_usd numeric(10, 6) not null default 0,
  duration_ms integer,
  error text
);
create index if not exists ai_calls_inspection_idx on ai_calls (inspection_id) where inspection_id is not null;
create index if not exists ai_calls_created_idx on ai_calls (created_at desc);

-- Server only: no policies, so only the service role can read or write.
alter table ai_settings enable row level security;
alter table ai_calls enable row level security;

-- A call in flight reserves its worst-case cost as 'pending', so two calls for
-- the same inspection at once cannot both spend the same headroom. The row is
-- updated with the real cost when the call finishes.
alter table ai_calls drop constraint if exists ai_calls_status_check;
alter table ai_calls add constraint ai_calls_status_check check (status in ('pending', 'ok', 'error', 'skipped_kill_switch', 'skipped_account_off', 'skipped_ceiling', 'skipped_not_configured'));

-- Phase 7 (QR Codes): the "remembered device" trust layer for the /scan/[token]
-- route. One row per (user, device) — a device is identified by a server-set
-- httpOnly cookie, not fingerprinting. last_verified_at drives the 24-hour
-- re-auth window; failed_attempts/locked_until throttle PIN guessing.
create table user_scan_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references user_profiles(id) on delete cascade,
  device_id text not null,
  pin_hash text not null,
  pin_salt text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  unique (user_id, device_id)
);

alter table user_scan_pins enable row level security;

create policy user_scan_pins_select on user_scan_pins
  for select using (user_id = auth.uid());

create policy user_scan_pins_insert on user_scan_pins
  for insert with check (user_id = auth.uid());

create policy user_scan_pins_update on user_scan_pins
  for update using (user_id = auth.uid());

create policy user_scan_pins_delete on user_scan_pins
  for delete using (user_id = auth.uid());

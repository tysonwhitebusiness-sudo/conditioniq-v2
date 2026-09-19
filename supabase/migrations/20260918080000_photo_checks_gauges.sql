-- E · The odometer and fuel gauge read from the dashboard or odometer photo,
-- and whether the odometer matched what the inspector typed.

alter table photo_checks add column if not exists odometer_read integer;
alter table photo_checks add column if not exists odometer_unit text;
alter table photo_checks add column if not exists odometer_status text check (odometer_status in ('verified', 'mismatch', 'unreadable'));
alter table photo_checks add column if not exists fuel_level numeric(4, 3);

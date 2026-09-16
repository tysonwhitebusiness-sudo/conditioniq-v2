-- Phase 3 (Damage Codes): trimmed AIAG M-22 reference data, lot/tow-relevant
-- subset only. Global/unscoped (no company_id) — this is a fixed external
-- standard, not a per-company customizable list, unlike company_fee_types.
-- Labels are plain-language, not official AIAG alphanumeric codes (none were
-- given for area/type — only severity has real numeric codes, 1-6).

create table damage_area_codes (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,
  label       text not null unique,
  sort_order  integer not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table damage_type_codes (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique,
  sort_order  integer not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table damage_severity_codes (
  id          uuid primary key default gen_random_uuid(),
  code        smallint not null unique,
  label       text not null,
  sort_order  integer not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table damage_area_codes enable row level security;
alter table damage_type_codes enable row level security;
alter table damage_severity_codes enable row level security;

create policy damage_area_codes_select on damage_area_codes for select using (auth.role() = 'authenticated');
create policy damage_type_codes_select on damage_type_codes for select using (auth.role() = 'authenticated');
create policy damage_severity_codes_select on damage_severity_codes for select using (auth.role() = 'authenticated');

-- ── Seed: damage_area_codes (74 rows) ────────────────────────────────────────

insert into damage_area_codes (category, label, sort_order) values
  ('Exterior body', 'Bumper Front', 1),
  ('Exterior body', 'Bumper Rear', 2),
  ('Exterior body', 'Fender Front Left', 3),
  ('Exterior body', 'Fender Front Right', 4),
  ('Exterior body', 'Fender Rear Left', 5),
  ('Exterior body', 'Fender Rear Right', 6),
  ('Exterior body', 'Quarter Panel Left', 7),
  ('Exterior body', 'Quarter Panel Right', 8),
  ('Exterior body', 'Rocker Panel/Sill Left', 9),
  ('Exterior body', 'Rocker Panel/Sill Right', 10),
  ('Exterior body', 'Hood', 11),
  ('Exterior body', 'Roof', 12),
  ('Exterior body', 'Grille', 13),
  ('Exterior body', 'Door Front Left', 14),
  ('Exterior body', 'Door Front Right', 15),
  ('Exterior body', 'Door Rear Left', 16),
  ('Exterior body', 'Door Rear Right', 17),
  ('Exterior body', 'Tailgate/Deck Lid', 18),
  ('Exterior body', 'Running Board Left', 19),
  ('Exterior body', 'Running Board Right', 20),
  ('Exterior body', 'Spoiler', 21),
  ('Exterior body', 'Splash Panel', 22),
  ('Exterior body', 'Cowl', 23),
  ('Exterior body', 'Frame', 24),
  ('Glass & lights', 'Windshield', 25),
  ('Glass & lights', 'Rear Glass', 26),
  ('Glass & lights', 'Headlight/Turn Signal', 27),
  ('Glass & lights', 'Tail Light', 28),
  ('Glass & lights', 'Fog/Driving Light', 29),
  ('Glass & lights', 'Marker Light', 30),
  ('Glass & lights', 'Mirror Left', 31),
  ('Glass & lights', 'Mirror Right', 32),
  ('Glass & lights', 'Sunroof/T-Top', 33),
  ('Wheels & undercarriage', 'Tire Front Left', 34),
  ('Wheels & undercarriage', 'Wheel/Rim Front Left', 35),
  ('Wheels & undercarriage', 'Tire Front Right', 36),
  ('Wheels & undercarriage', 'Wheel/Rim Front Right', 37),
  ('Wheels & undercarriage', 'Tire Rear Left', 38),
  ('Wheels & undercarriage', 'Wheel/Rim Rear Left', 39),
  ('Wheels & undercarriage', 'Tire Rear Right', 40),
  ('Wheels & undercarriage', 'Wheel/Rim Rear Right', 41),
  ('Wheels & undercarriage', 'Spare Tire/Wheel', 42),
  ('Wheels & undercarriage', 'Exhaust System', 43),
  ('Wheels & undercarriage', 'Gas Tank', 44),
  ('Wheels & undercarriage', 'Gas Cap Cover', 45),
  ('Wheels & undercarriage', 'Undercarriage - Other', 46),
  ('Interior', 'Dash/Instrument Panel', 47),
  ('Interior', 'Seat Front Left', 48),
  ('Interior', 'Seat Front Right', 49),
  ('Interior', 'Seat Rear', 50),
  ('Interior', 'Carpet Front', 51),
  ('Interior', 'Carpet Rear', 52),
  ('Interior', 'Headliner', 53),
  ('Interior', 'Floor Mats Front', 54),
  ('Interior', 'Floor Mats Rear', 55),
  ('Interior', 'Steering Wheel/Airbag', 56),
  ('Interior', 'Interior - Other', 57),
  ('Tow/lot extras', 'Trailer Hitch/Wiring/Tow Hooks', 58),
  ('Tow/lot extras', 'Rails/Truckbed/Lightbar', 59),
  ('Tow/lot extras', 'Luggage Rack', 60),
  ('Tow/lot extras', 'Keys', 61),
  ('Tow/lot extras', 'Keyless Remote', 62),
  ('Tow/lot extras', 'License Plate Bracket', 63),
  ('Tow/lot extras', 'Antenna', 64),
  ('Tow/lot extras', 'Battery/Box', 65),
  ('Tow/lot extras', 'Wheel Covers/Caps', 66),
  ('Tow/lot extras', 'Wipers', 67),
  ('Tow/lot extras', 'Decal/Paint Stripe', 68),
  ('Tow/lot extras', 'Trim Panel Left', 69),
  ('Tow/lot extras', 'Trim Panel Right', 70),
  ('Tow/lot extras', 'Center Post Left', 71),
  ('Tow/lot extras', 'Center Post Right', 72),
  ('Tow/lot extras', 'Corner Post', 73),
  ('Tow/lot extras', 'Engine Compartment - Other', 74);

-- ── Seed: damage_type_codes (27 rows) ────────────────────────────────────────

insert into damage_type_codes (label, sort_order) values
  ('Bent', 1),
  ('Broken/Major Damage', 2),
  ('Cut', 3),
  ('Dented - Paint/Chrome Broken', 4),
  ('Chipped - Except Glass and Panel Edge', 5),
  ('Cracked - Except Glass', 6),
  ('Gouged', 7),
  ('Missing - Except Molding/Emblem', 8),
  ('Scuffed', 9),
  ('Interior Stained or Soiled', 10),
  ('Punctured', 11),
  ('Scratched - Except Glass', 12),
  ('Torn', 13),
  ('Dented Paint/Chrome Not Damaged', 14),
  ('Molding/Emblem/Weatherstrip Damaged', 15),
  ('Molding/Emblem/Weatherstrip Loose', 16),
  ('Glass Cracked', 17),
  ('Glass Broken', 18),
  ('Glass Chipped', 19),
  ('Glass Scratched', 20),
  ('Marker Light Damaged', 21),
  ('Decal/Paint Stripe Damage', 22),
  ('Contamination - Exterior', 23),
  ('Fluid Spillage - Exterior', 24),
  ('Chipped Panel Edge', 25),
  ('Hardware Exterior - Damaged', 26),
  ('Hardware Exterior - Loose/Missing', 27);

-- ── Seed: damage_severity_codes (6 rows) ─────────────────────────────────────

insert into damage_severity_codes (code, label, sort_order) values
  (1, 'Up to 1 inch', 1),
  (2, '1-3 inches', 2),
  (3, '3-6 inches', 3),
  (4, '6-12 inches', 4),
  (5, 'Over 12 inches', 5),
  (6, 'Missing/Major Damage', 6);

-- A0 · Damage codes brought up to the AIAG standard.
--
-- Sources:
--   'M-22 v5'   AIAG-ECG M-22 Damage Code Tables, Version 5, issued 11/2021
--               (ecgassociation.eu, AIAG-Damage-Codes-21.11.pdf)
--   '2023 sheet' the June 2023 carrier code sheet, for area codes AIAG changed
--               after v5: 02, 23, 29, 33, 34, 47, 49, 71, 87, 88
--
-- Every area and type now stores its AIAG number, so a pin can print the
-- five-digit code (area, type, severity). Existing rows keep their id and
-- label, so pins and reports already made are unchanged. Rows with no AIAG
-- equivalent are hidden from the picker (active = false), never deleted.
-- Transport-only codes (60 jumped chocks, 85 improper chock securement) and
-- codes AIAG marks "do not use" (32, 43, 58, 67) are not added.

alter table damage_area_codes add column if not exists aiag_code smallint;
alter table damage_area_codes add column if not exists aiag_source text;
alter table damage_type_codes add column if not exists aiag_code smallint;
alter table damage_type_codes add column if not exists aiag_source text;

create unique index if not exists damage_area_codes_aiag_code_key on damage_area_codes (aiag_code) where aiag_code is not null;
create unique index if not exists damage_type_codes_aiag_code_key on damage_type_codes (aiag_code) where aiag_code is not null;

-- ── Areas: existing rows ────────────────────────────────────────────────────
update damage_area_codes a set aiag_code = m.code, aiag_source = m.source
from (values
  ('Bumper Front', 3, 'M-22 v5'), ('Bumper Rear', 4, 'M-22 v5'),
  ('Fender Front Left', 14, 'M-22 v5'), ('Fender Front Right', 16, 'M-22 v5'),
  ('Fender Rear Left', 82, 'M-22 v5'), ('Fender Rear Right', 83, 'M-22 v5'),
  ('Quarter Panel Left', 15, 'M-22 v5'), ('Quarter Panel Right', 17, 'M-22 v5'),
  ('Rocker Panel/Sill Left', 35, 'M-22 v5'), ('Rocker Panel/Sill Right', 36, 'M-22 v5'),
  ('Hood', 27, 'M-22 v5'), ('Roof', 37, 'M-22 v5'), ('Grille', 22, 'M-22 v5'),
  ('Door Front Left', 10, 'M-22 v5'), ('Door Front Right', 12, 'M-22 v5'),
  ('Door Rear Left', 11, 'M-22 v5'), ('Door Rear Right', 13, 'M-22 v5'),
  ('Tailgate/Deck Lid', 52, 'M-22 v5'),
  ('Running Board Left', 38, 'M-22 v5'), ('Running Board Right', 39, 'M-22 v5'),
  ('Spoiler', 64, 'M-22 v5'), ('Splash Panel', 42, 'M-22 v5'), ('Cowl', 80, 'M-22 v5'), ('Frame', 90, 'M-22 v5'),
  ('Windshield', 20, 'M-22 v5'), ('Rear Glass', 21, 'M-22 v5'),
  ('Headlight/Turn Signal', 24, 'M-22 v5'), ('Tail Light', 45, 'M-22 v5'), ('Fog/Driving Light', 25, 'M-22 v5'),
  ('Mirror Left', 30, 'M-22 v5'), ('Mirror Right', 31, 'M-22 v5'), ('Sunroof/T-Top', 53, 'M-22 v5'),
  ('Tire Front Left', 72, 'M-22 v5'), ('Wheel/Rim Front Left', 73, 'M-22 v5'),
  ('Tire Front Right', 78, 'M-22 v5'), ('Wheel/Rim Front Right', 79, 'M-22 v5'),
  ('Tire Rear Left', 74, 'M-22 v5'), ('Wheel/Rim Rear Left', 75, 'M-22 v5'),
  ('Tire Rear Right', 76, 'M-22 v5'), ('Wheel/Rim Rear Right', 77, 'M-22 v5'),
  ('Spare Tire/Wheel', 40, 'M-22 v5'), ('Exhaust System', 91, 'M-22 v5'), ('Gas Tank', 44, 'M-22 v5'),
  ('Gas Cap Cover', 81, 'M-22 v5'), ('Undercarriage - Other', 54, 'M-22 v5'),
  ('Dash/Instrument Panel', 66, 'M-22 v5'), ('Seat Front Left', 94, 'M-22 v5'), ('Seat Front Right', 95, 'M-22 v5'),
  ('Seat Rear', 96, 'M-22 v5'), ('Carpet Front', 68, 'M-22 v5'), ('Carpet Rear', 97, 'M-22 v5'),
  ('Headliner', 26, 'M-22 v5'), ('Floor Mats Front', 18, 'M-22 v5'), ('Floor Mats Rear', 19, 'M-22 v5'),
  ('Steering Wheel/Airbag', 93, 'M-22 v5'), ('Interior - Other', 98, 'M-22 v5'),
  ('Trailer Hitch/Wiring/Tow Hooks', 89, 'M-22 v5'), ('Rails/Truckbed/Lightbar', 63, 'M-22 v5'),
  ('Luggage Rack', 65, 'M-22 v5'), ('Keys', 28, 'M-22 v5'), ('Keyless Remote', 29, '2023 sheet'),
  ('License Plate Bracket', 92, 'M-22 v5'), ('Antenna', 1, 'M-22 v5'), ('Battery/Box', 2, '2023 sheet'),
  ('Wheel Covers/Caps', 57, 'M-22 v5'), ('Wipers', 59, 'M-22 v5'),
  ('Trim Panel Left', 48, 'M-22 v5'), ('Trim Panel Right', 50, 'M-22 v5'),
  ('Center Post Left', 70, 'M-22 v5'), ('Center Post Right', 69, 'M-22 v5'),
  ('Corner Post', 71, '2023 sheet'), ('Engine Compartment - Other', 99, 'M-22 v5')
) as m(label, code, source)
where a.label = m.label and a.aiag_code is null;

-- Labels that follow AIAG's current wording where the meaning narrowed in 2023.
update damage_area_codes set label = 'Keyless Remote/Key Fobs' where label = 'Keyless Remote';
update damage_area_codes set label = 'Battery (Low Voltage)' where label = 'Battery/Box';
update damage_area_codes set label = 'Corner Post/Pillar Rear Left' where label = 'Corner Post';

-- Marker lights and decals are damage types in AIAG, not areas.
update damage_area_codes set active = false where label in ('Marker Light', 'Decal/Paint Stripe') and aiag_code is null;

-- ── Areas: added from the standard ──────────────────────────────────────────
insert into damage_area_codes (category, label, sort_order, active, aiag_code, aiag_source)
select v.category, v.label, v.sort_order, true, v.code, v.source
from (values
  ('Exterior body', 'Bumper Guard/Strip Front', 75, 5, 'M-22 v5'),
  ('Exterior body', 'Bumper Guard/Strip Rear', 76, 6, 'M-22 v5'),
  ('Exterior body', 'Door Back Cargo Right', 77, 7, 'M-22 v5'),
  ('Exterior body', 'Door Back Cargo Left', 78, 8, 'M-22 v5'),
  ('Exterior body', 'Door Cargo Sliding', 79, 9, 'M-22 v5'),
  ('Exterior body', 'A-Pillar/Corner Post Front Left', 80, 87, '2023 sheet'),
  ('Exterior body', 'A-Pillar/Corner Post Front Right', 81, 88, '2023 sheet'),
  ('Exterior body', 'Corner Post/Pillar Rear Right', 82, 47, '2023 sheet'),
  ('Exterior body', 'Truck Cab Rear', 83, 46, 'M-22 v5'),
  ('Exterior body', 'Tonneau Cover', 84, 51, 'M-22 v5'),
  ('Exterior body', 'Convertible Top', 85, 56, 'M-22 v5'),
  ('Exterior body', 'Pick-Up Box Interior', 86, 61, 'M-22 v5'),
  ('Exterior body', 'Entire Vehicle', 87, 62, 'M-22 v5'),
  ('Interior', 'Front Multimedia/Speakers', 88, 33, '2023 sheet'),
  ('Interior', 'Rear Multimedia/Speakers', 89, 34, '2023 sheet'),
  ('Interior', 'Cargo Area - Other', 90, 55, 'M-22 v5'),
  ('Interior', 'Loose Items/Accessories', 91, 23, '2023 sheet'),
  ('Tow/lot extras', 'Battery (High Voltage)', 92, 49, '2023 sheet'),
  ('Tow/lot extras', 'EV Charging Cable', 93, 41, 'M-22 v5'),
  ('Tow/lot extras', 'Tools/Jack/Spare Mount & Lock', 94, 84, 'M-22 v5'),
  ('Tow/lot extras', 'Parking Sonar System', 95, 86, 'M-22 v5')
) as v(category, label, sort_order, code, source)
where not exists (select 1 from damage_area_codes a where a.aiag_code = v.code);

-- ── Types: existing rows ────────────────────────────────────────────────────
update damage_type_codes t set aiag_code = m.code, aiag_source = 'M-22 v5'
from (values
  ('Bent', 1), ('Cut', 3), ('Dented - Paint/Chrome Broken', 4), ('Chipped - Except Glass and Panel Edge', 5),
  ('Cracked - Except Glass', 6), ('Gouged', 7), ('Missing - Except Molding/Emblem', 8), ('Scuffed', 9),
  ('Interior Stained or Soiled', 10), ('Punctured', 11), ('Scratched - Except Glass', 12), ('Torn', 13),
  ('Dented Paint/Chrome Not Damaged', 14), ('Molding/Emblem/Weatherstrip Damaged', 18),
  ('Molding/Emblem/Weatherstrip Loose', 19), ('Glass Cracked', 20), ('Glass Broken', 21), ('Glass Chipped', 22),
  ('Glass Scratched', 23), ('Marker Light Damaged', 24), ('Decal/Paint Stripe Damage', 25),
  ('Contamination - Exterior', 29), ('Fluid Spillage - Exterior', 30), ('Chipped Panel Edge', 34),
  ('Hardware Exterior - Damaged', 37), ('Hardware Exterior - Loose/Missing', 38)
) as m(label, code)
where t.label = m.label and t.aiag_code is null;

-- Not an AIAG type: "broken" is severity 6 (missing/major) on the right type.
update damage_type_codes set active = false where label = 'Broken/Major Damage' and aiag_code is null;

-- ── Types: added from the standard ──────────────────────────────────────────
insert into damage_type_codes (label, sort_order, active, aiag_code, aiag_source)
select v.label, v.sort_order, true, v.code, 'M-22 v5'
from (values
  ('Inoperable', 28, 2),
  ('Full Body Car Cover - Damaged', 29, 15),
  ('Thermal Event/Fire', 30, 16),
  ('Theft/Vandalism', 31, 31),
  ('Incorrect Part/Option Not as Invoiced', 32, 36)
) as v(label, sort_order, code)
where not exists (select 1 from damage_type_codes t where t.aiag_code = v.code);

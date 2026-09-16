-- Phase 6 (Lot Map): all 319 live lot_spots rows share identical width/height/
-- custom_color, confirming those columns are pure visual sizing from the setup
-- editor, not a capacity signal. size_class is a new, separate column so
-- auto-recommend and spot attributes have something real to key off without
-- overloading the geometry columns.
alter table lot_spots add column size_class text not null default 'standard'
  check (size_class in ('compact', 'standard', 'oversized'));

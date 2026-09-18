-- C · The report's summary, recommendations, recalls and complaints, kept on
-- the inspection with a hash of what they were built from. A rebuilt report
-- reuses them (no new AI call) unless the inspection has changed since.

alter table vehicle_inspections add column if not exists report_assist jsonb;
comment on column vehicle_inspections.report_assist is 'C: the report''s summary, recommendations, recalls and complaints, with a hash of what they were built from; rebuilt when the inspection changes.';

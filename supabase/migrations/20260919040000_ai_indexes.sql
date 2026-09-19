-- Audit, 19 Sep 2026: indexes for the new AI tables' lookups.
--   ai_calls by account and time: the hourly limit on AI scan reads outside an inspection.
--   damage_markers.suggestion_id and damage_suggestions.checkin_inspection_id:
--   the report's "found by" join, and deletes of inspections, which clear these links.

create index if not exists ai_calls_company_created_idx on ai_calls (company_id, created_at);
create index if not exists damage_markers_suggestion_idx on damage_markers (suggestion_id) where suggestion_id is not null;
create index if not exists damage_suggestions_checkin_idx on damage_suggestions (checkin_inspection_id) where checkin_inspection_id is not null;

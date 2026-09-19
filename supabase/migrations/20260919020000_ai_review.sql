-- H · Review before collected records join a test set.
--
-- Every decided damage suggestion (added, edited, "not damage", "not new") is a
-- labelled example from a real inspection. A platform admin looks at each one
-- on the AI dashboard and approves it for the test sets and example library,
-- or excludes it (a wrong tap, an unclear photo). Only approved rows are
-- exported by scripts/ai-lab/export-reviewed.ts.

alter table damage_suggestions add column if not exists review_status text
  check (review_status in ('approved', 'excluded'));
alter table damage_suggestions add column if not exists reviewed_at timestamptz;
alter table damage_suggestions add column if not exists reviewed_by uuid references auth.users (id) on delete set null;

create index if not exists damage_suggestions_review_idx on damage_suggestions (status, review_status);
create index if not exists ai_calls_created_idx on ai_calls (created_at);

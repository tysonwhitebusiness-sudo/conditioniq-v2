-- B5 · Damage detection moves to Opus 5 (92% of damaged photos with the right
-- type vs 85% on Sonnet, no false alarms), at about $0.052 per inspection.
-- With the summary (~$0.005) and scan reads (~$0.006) the measured total is
-- about $0.063, so the ceiling goes to $0.12, about twice that. Phase F sends
-- an inspection's damage photos one after another, so each call's worst-case
-- reservation is released before the next is checked.

alter table ai_settings alter column per_inspection_ceiling_usd set default 0.12;
update ai_settings set per_inspection_ceiling_usd = 0.12, updated_at = now() where id;

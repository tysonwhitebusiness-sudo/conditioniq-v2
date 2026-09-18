-- B5 · The per-inspection ceiling, tightened to measured cost.
--
-- Measured live cost per inspection, 18 Sep 2026: damage suggestions $0.019,
-- recommendations $0.003, a scan fallback read about $0.003. Photo quality,
-- gauges and intake/outtake comparison are not measured yet, so the ceiling is
-- set at about twice the expected total, and the summary reserve at several
-- times its measured cost. Revisit when phases D, E and G are measured.

alter table ai_settings alter column per_inspection_ceiling_usd set default 0.10;
alter table ai_settings alter column summary_reserve_usd set default 0.02;
update ai_settings set per_inspection_ceiling_usd = 0.10, summary_reserve_usd = 0.02, updated_at = now() where id;

-- Phase 13 (Intake/Outtake Redesign): "Add Existing Vehicle" backfill entries
-- reuse vehicle_checkpoints rather than a new table — same shape (a condition
-- snapshot + photos), just a third direction value distinct from the real
-- work-order intake/outtake pair. Confirmed safe: checkpoint-form.tsx's
-- `direction === 'intake'` auto-status check is an exact string match, and the
-- checkpoint/[direction] dynamic route explicitly only accepts 'intake'/
-- 'outtake', so 'backfill' rows are already isolated from both by construction.
alter table vehicle_checkpoints drop constraint if exists vehicle_checkpoints_direction_check;
alter table vehicle_checkpoints add constraint vehicle_checkpoints_direction_check
  check (direction in ('intake', 'outtake', 'backfill'));

-- Adds activity tracking columns to vehicle_inspections for resume/auto-complete flow
ALTER TABLE vehicle_inspections
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS device_id text;

-- Index for the auto-complete expiry query
CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_auto_complete
  ON vehicle_inspections (company_id, status, last_active_at)
  WHERE locked_at IS NULL;

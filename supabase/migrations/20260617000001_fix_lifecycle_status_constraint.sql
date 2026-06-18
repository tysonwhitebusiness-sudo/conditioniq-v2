-- Migrate any legacy 'queued' rows so the updated constraint doesn't reject them
UPDATE storage_vehicles
SET lifecycle_status = 'pending_arrival'
WHERE lifecycle_status = 'queued';

-- Drop the old constraint (name is the Postgres default for table_column_check)
ALTER TABLE storage_vehicles
  DROP CONSTRAINT IF EXISTS storage_vehicles_lifecycle_status_check;

-- Recreate with all 5 current lifecycle values
ALTER TABLE storage_vehicles
  ADD CONSTRAINT storage_vehicles_lifecycle_status_check
  CHECK (lifecycle_status IN ('pending_arrival', 'on_lot', 'pending_pickup', 'picked_up', 'completed'));

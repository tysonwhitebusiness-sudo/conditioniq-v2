-- Drop old constraint first so the remapping updates aren't blocked by it
ALTER TABLE storage_vehicles
  DROP CONSTRAINT IF EXISTS storage_vehicles_lifecycle_status_check;

-- Remap legacy values to current equivalents
UPDATE storage_vehicles SET lifecycle_status = 'on_lot'          WHERE lifecycle_status = 'in_progress';
UPDATE storage_vehicles SET lifecycle_status = 'completed'       WHERE lifecycle_status = 'one_off';
UPDATE storage_vehicles SET lifecycle_status = 'picked_up'       WHERE lifecycle_status = 'released';
UPDATE storage_vehicles SET lifecycle_status = 'pending_pickup'  WHERE lifecycle_status = 'releasing';
UPDATE storage_vehicles SET lifecycle_status = 'pending_arrival' WHERE lifecycle_status = 'queued';

-- Recreate with all 5 current lifecycle values
ALTER TABLE storage_vehicles
  ADD CONSTRAINT storage_vehicles_lifecycle_status_check
  CHECK (lifecycle_status IN ('pending_arrival', 'on_lot', 'pending_pickup', 'picked_up', 'completed'));

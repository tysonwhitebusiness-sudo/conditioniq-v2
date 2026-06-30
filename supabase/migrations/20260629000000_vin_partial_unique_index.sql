-- Allow multiple rows for the same VIN on the same account, as long as only
-- one of them is non-completed at a time.
--
-- Drop any pre-existing full unique index on (vin, company_id) that would
-- block re-adding a completed vehicle.
DROP INDEX IF EXISTS storage_vehicles_vin_company_id_key;
DROP INDEX IF EXISTS storage_vehicles_vin_company_unique;
DROP INDEX IF EXISTS idx_storage_vehicles_vin_company;

-- Partial unique index: at most one non-completed record per VIN per account.
-- Uses IS DISTINCT FROM so NULL lifecycle_status rows are also covered.
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vin_account_active_unique
  ON storage_vehicles (vin, company_id)
  WHERE lifecycle_status IS DISTINCT FROM 'completed';

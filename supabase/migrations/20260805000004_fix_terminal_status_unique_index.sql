-- Point the "one open work order per VIN" constraint at the new single
-- terminal status instead of the two legacy values (picked_up vs completed)
-- that disagreed about which one was actually terminal. That disagreement
-- meant a released vehicle (status='released', lifecycle_status='picked_up')
-- could still be silently reused by the next check-in for the same VIN
-- instead of starting a fresh work order, since the old index only
-- excluded lifecycle_status = 'completed'.
--
-- 'released' is now the only terminal value in work_order_status, so this
-- closes that gap structurally rather than relying on call sites to set
-- both legacy columns consistently.
drop index if exists vehicles_vin_account_active_unique;

create unique index if not exists work_order_vin_account_active_unique
  on storage_vehicles (vin, company_id)
  where work_order_status is distinct from 'released';

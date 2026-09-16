-- Backfill work_order_status from the two legacy columns per the approved mapping:
--
--   status = 'released'  (any lifecycle_status)                    -> released   (status wins as terminal signal — this is
--                                                                                  the fix for the picked_up/completed bug:
--                                                                                  a row could be status='released' while
--                                                                                  lifecycle_status was still 'pending_pickup'
--                                                                                  or similar, and the old uniqueness index
--                                                                                  only keyed off lifecycle_status)
--   lifecycle_status = 'picked_up'                                 -> released
--   lifecycle_status = 'completed'                                 -> released
--   lifecycle_status = 'pending_pickup'                            -> pending_release
--   status = 'releasing'  (legacy StorageStatus value; zero live
--                          rows as of this migration, handled
--                          explicitly rather than left to fall
--                          through)                                -> pending_release
--   lifecycle_status = 'on_lot' and status = 'pending_inspection'  -> checked_in
--   lifecycle_status = 'on_lot' (any other status)                 -> in_storage
--   lifecycle_status = 'pending_arrival'                           -> pending_arrival
--   anything else / null                                           -> pending_arrival
--
-- on_lot_pending_repairs, on_lot_repairs_complete, off_lot, on_hold, and
-- ready_for_release have no current data mapping to them — they're net-new
-- states for later phases (repair/service logging, the Off Lot bay concept)
-- to start using; nothing here is expected to land in them.
update storage_vehicles
set work_order_status = case
  when status = 'released' then 'released'
  when lifecycle_status = 'picked_up' then 'released'
  when lifecycle_status = 'completed' then 'released'
  when lifecycle_status = 'pending_pickup' then 'pending_release'
  when status = 'releasing' then 'pending_release'
  when lifecycle_status = 'on_lot' and status = 'pending_inspection' then 'checked_in'
  when lifecycle_status = 'on_lot' then 'in_storage'
  when lifecycle_status = 'pending_arrival' then 'pending_arrival'
  else 'pending_arrival'
end
where work_order_status is null;

alter table storage_vehicles
  add constraint storage_vehicles_work_order_status_check
  check (work_order_status in (
    'pending_arrival', 'checked_in', 'in_storage',
    'on_lot_pending_repairs', 'on_lot_repairs_complete',
    'off_lot', 'on_hold', 'pending_release', 'ready_for_release', 'released'
  ));

alter table storage_vehicles alter column work_order_status set not null;
alter table storage_vehicles alter column work_order_status set default 'pending_arrival';

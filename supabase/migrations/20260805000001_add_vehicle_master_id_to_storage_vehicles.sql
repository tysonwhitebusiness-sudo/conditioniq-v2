-- Links each work-order row (storage_vehicles) to its VIN master record.
-- Nullable initially so the backfill below can populate it before the
-- NOT NULL constraint is applied.
alter table storage_vehicles add column if not exists vehicle_master_id uuid references vehicle_master(id);

update storage_vehicles sv
set vehicle_master_id = vm.id
from vehicle_master vm
where vm.company_id = sv.company_id
  and vm.vin = sv.vin
  and sv.vehicle_master_id is null;

alter table storage_vehicles alter column vehicle_master_id set not null;

create index if not exists idx_storage_vehicles_vehicle_master on storage_vehicles(vehicle_master_id);

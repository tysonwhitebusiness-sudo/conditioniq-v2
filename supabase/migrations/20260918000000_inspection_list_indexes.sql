-- L1 · Payload diet
--
-- Every inspection list asks the same question: this company's inspections with
-- this status, newest first. The table has single-column indexes on company_id
-- and status, so Postgres picks one and filters the rest by hand, then sorts.
-- One composite index answers the whole query and returns rows already ordered.
--
-- The lot and inventory screens ask the same way by vehicle, so that pair gets
-- the same treatment.
create index if not exists idx_vehicle_inspections_company_status_created
  on public.vehicle_inspections (company_id, status, created_at desc);

create index if not exists idx_vehicle_inspections_vehicle_created
  on public.vehicle_inspections (vehicle_id, created_at desc)
  where vehicle_id is not null;

-- The queue and link lists filter the same way.
create index if not exists idx_inspection_queue_company_status_created
  on public.inspection_queue (company_id, status, created_at desc);

create index if not exists idx_inspection_requests_company_created
  on public.inspection_requests (company_id, created_at desc);

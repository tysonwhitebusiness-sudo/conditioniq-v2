-- Phase 5 (Service Logging): vehicle_charges already has everything a service log
-- entry needs (fee_type_id already FKs to company_fee_types, the required catalog;
-- the billed/unbilled mechanism via lot_invoice_charges is generic to any
-- charge_type) except a "date performed" distinct from created_at ("date logged")
-- and a free-text notes field. charge_type itself needs no migration — it's
-- text with no DB constraint, only a TS union (lib/invoice-charge-actions.ts,
-- lib/lot-fee-actions.ts) gaining a third 'service' value at the code layer.
--
-- Expand-then-constrain, same sequence as work_order_status in Phase 2: add
-- nullable, backfill the one existing row, then lock to NOT NULL with a default.
alter table vehicle_charges add column performed_at date;
alter table vehicle_charges add column notes text;

update vehicle_charges set performed_at = created_at::date where performed_at is null;

alter table vehicle_charges alter column performed_at set not null;
alter table vehicle_charges alter column performed_at set default current_date;

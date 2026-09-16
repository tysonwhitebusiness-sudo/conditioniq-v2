-- Phase 7 (QR Codes): opaque per-work-order scan token. Generated in application
-- code (crypto.randomBytes, base64url) lazily on first "Print QR" request, not a
-- DB default — see lib/qr-actions.ts. Nullable: most existing rows will never get
-- one until someone actually prints a QR for that work order.
alter table storage_vehicles add column qr_token text unique;

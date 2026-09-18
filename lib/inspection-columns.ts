// The columns a list row actually renders. The step answers (exterior_data and
// friends) are deliberately left out: they hold the inspection's photos, so a
// single row can run to megabytes and fifty of them to tens of megabytes. A
// screen that needs the whole inspection — generating its report — fetches that
// one row on demand with fetchFullInspectionAction.
//
// Signatures are left out too: 45 of them are stored as image data, and only the
// report download needs one.
//
// Kept in its own module so both client screens and server actions can import
// it without dragging a Supabase client along.
export const INSPECTION_LIST_COLUMNS =
  'id, created_at, updated_at, status, usage_status, vin, year, make, model, odometer, location, ' +
  'vehicle_score, report_url, last_active_at, auto_completed, is_overage, company_id, inspector_id'

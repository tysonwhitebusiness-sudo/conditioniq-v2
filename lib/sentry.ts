import * as Sentry from '@sentry/nextjs'

/**
 * Captures an error with high severity tagging.
 *
 * High-severity errors are: billing/payment flows, auth failures, data-loss
 * writes (vehicle_inspections, storage_vehicles, lot_invoices). In the Sentry
 * dashboard, create an alert rule filtering on tag `severity = high` to get
 * email notifications for these. All other errors remain visible in the
 * dashboard at default severity.
 *
 * SENTRY ALERT RULE SETUP (manual, in Sentry UI):
 *   Issues → Alerts → Create Alert → Issue Alert
 *   Condition: "An issue is seen" AND tag `severity` equals `high`
 *   Action: Send email to <admin email>
 *   Name: "High Severity Errors"
 */
export function captureHighSeverityError(
  error: unknown,
  context?: Record<string, unknown>,
  fingerprintKey?: string,
): void {
  captureSecurityEvent(error, 'high', context, fingerprintKey)
}

/**
 * Captures a security-relevant rejection (auth denial, rate limit) with a
 * severity tag and, when a stable source identifier is available (user id,
 * IP), a custom fingerprint — so repeated rejections from the same source
 * group into one Sentry issue, making frequency-based alert rules meaningful
 * per-source rather than per-check-type-globally.
 */
export function captureSecurityEvent(
  error: unknown,
  severity: 'high' | 'medium',
  context?: Record<string, unknown>,
  fingerprintKey?: string,
): void {
  Sentry.withScope((scope) => {
    scope.setTag('severity', severity)
    if (context) scope.setContext('details', context)
    if (fingerprintKey) scope.setFingerprint(['security-event', fingerprintKey])
    Sentry.captureException(error)
  })
}

/** Wraps an async function so any thrown error is captured as high severity. */
export function withHighSeverity<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  context?: Record<string, unknown>,
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args)
    } catch (err) {
      captureHighSeverityError(err, context)
      throw err
    }
  }
}

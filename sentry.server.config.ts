import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 0.2,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend(event) {
    const severity = event.tags?.severity
    if (severity === 'high' && !event.fingerprint) {
      event.fingerprint = ['high-severity', '{{ default }}']
    }
    return event
  },
})

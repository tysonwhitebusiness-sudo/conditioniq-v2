import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  poweredByHeader: false,
  experimental: {
    // Default is 1MB. Inspection photos now upload individually (one Server
    // Action call per photo, right after capture) instead of bundled at final
    // submit — a single compressed capture is normally well under 1MB, but a
    // busy/detailed image can occasionally exceed it, so this gives headroom
    // for that case without reopening the bulk-submit 413 this was built to fix.
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  },
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  // Silent during builds — set SENTRY_LOG_LEVEL=debug to verbose
  silent: true,
  // Uploads source maps to Sentry for readable stack traces in production.
  // Requires SENTRY_AUTH_TOKEN env var (set in Vercel, not committed to repo).
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  // Automatically tree-shake Sentry debug code in production
  automaticVercelMonitors: false,
})

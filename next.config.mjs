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
    // The report renderer reads its fonts from disk at runtime, which the build
    // cannot trace on its own. Without this the report route deploys without
    // them and every report fails with "Font family not registered".
    outputFileTracingIncludes: {
      '/api/reports': ['./lib/report/fonts/**'],
      // S · The plate and VIN reader loads its models from disk, and its Linux
      // runtime loads libonnxruntime.so.1 beside the binding, which the trace
      // does not see.
      '/api/scan': [
        './node_modules/@gutenye/ocr-models/assets/**',
        './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime.so.1',
        './node_modules/onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node',
      ],
    },
    // The reader's runtime ships a binary for every platform (about 290 MB);
    // the server runs on Linux x64, so the rest stay out of the function. On
    // Linux its install script also downloads CUDA and TensorRT libraries
    // (hundreds of MB, skipped in .npmrc but possibly in Vercel's cached
    // node_modules); the reader runs on the CPU and never loads them. With them
    // the function was 389 MB, over Vercel's 250 MB limit.
    outputFileTracingExcludes: {
      '/api/scan': [
        './node_modules/onnxruntime-node/bin/napi-v*/darwin/**',
        './node_modules/onnxruntime-node/bin/napi-v*/win32/**',
        './node_modules/onnxruntime-node/bin/napi-v*/linux/arm64/**',
        './node_modules/onnxruntime-node/bin/napi-v*/linux/x64/libonnxruntime_providers_*',
      ],
    },
    // The PDF renderer, image resizer and text reader stay as ordinary Node
    // modules on the server rather than being bundled.
    serverComponentsExternalPackages: ['@react-pdf/renderer', 'sharp', '@gutenye/ocr-node', '@gutenye/ocr-common', 'onnxruntime-node', '@techstark/opencv-js'],
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
  async redirects() {
    return [
      // Dispatch merged into Inspections: a sent link is now a row with status
      // "sent" rather than a separate page. 301 so bookmarks and search update.
      {
        source: '/storage/dispatch',
        destination: '/inspections?status=sent',
        statusCode: 301,
      },
    ]
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

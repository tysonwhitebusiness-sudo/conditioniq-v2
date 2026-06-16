import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
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

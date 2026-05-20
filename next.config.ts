import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import path from 'path'

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
})

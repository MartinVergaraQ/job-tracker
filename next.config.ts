import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,

  serverExternalPackages: [
    'playwright',
    'playwright-core',
    '@sparticuz/chromium',
  ],

  outputFileTracingIncludes: {
    '/api/cv/documents/[id]/upload-pdf': [
      './node_modules/@sparticuz/chromium/bin/**/*',
    ],
  },
}

export default nextConfig
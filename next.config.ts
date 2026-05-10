import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,

  serverExternalPackages: [
    '@sparticuz/chromium',
    'puppeteer-core',
  ],

  outputFileTracingIncludes: {
    '/*': [
      './node_modules/@sparticuz/chromium/bin/**/*',
    ],
    '/api/cv/documents/[id]/upload-pdf': [
      './node_modules/@sparticuz/chromium/bin/**/*',
    ],
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push('@sparticuz/chromium')
    }

    return config
  },
}

export default nextConfig
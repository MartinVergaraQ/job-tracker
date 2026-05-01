import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Geist } from 'next/font/google'
import { ThemeProvider } from 'next-themes'
import './globals.css'

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: {
    default: 'Job Tracker Admin',
    template: '%s | Job Tracker',
  },
  description:
    'Panel inteligente para recolectar empleos, medir matches, seguir postulaciones y automatizar alertas laborales.',
  applicationName: 'Job Tracker',
  authors: [{ name: 'Job Tracker' }],
  creator: 'Job Tracker',
  openGraph: {
    title: 'Job Tracker Admin',
    description:
      'Panel inteligente para recolectar empleos, medir matches, seguir postulaciones y automatizar alertas laborales.',
    url: defaultUrl,
    siteName: 'Job Tracker',
    type: 'website',
  },
  robots: {
    index: false,
    follow: false,
  },
}

const geistSans = Geist({
  variable: '--font-geist-sans',
  display: 'swap',
  subsets: ['latin'],
})

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <div className="app-shell">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  )
}
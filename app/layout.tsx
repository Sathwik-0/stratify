// app/layout.tsx
// Fixed: next/font replaces @import (render-blocking → zero CLS)
// Fixed: viewport meta tag added
// Fixed: richer OpenGraph metadata
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Fraunces, DM_Sans, DM_Mono } from 'next/font/google'
import './globals.css'

const fraunces = Fraunces({
  subsets:  ['latin'],
  variable: '--font-fraunces',
  display:  'swap',
  weight:   'variable',
  style:    ['normal', 'italic'],
})

const dmSans = DM_Sans({
  subsets:  ['latin'],
  variable: '--font-dm-sans',
  display:  'swap',
  weight:   ['300', '400', '500', '600'],
})

const dmMono = DM_Mono({
  subsets:  ['latin'],
  variable: '--font-dm-mono',
  display:  'swap',
  weight:   ['300', '400', '500'],
})

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export const metadata: Metadata = {
  title:       'Stratify — See exactly why businesses win',
  description: 'Evidence-backed business intelligence. Understand why any company works — and where it could break.',
  openGraph: {
    title:       'Stratify — Business Intelligence',
    description: 'See exactly why businesses win.',
    type:        'website',
  },
  twitter: {
    card:  'summary_large_image',
    title: 'Stratify — See exactly why businesses win',
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} ${dmMono.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}

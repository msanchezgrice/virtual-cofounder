import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://virtualcofounder.ai'),
  title: {
    default: 'Virtual Cofounder — A Team That Ships While You Sleep',
    template: '%s | Virtual Cofounder'
  },
  description: 'The cofounder you always dreamed of. Whether it\'s technical debt, growth experiments, or launch prep—your virtual cofounder handles the work you\'ve been putting off, overnight.',
  keywords: ['virtual cofounder', 'AI assistant', 'startup', 'technical cofounder', 'automation', 'SEO', 'security', 'analytics', 'overnight shipping'],
  authors: [{ name: 'Virtual Cofounder' }],
  creator: 'Virtual Cofounder',
  publisher: 'Virtual Cofounder',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://virtualcofounder.ai',
    siteName: 'Virtual Cofounder',
    title: 'Virtual Cofounder — A Team That Ships While You Sleep',
    description: 'The cofounder you always dreamed of. Whether it\'s technical debt, growth experiments, or launch prep—your virtual cofounder handles the work you\'ve been putting off, overnight.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Virtual Cofounder - A team that ships while you sleep',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Virtual Cofounder — A Team That Ships While You Sleep',
    description: 'The cofounder you always dreamed of. Whether it\'s technical debt, growth experiments, or launch prep—your virtual cofounder handles the work you\'ve been putting off, overnight.',
    images: ['/og-image.png'],
    creator: '@virtualcofounder',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}

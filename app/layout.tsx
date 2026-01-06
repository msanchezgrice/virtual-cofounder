import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Virtual Cofounder',
  description: 'AI Head of Product for Portfolio Management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <nav className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <h1 className="text-xl font-semibold text-dark-gray">Virtual Cofounder</h1>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Miguel</span>
              <button className="text-sm text-gray-600 hover:text-brand-blue">Settings</button>
            </div>
          </div>
        </nav>
        <main className="min-h-screen bg-light-gray">
          {children}
        </main>
      </body>
    </html>
  )
}

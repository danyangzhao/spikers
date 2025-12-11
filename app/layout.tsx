import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'
import Navigation from '@/components/Navigation'

const dmSans = DM_Sans({ 
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Spikers',
  description: 'Track your Spikeball sessions, scores, and stats with friends',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0f0f14',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={dmSans.className}>
        <div className="min-h-screen pb-20">
          <main className="max-w-lg mx-auto px-4 py-6">
            {children}
          </main>
          <Navigation />
        </div>
      </body>
    </html>
  )
}

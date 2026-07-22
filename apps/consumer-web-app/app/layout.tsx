import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import { withBrandVersion } from '@/lib/brand';
import { GuestPreviewMigrator } from './GuestPreviewMigrator';

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-cormorant-garamond',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://app.mefwellness.com'),
  title: 'Rooted Reset | MEF Wellness',
  description: 'Daily wellness check-ins, trends, and coaching from MEF Wellness.',
  icons: {
    icon: [
      { url: withBrandVersion('/icons/favicon-32.png'), sizes: '32x32', type: 'image/png' },
      { url: withBrandVersion('/icons/icon-192.png'), sizes: '192x192', type: 'image/png' },
    ],
    shortcut: withBrandVersion('/favicon.ico'),
    apple: withBrandVersion('/icons/apple-touch-icon.png'),
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Rooted Reset',
  },
  openGraph: {
    title: 'Rooted Reset | MEF Wellness',
    description: 'Daily wellness check-ins, trends, and coaching from MEF Wellness.',
    images: [
      {
        url: withBrandVersion('/images/og-image.png'),
        width: 1200,
        height: 630,
        alt: 'Rooted Reset by MEF Wellness',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rooted Reset | MEF Wellness',
    description: 'Daily wellness check-ins, trends, and coaching from MEF Wellness.',
    images: [withBrandVersion('/images/og-image.png')],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1B3A2D',
  // Lets the page extend under the iPhone notch/home-indicator safe areas
  // so `env(safe-area-inset-*)` (used by the floating coach bottom sheet)
  // actually resolves to a non-zero value instead of always reading 0.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${cormorantGaramond.variable} ${dmSans.variable}`}>
      <body className={`${dmSans.className} min-h-screen bg-[#FAFAF8] text-[#1B3A2D] antialiased`}>
        <GuestPreviewMigrator />
        {children}
      </body>
    </html>
  );
}

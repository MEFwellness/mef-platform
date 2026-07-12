import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';

const cormorantGaramond = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-cormorant-garamond',
  display: 'swap'
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Rooted Reset | MEF Wellness',
  description: 'Daily wellness check-ins, trends, and coaching from MEF Wellness.',
  icons: { icon: '/images/rooted-reset-logo.png' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${cormorantGaramond.variable} ${dmSans.variable}`}>
      <body className={`${dmSans.className} min-h-screen bg-[#FAFAF8] text-[#1B3A2D] antialiased`}>
        {children}
      </body>
    </html>
  );
}

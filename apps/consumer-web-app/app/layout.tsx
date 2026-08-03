import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Cormorant_Garamond, DM_Sans } from 'next/font/google';
import { withBrandVersion } from '@/lib/brand';
import { GuestPreviewMigrator } from './GuestPreviewMigrator';
import { RootResetEntryGate } from '@/components/entry/RootResetEntryGate';
import { ENTRY_ANIMATION_LOGIN_COOKIE, ENTRY_ANIMATION_PLAY_COOKIE } from '@/lib/entry-animation/cookies';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { createClient } from '@/lib/supabase/server';

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

/**
 * Branded "Reset" entry animation (RootResetEntryGate) — the one-shot
 * token identifying which trigger this is comes from one of two cookies,
 * mef_entry_login taking priority: it's set directly by signIn()
 * (app/actions/auth.ts) for a fresh login, which that action's own
 * comment explains persists more reliably than a cookie middleware.ts
 * would set for the same request. mef_entry_play is middleware's own
 * token for the other trigger (reopened after a meaningful gap) — see
 * middleware.ts's own comment for why that split exists. Whichever is
 * present, this only ever does the one extra lookup (the member's first
 * name) on the rare requests where a token exists, not on every page
 * load. getCachedUser() here shares its result with whatever the
 * destination page itself also calls it for (React's per-request
 * cache()), so this never becomes a second real auth.getUser() network
 * call.
 */
async function getEntryAnimationServerState(): Promise<{
  entryToken: string | null;
  firstName: string | null;
}> {
  const loginCookie = cookies().get(ENTRY_ANIMATION_LOGIN_COOKIE)?.value;
  const playCookie = cookies().get(ENTRY_ANIMATION_PLAY_COOKIE)?.value;
  const entryToken = loginCookie || playCookie || null;
  console.log('[entry-debug] layout loginCookie=', loginCookie, 'playCookie=', playCookie, 'entryToken=', entryToken);
  if (!entryToken) return { entryToken: null, firstName: null };

  const user = await getCachedUser();
  console.log('[entry-debug] layout user=', user?.id ?? null);
  if (!user) return { entryToken: null, firstName: null };

  const supabase = createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();

  return { entryToken, firstName: profile?.display_name?.split(' ')[0] ?? null };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const entryState = await getEntryAnimationServerState();

  return (
    <html lang="en" className={`${cormorantGaramond.variable} ${dmSans.variable}`}>
      <body className={`${dmSans.className} min-h-screen bg-[#FAFAF8] text-[#1B3A2D] antialiased`}>
        <GuestPreviewMigrator />
        <RootResetEntryGate
          initialEntryToken={entryState.entryToken}
          initialFirstName={entryState.firstName}
        />
        {children}
      </body>
    </html>
  );
}

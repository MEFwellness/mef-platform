import type { MetadataRoute } from 'next';
import { withBrandVersion } from '@/lib/brand';

/**
 * The web app manifest: what an installed Rooted Reset looks and behaves
 * like once it is sitting on a Home Screen beside the phone's other apps.
 *
 * WHY THERE ARE FOUR ICONS AND NOT TWO. `any` and `maskable` are two
 * different jobs and a single file cannot do both well. An `any` icon is
 * shown as drawn, edge to edge. A `maskable` icon is CROPPED by the
 * launcher to whatever shape it uses, circle, squircle or rounded square,
 * so anything near the edge is cut off. The maskable pair
 * (scripts/generate-brand-assets.mjs) is the same mark padded into the
 * central safe zone on the brand background, so every crop shape lands on
 * flat colour and the mark survives intact. Declaring one file as both
 * purposes, which is the common shortcut, guarantees it is wrong in one of
 * the two places.
 *
 * `id` is stated rather than left implicit. A manifest with no id takes
 * start_url as its identity, so a later change to start_url would read as
 * a DIFFERENT app and could leave a member with two icons. Pinning it here
 * means start_url can move without that happening.
 *
 * There is deliberately no offline behaviour in this build. The service
 * worker (public/sw.js) handles push notifications and notification taps
 * and nothing else, which means Android will not offer its automatic
 * install banner, since that asks for a worker that can answer while
 * offline. Adding to the Home Screen from the browser menu works on both
 * platforms today, and is what the iPhone walkthrough in
 * lib/push/copy.ts describes.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: 'Rooted Reset | MEF Wellness',
    short_name: 'Rooted Reset',
    description: 'Daily wellness check-ins, trends, and coaching from MEF Wellness.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'en-US',
    dir: 'ltr',
    categories: ['health', 'lifestyle'],
    background_color: '#FAFAF8',
    theme_color: '#1B3A2D',
    icons: [
      {
        src: withBrandVersion('/icons/icon-192.png'),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: withBrandVersion('/icons/icon-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: withBrandVersion('/icons/icon-maskable-192.png'),
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: withBrandVersion('/icons/icon-maskable-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

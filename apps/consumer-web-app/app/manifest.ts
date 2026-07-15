import type { MetadataRoute } from 'next';
import { withBrandVersion } from '@/lib/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Rooted Reset | MEF Wellness',
    short_name: 'Rooted Reset',
    description: 'Daily wellness check-ins, trends, and coaching from MEF Wellness.',
    start_url: '/dashboard',
    display: 'standalone',
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
    ],
  };
}

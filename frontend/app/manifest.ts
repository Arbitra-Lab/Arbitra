import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Arbitra',
    short_name: 'Arbitra',
    description:
      'On-chain arbitration and escrow protocol built on Stellar - trustless dispute resolution for rentals, freelance work, trade finance, and insurance claims.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b1f1d',
    theme_color: '#ff6b5e',
    categories: ['finance', 'productivity', 'business'],
    icons: [
      {
        src: '/android_192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/android_512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/apple_touch_180.png',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/logo_512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    screenshots: [
      {
        src: '/og-image.png',
        sizes: '1200x630',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Arbitra landing page preview',
      },
    ],
  };
}

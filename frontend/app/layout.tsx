import type { Metadata, Viewport } from 'next';
import './globals.css';

import '@fontsource-variable/inter';

export const viewport: Viewport = {
  themeColor: '#ff6b5e',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'https://huston-housing-kappa.vercel.app',
  ),
  title: {
    default: 'Arbitra — On-Chain Arbitration & Escrow, Built on Stellar',
    template: '%s | Arbitra',
  },
  description:
    'Trustless escrow and arbitration for rentals, freelance work, trade finance, and insurance claims — settled in seconds on the Stellar network.',
  manifest: '/manifest.webmanifest',
};

import { RootLayoutClient } from './RootLayoutClient';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
      </head>

      <body
        suppressHydrationWarning
        className="font-sans bg-linear-to-br from-[#0b1f1d] via-[#123330] to-[#0b1f1d]"
      >
        {/* Accessibility: skip link */}
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>

        <RootLayoutClient>{children}</RootLayoutClient>
      </body>
    </html>
  );
}

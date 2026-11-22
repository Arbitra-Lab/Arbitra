# Mobile PWA Deployment Prep

This document captures the repository-side preparation required for app-store and mobile PWA deployment.

## Web PWA Checklist

- [x] `frontend/app/manifest.ts` includes app metadata, icons, categories, and screenshots.
- [x] Service worker is registered by `frontend/components/pwa/PwaController.tsx`.
- [x] Offline fallback route exists at `frontend/app/offline/page.tsx`.
- [x] Install prompt handling exists for supported browsers and iOS guidance.
- [x] Mobile metadata includes Apple web app configuration in `frontend/app/layout.tsx`.

## Push Notifications

- Browser push permission request is wired in `PwaController`.
- Service worker handles `push` and `notificationclick` events in `frontend/public/sw.js`.
- Backend notification delivery should be connected to a Web Push provider (VAPID keys + subscription storage) before production enablement.

## Biometric Authentication

- Biometric/WebAuthn sign-in is a staged enhancement. Current implementation keeps password/wallet auth as primary path.
- Before enabling biometric login, add server-side WebAuthn challenge/verification endpoints and store credential public keys per user.

## App Store Packaging (PWA Wrapper)

For Play Store/App Store distribution, use a wrapper (Capacitor or Trusted Web Activity/Bubblewrap) with:

1. Production HTTPS origin configured.
2. App icons/splash assets generated from `frontend/public` brand assets.
3. Push notification provider credentials configured for native wrappers if needed.
4. Privacy policy, support URL, and data deletion/contact flows published.
5. QA pass on Android Chrome install, iOS Add to Home Screen, offline mode, and notification permission flows.

## QA Commands

- `pnpm --dir frontend lint`
- `pnpm --dir frontend test -- --runInBand`
- `pnpm --dir frontend build`

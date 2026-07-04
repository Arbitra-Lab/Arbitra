import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Proxy — Server-side route protection.
 *
 * DISABLED FOR DEVELOPMENT - All routes are now accessible without authentication
 *
 * To re-enable authentication:
 * 1. Uncomment the auth check below
 * 2. Uncomment the matcher config
 */
export function proxy(request: NextRequest) {
  // AUTH DISABLED - Allow all access
  // const authToken = request.cookies.get('arbitra_auth_token')?.value;
  // if (!authToken) {
  //   console.log('🔒 Proxy: No auth token, redirecting to home');
  //   return NextResponse.redirect(new URL('/', request.url));
  // }
  // console.log('✅ Proxy: Auth token found, allowing access');

  return NextResponse.next();
}

/**
 * Matcher — Only run this middleware on dashboard routes.
 * DISABLED FOR DEVELOPMENT - Middleware is disabled
 *
 * To re-enable, uncomment the matcher config below
 */
export const config = {
  matcher: [
    // DISABLED - All routes are accessible
    // '/landlords/:path*',
    // '/agents/:path*',
    // '/tenant/:path*',
    // '/admin/:path*',
    // '/developer/:path*',
  ],
};

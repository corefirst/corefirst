import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { USER_ID_COOKIE } from '@/src/lib/constants';

// httpOnly: false is intentional — client JS reads this cookie to namespace
// localStorage settings per-profile (cf_settings_{userId} keys).
// Default is 'local' for single-user local installs. Multi-user profiles are
// managed client-side via ProfileSwitcher; each profile gets a deterministic
// SHA-256 hash ID derived from the profile name, not a random UUID.
const COOKIE_NAME = USER_ID_COOKIE;

export function proxy(request: NextRequest): NextResponse {
  const response = NextResponse.next();
  if (!request.cookies.get(COOKIE_NAME)) {
    response.cookies.set(COOKIE_NAME, 'local', {
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
      httpOnly: false,
    });
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

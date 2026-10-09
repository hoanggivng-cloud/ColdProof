import { NextResponse, type NextRequest } from 'next/server';
import { TOKEN_COOKIE } from './lib/session';

/** Every screen requires a session; /login and the session endpoint stay public. The backend still enforces roles. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/login' || pathname === '/register' || pathname.startsWith('/api/session') || request.cookies.has(TOKEN_COOKIE)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ message: 'Chưa đăng nhập' }, { status: 401 });
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ['/((?!_next/|favicon.ico).*)'] };

import { NextResponse, type NextRequest } from 'next/server';
import { toRole, TOKEN_COOKIE, USER_COOKIE } from '../../../../lib/session';
import { encodeUser } from '../../../../lib/session-server';

const apiBase = () => (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api').replace(/\/$/, '');
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 8 };

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const { email, password, role: reqRole } = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return NextResponse.json({ message: 'Vui lòng nhập đầy đủ email và mật khẩu.' }, { status: 400 });
  }

  const role = typeof reqRole === 'string' && (reqRole === 'QA_REVIEWER' || reqRole === 'OPERATOR') ? reqRole : 'OPERATOR';

  let response: Response;
  try {
    response = await fetch(`${apiBase()}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password, role }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return NextResponse.json({ message: 'Không kết nối được máy chủ. Thử lại sau.' }, { status: 503 });
  }

  if (response.status === 409) {
    return NextResponse.json({ message: 'Email này đã được sử dụng. Vui lòng đăng nhập hoặc chọn email khác.' }, { status: 409 });
  }
  if (!response.ok) {
    const errData: unknown = await response.json().catch(() => null);
    const message = typeof errData === 'object' && errData !== null && typeof (errData as { message?: unknown }).message === 'string'
      ? (errData as { message: string }).message
      : 'Đăng ký không thành công. Thử lại sau.';
    return NextResponse.json({ message }, { status: response.status });
  }

  const data: unknown = await response.json().catch(() => null);
  const record = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
  const user = typeof record.user === 'object' && record.user !== null ? record.user as Record<string, unknown> : {};
  const userRole = typeof user.role === 'string' ? toRole(user.role) : null;
  if (typeof record.access_token !== 'string' || typeof user.email !== 'string' || !userRole || typeof user.role !== 'string') {
    return NextResponse.json({ message: 'Tài khoản chưa được cấp vai trò hợp lệ.' }, { status: 403 });
  }

  const session = { email: user.email, role: userRole, serverRole: user.role };
  const result = NextResponse.json({ user: session });
  result.cookies.set(TOKEN_COOKIE, record.access_token, cookieOptions);
  result.cookies.set(USER_COOKIE, encodeUser(session), cookieOptions);
  return result;
}

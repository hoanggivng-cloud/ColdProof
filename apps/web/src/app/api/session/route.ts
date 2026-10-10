import { NextResponse, type NextRequest } from 'next/server';
import { toRole, TOKEN_COOKIE, USER_COOKIE } from '../../../lib/session';
import { decodeUser, encodeUser } from '../../../lib/session-server';

const apiBase = () => (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api').replace('localhost', '127.0.0.1').replace(/\/$/, '');
const cookieOptions = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 8 };
const invalid = () => NextResponse.json({ message: 'Email hoặc mật khẩu không đúng' }, { status: 401 });

export function GET(request: NextRequest) {
  const user = decodeUser(request.cookies.get(USER_COOKIE)?.value);
  return user && request.cookies.has(TOKEN_COOKIE) ? NextResponse.json({ user }) : NextResponse.json({ user: null });
}

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const { email, password, action, role: reqRole } = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {};
  if (typeof email !== 'string' || !email || typeof password !== 'string') return invalid();
  const isRegister = action === 'register';
  const endpoint = isRegister ? '/auth/register' : '/auth/login';
  const selectedRole = typeof reqRole === 'string' && (reqRole === 'QA_REVIEWER' || reqRole === 'OPERATOR') ? reqRole : 'OPERATOR';
  const payload = isRegister ? { email, password, role: selectedRole } : { email, password };
  let response: Response;
  try {
    response = await fetch(`${apiBase()}${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(8000) });
  } catch { return NextResponse.json({ message: 'Không kết nối được máy chủ. Thử lại sau.' }, { status: 503 }); }
  if (isRegister && response.status === 409) return NextResponse.json({ message: 'Email này đã được sử dụng.' }, { status: 409 });
  if (response.status === 400 || response.status === 401 || response.status === 404) return invalid();
  if (!response.ok) return NextResponse.json({ message: isRegister ? 'Không đăng ký được. Thử lại sau.' : 'Không đăng nhập được. Thử lại sau.' }, { status: 502 });
  const data: unknown = await response.json().catch(() => null);
  const record = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
  const user = typeof record.user === 'object' && record.user !== null ? record.user as Record<string, unknown> : {};
  const role = typeof user.role === 'string' ? toRole(user.role) : null;
  if (typeof record.access_token !== 'string' || typeof user.email !== 'string' || !role || typeof user.role !== 'string') return NextResponse.json({ message: 'Tài khoản chưa được cấp vai trò hợp lệ.' }, { status: 403 });
  const session = { email: user.email, role, serverRole: user.role };
  const result = NextResponse.json({ user: session });
  result.cookies.set(TOKEN_COOKIE, record.access_token, cookieOptions);
  result.cookies.set(USER_COOKIE, encodeUser(session), cookieOptions);
  return result;
}

export function DELETE() {
  const result = NextResponse.json({ user: null });
  result.cookies.delete(TOKEN_COOKIE);
  result.cookies.delete(USER_COOKIE);
  return result;
}

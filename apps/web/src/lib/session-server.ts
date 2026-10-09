import { toRole, type SessionUser } from './session';

export function encodeUser(user: SessionUser): string { return Buffer.from(JSON.stringify(user)).toString('base64url'); }
export function decodeUser(value: string | undefined): SessionUser | null {
  if (!value) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof data !== 'object' || data === null) return null;
    const { email, role, serverRole } = data as Record<string, unknown>;
    const parsed = typeof role === 'string' ? toRole(role) : null;
    return typeof email === 'string' && parsed && typeof serverRole === 'string' ? { email, role: parsed, serverRole } : null;
  } catch { return null; }
}

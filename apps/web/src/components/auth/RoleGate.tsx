'use client';
import type { ReactNode } from 'react';
import type { Role } from '../../lib/session';
import { useSession } from './SessionProvider';
/** Hides actions the current role may not use. UI only: the backend still enforces permissions. */
export function RoleGate({ roles, fallback = null, children }: { roles: Role[]; fallback?: ReactNode; children: ReactNode }) {
  const { hasRole, loading } = useSession();
  if (loading) return null;
  return <>{hasRole(...roles) ? children : fallback}</>;
}

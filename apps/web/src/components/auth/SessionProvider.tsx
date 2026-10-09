'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Role, SessionUser } from '../../lib/session';

interface SessionContext { user: SessionUser | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void>; hasRole: (...roles: Role[]) => boolean }
const Context = createContext<SessionContext | null>(null);

async function fetchSession(): Promise<SessionUser | null> {
  const response = await fetch('/api/session', { cache: 'no-store' }).catch(() => null);
  if (!response?.ok) return null;
  const data: unknown = await response.json().catch(() => null);
  const user = typeof data === 'object' && data !== null ? (data as { user?: SessionUser | null }).user : null;
  return user ?? null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<{ user: SessionUser | null; loading: boolean }>({ user: null, loading: true });
  const refresh = useCallback(async () => { const user = await fetchSession(); setState({ user, loading: false }); }, []);
  useEffect(() => { let active = true; fetchSession().then(user => { if (active) setState({ user, loading: false }); }); return () => { active = false; }; }, []);
  const logout = useCallback(async () => { await fetch('/api/session', { method: 'DELETE' }).catch(() => null); setState({ user: null, loading: false }); router.replace('/login'); router.refresh(); }, [router]);
  const hasRole = useCallback((...roles: Role[]) => Boolean(state.user && roles.includes(state.user.role)), [state.user]);
  return <Context.Provider value={{ ...state, refresh, logout, hasRole }}>{children}</Context.Provider>;
}

export function useSession() {
  const context = useContext(Context);
  if (!context) throw new Error('SessionProvider is required');
  return context;
}

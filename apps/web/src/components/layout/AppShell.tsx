'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isDemo, roleLabels, type Role } from '../../lib/session';
import { useSession } from '../auth/SessionProvider';
import { Button } from '../ui/Button';

const links: { href: string; label: string; roles?: Role[] }[] = [
  { href: '/batches', label: 'Lô hàng' }, { href: '/imports', label: 'Import' }, { href: '/qa', label: 'QA' }, { href: '/reports', label: 'Hồ sơ' },
  { href: '/profiles', label: 'Profile' }, { href: '/sources', label: 'Nguồn dữ liệu' }, { href: '/admin', label: 'Quản trị', roles: ['ADMIN'] },
];

export function DemoStrip() { return isDemo() ? <div className="env-strip" role="note">Môi trường demo · dữ liệu mô phỏng</div> : null; }

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading, logout, hasRole } = useSession();
  if (pathname === '/login' || pathname === '/register') return <>{children}</>;
  const visible = links.filter(link => !link.roles || hasRole(...link.roles));
  return <div className="app-shell">
    <DemoStrip />
    <header className="topbar">
      <Link className="topbar-brand" href="/">ColdProof</Link>
      <nav className="topbar-menu" aria-label="Menu chính">{visible.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href || pathname.startsWith(`${link.href}/`) ? 'page' : undefined}>{link.label}</Link>)}</nav>
      <div className="topbar-user">{loading ? <span>Đang tải phiên…</span> : user ? <><span><strong>{roleLabels[user.role]}</strong> · {user.email}</span><Button onClick={() => void logout()}>Đăng xuất</Button></> : <Link href="/login">Đăng nhập</Link>}</div>
    </header>
    <main className="app-main">{children}</main>
  </div>;
}

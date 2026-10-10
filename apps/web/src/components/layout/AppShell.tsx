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
  return <div className="app-shell sidebar-layout">
    <aside className="sidebar">
      <div className="sidebar-header">
        <Link className="sidebar-brand" href="/">ColdProof</Link>
      </div>
      <nav className="sidebar-menu" aria-label="Menu chính">
        {visible.map(link => (
          <Link 
            key={link.href} 
            href={link.href} 
            aria-current={pathname === link.href || pathname.startsWith(`${link.href}/`) ? 'page' : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        {loading ? (
          <span className="user-info">Đang tải phiên…</span>
        ) : user ? (
          <div className="user-profile">
            <div className="user-info">
              <strong>{roleLabels[user.role]}</strong>
              <small>{user.email}</small>
            </div>
            <Button className="logout-btn" onClick={() => void logout()}>Đăng xuất</Button>
          </div>
        ) : (
          <Link className="login-link" href="/login">Đăng nhập</Link>
        )}
      </div>
    </aside>
    <div className="main-content-wrapper">
      <DemoStrip />
      <main className="app-main">{children}</main>
    </div>
  </div>;
}

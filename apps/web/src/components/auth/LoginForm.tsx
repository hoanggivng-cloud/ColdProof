'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { demoAccounts, isDemo, roleLabels } from '../../lib/session';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { useSession } from './SessionProvider';

const safeNext = () => { const value = new URLSearchParams(window.location.search).get('next'); return value && value.startsWith('/') && !value.startsWith('//') ? value : '/'; };

export function LoginForm() {
  const router = useRouter();
  const { refresh } = useSession();
  const [visible, setVisible] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState('');
  const login = async (email: string, password: string) => {
    setPending(true); setError('');
    const response = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) }).catch(() => null);
    if (!response?.ok) {
      const data: unknown = await response?.json().catch(() => null);
      const message = typeof data === 'object' && data !== null && typeof (data as { message?: unknown }).message === 'string' ? (data as { message: string }).message : 'Không kết nối được máy chủ. Thử lại sau.';
      setError(message); setPending(false); return;
    }
    await refresh();
    router.replace(safeNext());
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim(), password = String(data.get('password') ?? '');
    if (!email || !password) { setError('Nhập email và mật khẩu.'); return; }
    void login(email, password);
  };
  return <section className="auth-panel" aria-labelledby="login-title">
    <p className="auth-brand">ColdProof</p>
    <h1 id="login-title">Đăng nhập</h1>
    <p>Hồ sơ nhiệt độ chuỗi lạnh dược</p>
    <form className="auth-form" onSubmit={submit} noValidate>
      <Field id="login-email" label="Email"><input id="login-email" name="email" type="email" autoComplete="username" autoFocus required disabled={pending} /></Field>
      <Field id="login-password" label="Mật khẩu"><div className="field-control"><input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required disabled={pending} /><Button variant="text" onClick={() => setVisible(value => !value)} aria-pressed={visible} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{visible ? 'Ẩn' : 'Hiện'}</Button></div></Field>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Đang đăng nhập…' : 'Đăng nhập'}</Button>
    </form>
    <p className="auth-help">Chưa có tài khoản? Liên hệ quản trị viên.</p>
    {isDemo() && <section className="auth-demo" aria-labelledby="demo-title"><h2 id="demo-title">Đăng nhập nhanh tài khoản demo</h2><div className="actions">{demoAccounts.map(account => <Button key={account.role} disabled={pending} onClick={() => void login(account.email, '')}>{roleLabels[account.role]}</Button>)}</div></section>}
  </section>;
}

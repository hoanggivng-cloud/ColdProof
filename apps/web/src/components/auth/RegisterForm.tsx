'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { useSession } from './SessionProvider';

const safeNext = () => {
  if (typeof window === 'undefined') return '/';
  const value = new URLSearchParams(window.location.search).get('next');
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
};

export function RegisterForm() {
  const router = useRouter();
  const { refresh } = useSession();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') ?? '').trim();
    const role = String(data.get('role') ?? 'OPERATOR');
    const password = String(data.get('password') ?? '');
    const confirmPassword = String(data.get('confirmPassword') ?? '');

    if (!email) {
      setError('Vui lòng nhập địa chỉ email.');
      return;
    }
    if (!password) {
      setError('Vui lòng nhập mật khẩu.');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không trùng khớp.');
      return;
    }

    setPending(true);
    setError('');

    const response = await fetch('/api/session/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, role }),
    }).catch(() => null);

    if (!response?.ok) {
      const respData: unknown = await response?.json().catch(() => null);
      const message =
        typeof respData === 'object' && respData !== null && typeof (respData as { message?: unknown }).message === 'string'
          ? (respData as { message: string }).message
          : 'Không thể kết nối máy chủ hoặc đăng ký thất bại.';
      setError(message);
      setPending(false);
      return;
    }

    await refresh();
    router.replace(safeNext());
  };

  return (
    <section className="auth-panel" aria-labelledby="register-title">
      <p className="auth-brand">ColdProof</p>
      <h1 id="register-title">Đăng ký tài khoản</h1>
      <p>Hệ thống hồ sơ nhiệt độ chuỗi lạnh dược</p>
      <form className="auth-form" onSubmit={submit} noValidate>
        <Field id="register-email" label="Email">
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            autoFocus
            required
            disabled={pending}
            placeholder="duoc-vien@coldproof.local"
          />
        </Field>
        <Field id="register-role" label="Vai trò hệ thống" hint="Phân quyền tài khoản trong chuỗi lạnh">
          <select id="register-role" name="role" defaultValue="OPERATOR" disabled={pending}>
            <option value="OPERATOR">Operator (Vận hành & Nhập dữ liệu hành trình)</option>
            <option value="QA_REVIEWER">QA Reviewer (Kiểm định chất lượng & Phê duyệt ngoại lệ)</option>
          </select>
        </Field>
        <Field id="register-password" label="Mật khẩu" hint="Tối thiểu 6 ký tự">
          <div className="field-control">
            <input
              id="register-password"
              name="password"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={6}
              disabled={pending}
            />
            <Button
              variant="text"
              type="button"
              onClick={() => setVisible(value => !value)}
              aria-pressed={visible}
              aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            >
              {visible ? 'Ẩn' : 'Hiện'}
            </Button>
          </div>
        </Field>
        <Field id="register-confirm-password" label="Xác nhận mật khẩu">
          <input
            id="register-confirm-password"
            name="confirmPassword"
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            required
            disabled={pending}
          />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? 'Đang đăng ký…' : 'Đăng ký tài khoản'}
        </Button>
      </form>
      <p className="auth-help">
        Đã có tài khoản? <Link href="/login">Đăng nhập ngay</Link>.
      </p>
    </section>
  );
}

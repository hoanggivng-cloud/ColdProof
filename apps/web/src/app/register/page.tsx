import { RegisterForm } from '../../components/auth/RegisterForm';
import { DemoStrip } from '../../components/layout/AppShell';

export default function Register() {
  return (
    <div className="auth-page">
      <DemoStrip />
      <main className="auth-main">
        <RegisterForm />
      </main>
      <footer className="auth-footer">
        ColdProof · phiên bản <span className="number">{process.env.NEXT_PUBLIC_APP_VERSION ?? '—'}</span>
      </footer>
    </div>
  );
}

import { LoginForm } from '../../components/auth/LoginForm';
import { DemoStrip } from '../../components/layout/AppShell';
export default function Login() {
  return <div className="auth-page"><DemoStrip /><main className="auth-main"><LoginForm /></main><footer className="auth-footer">ColdProof · phiên bản <span className="number">{process.env.NEXT_PUBLIC_APP_VERSION ?? '—'}</span></footer></div>;
}

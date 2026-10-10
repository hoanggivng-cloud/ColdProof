import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
export type ButtonVariant = 'primary' | 'secondary' | 'text';
export function Button({ href, primary = false, variant, loading = false, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { href?: string; primary?: boolean; variant?: ButtonVariant; loading?: boolean; children: ReactNode }) {
  const kind = variant ?? (primary ? 'primary' : 'secondary');
  const className = `button ${kind === 'primary' ? 'button-primary' : kind === 'text' ? 'button-text' : ''} ${props.className ?? ''}`.trim();
  const content = loading ? <><span className="spinner"></span>{children}</> : children;
  
  if (href) {
    return <Link className={className} href={href} aria-label={props['aria-label']} style={loading ? { pointerEvents: 'none', opacity: 0.6 } : undefined}>{content}</Link>;
  }
  return <button type="button" disabled={loading || props.disabled} {...props} className={className}>{content}</button>;
}

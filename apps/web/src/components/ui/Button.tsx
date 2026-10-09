import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
export type ButtonVariant = 'primary' | 'secondary' | 'text';
export function Button({ href, primary = false, variant, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { href?: string; primary?: boolean; variant?: ButtonVariant; children: ReactNode }) {
  const kind = variant ?? (primary ? 'primary' : 'secondary');
  const className = `button ${kind === 'primary' ? 'button-primary' : kind === 'text' ? 'button-text' : ''} ${props.className ?? ''}`.trim();
  return href ? <Link className={className} href={href} aria-label={props['aria-label']}>{children}</Link> : <button type="button" {...props} className={className}>{children}</button>;
}

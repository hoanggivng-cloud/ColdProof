import type { AriaRole, ReactNode } from 'react';
export type AlertTone = 'info' | 'warning' | 'error';
/** Neutral info note, amber warning (warnings only) or red error (errors/excursions only). */
export function Alert({ tone = 'info', title, role, className, children }: { tone?: AlertTone; title?: ReactNode; role?: AriaRole; className?: string; children?: ReactNode }) {
  const defaultRole = tone === 'error' ? 'alert' : 'note';
  return <div role={role ?? defaultRole} className={`alert ${tone === 'info' ? '' : `alert-${tone}`} ${className ?? ''}`.trim()}>{title && <strong className="alert-title">{title}</strong>}{children}</div>;
}

import type { ReactNode } from 'react';
/** Label + control + optional hint and error. The control must use `id` and may reference `${id}-hint` / `${id}-error`. */
export function Field({ id, label, hint, error, className, children }: { id: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; className?: string; children: ReactNode }) {
  return <div className={`field ${className ?? ''}`.trim()}><label htmlFor={id}>{label}</label>{children}{hint && <small id={`${id}-hint`} className="field-hint">{hint}</small>}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}

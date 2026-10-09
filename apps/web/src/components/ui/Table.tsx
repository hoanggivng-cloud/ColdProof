import type { ReactNode } from 'react';
/** Scrollable table with sticky header and 40px rows. Use `className="number"` on numeric th/td. */
export function Table({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return <div className="table-scroll" role="region" aria-label={label} tabIndex={label ? 0 : undefined}><table className={className}>{children}</table></div>;
}

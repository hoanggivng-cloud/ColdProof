import type { ReactNode } from 'react';
export type BadgeTone = 'neutral' | 'synthetic' | 'accent' | 'warning' | 'danger';
const tones: Record<BadgeTone, string> = { neutral: '', synthetic: 'badge-synthetic', accent: 'tone-success', warning: 'tone-warning', danger: 'tone-danger' };
export function Badge({ tone = 'neutral', className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return <span className={`badge ${tones[tone]} ${className ?? ''}`.trim()}>{children}</span>;
}

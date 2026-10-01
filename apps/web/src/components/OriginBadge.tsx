import type { MeasurementOrigin } from '@coldproof/canonical-schema';
const labels: Record<MeasurementOrigin, string> = { REAL_PUBLIC_DATA: 'Real public data', DERIVED: 'Derived', SYNTHETIC: 'Synthetic' };
export function OriginBadge({ origin }: { origin: MeasurementOrigin }) { return <span className={`badge origin-${origin.toLowerCase()}`}>{labels[origin]}</span>; }

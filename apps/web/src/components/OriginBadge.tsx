import type { MeasurementOrigin } from '@coldproof/canonical-schema';
import { Badge } from './ui/Badge';
const labels: Record<MeasurementOrigin, string> = { REAL_PUBLIC_DATA: 'Dữ liệu công khai', DERIVED: 'Dữ liệu dẫn xuất', SYNTHETIC: 'Mô phỏng' };
export function OriginBadge({ origin }: { origin: MeasurementOrigin }) { return <Badge tone={origin === 'SYNTHETIC' ? 'synthetic' : 'neutral'}>{labels[origin]}</Badge>; }

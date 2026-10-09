import { Badge, type BadgeTone } from './ui/Badge';
/** Shows the server status verbatim; red only for excursions, amber only for items needing attention. */
const tones: Record<string, BadgeTone> = { NORMAL: 'accent', EXCEPTION: 'danger', MISSING: 'warning', CONFLICT: 'warning', PENDING: 'warning', PENDING_REVIEW: 'warning' };
export function BatchStatusBadge({ status }: { status: string }) { return <Badge tone={tones[status] ?? 'neutral'}>{status}</Badge>; }

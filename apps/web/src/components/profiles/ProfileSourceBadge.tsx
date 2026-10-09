import type { ProfileSource } from '../../types/profiles';
const labels: Record<ProfileSource, string> = { FORM_FIXTURE: 'Mô phỏng · form', SERVER_BATCH: 'Server · từ lô', BOTH: 'Form và server' };
export function ProfileSourceBadge({ source }: { source: ProfileSource }) { return <span className={`badge ${source === 'FORM_FIXTURE' ? 'origin-synthetic' : ''}`}>{labels[source]}</span>; }

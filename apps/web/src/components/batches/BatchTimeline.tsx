import type { BatchInfo } from '../../types/batch-detail';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Table } from '../ui/Table';

const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
const events: Record<string, [string, BadgeTone]> = {
  SEGMENT_START: ['Bắt đầu chặng', 'neutral'], HANDOVER: ['Bàn giao', 'accent'], DOOR_OPEN: ['Mở cửa', 'neutral'],
  EXCURSION_START: ['Bắt đầu vượt ngưỡng', 'danger'], EXCURSION_END: ['Kết thúc vượt ngưỡng', 'danger'],
};

/** Segments and timeline events exactly as the server returns them, in time order. */
export function BatchTimeline({ batch }: { batch: BatchInfo }) {
  return <>
    <h3>Chặng</h3>
    {!batch.segments.length ? <p>Server chưa trả chặng cho lô này.</p> : <Table label="Chặng của lô"><thead><tr><th scope="col" className="number">Chặng</th><th scope="col" className="number">Thiết bị</th><th scope="col" className="number">Nguồn dữ liệu</th><th scope="col" className="number">Bàn giao vào chặng</th><th scope="col">Cửa sổ dữ liệu</th></tr></thead><tbody>{batch.segments.map(item => <tr key={item.id}><td className="number">{item.id}</td><td className="number">{item.device_alias ?? 'Chưa có'}</td><td className="number" title={item.source_id ?? undefined}>{item.source_id ? `${item.source_id.slice(0, 8)}…` : 'Chưa có'}</td><td className="number">{item.handover_id ?? '—'}</td><td>{item.selector ?? 'Chưa có'}</td></tr>)}</tbody></Table>}
    <h3>Mốc thời gian</h3>
    {!batch.timeline.length ? <p>Server chưa trả mốc thời gian cho lô này.</p> : <Table label="Mốc thời gian của lô"><thead><tr><th scope="col" className="number">Thời gian (UTC+7)</th><th scope="col">Sự kiện</th><th scope="col" className="number">Chặng</th><th scope="col" className="number">Thiết bị</th><th scope="col">Chi tiết từ server</th></tr></thead><tbody>{batch.timeline.map(item => { const [label, tone] = events[item.event_type] ?? [item.event_type, 'neutral' as BadgeTone]; return <tr key={item.id}><td className="number"><time dateTime={item.timestamp}>{time.format(new Date(item.timestamp))}</time></td><td><Badge tone={tone}>{label}</Badge>{item.handover_id && <small className="number">{item.handover_id}</small>}</td><td className="number">{item.segment_id ?? '—'}</td><td className="number">{item.device_alias ?? '—'}</td><td>{item.detail ?? '—'}</td></tr>; })}</tbody></Table>}
  </>;
}

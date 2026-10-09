'use client';
import { useEffect, useState } from 'react';
import type { MeasurementOrigin } from '@coldproof/canonical-schema';
import { getBatchDetail } from '../../services/batch-detail';
import type { BatchDetailData } from '../../types/batch-detail';
import { ApiRecords } from '../ApiRecords';
import { OriginBadge } from '../OriginBadge';
import { PageHeader } from '../layout/PageHeader';
import { WorkflowProgress } from '../shipment/ShipmentWorkflow';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { BatchTimeline } from './BatchTimeline';
import { TemperatureChart } from './TemperatureChart';

const qualityWarning = (rows: unknown[]) => `${rows.length} vấn đề chất lượng dữ liệu từ server cần xem xét. Không nội suy hoặc xóa dữ liệu thiếu.`;
const isOrigin = (value: string | null): value is MeasurementOrigin => value === 'SYNTHETIC' || value === 'DERIVED' || value === 'REAL_PUBLIC_DATA';

export function BatchDetail({ id }: { id: string }) {
  const path = `batches/${encodeURIComponent(id)}`;
  const [state, setState] = useState<{ data: BatchDetailData | null; loading: boolean; error: string }>({ data: null, loading: true, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { const controller = new AbortController(); getBatchDetail(id, controller.signal).then(data => { if (!controller.signal.aborted) setState({ data, loading: false, error: '' }); }).catch((error: unknown) => { if (!controller.signal.aborted) setState({ data: null, loading: false, error: error instanceof Error ? error.message : 'Không tải được lô.' }); }); return () => controller.abort(); }, [id, attempt]);
  const batch = state.data?.batch;
  const conflicts = state.data?.measurements.filter(row => row.conflict).length ?? 0;
  const meta = batch ? [
    <>Profile <strong className="number">{batch.profile_id ?? 'Chưa có'}</strong></>,
    <>Ngưỡng <strong className="number">{batch.lower !== null && batch.upper !== null ? `${batch.lower}°C – ${batch.upper}°C` : 'Chưa có'}</strong></>,
    <><strong className="number">{batch.segments.length}</strong> chặng</>,
    <><strong className="number">{state.data?.measurements.length ?? 0}</strong> số đo</>,
    isOrigin(batch.origin) ? <>Bối cảnh <OriginBadge origin={batch.origin} /></> : <>Bối cảnh <Badge>{batch.origin ?? 'Chưa rõ'}</Badge></>,
  ] : undefined;
  return <>
    <PageHeader title={id} breadcrumb={[{ href: '/batches', label: 'Lô hàng' }, { label: id }]} description="Biểu đồ nhiệt độ, chặng, số đo, sự cố và chất lượng dữ liệu từ server." meta={meta}><Button href="/batches">Về danh sách lô</Button></PageHeader>
    <WorkflowProgress current={4} batchId={id} />
    {state.loading ? <p role="status">Đang tải dữ liệu lô…</p> : state.error || !state.data || !batch ? <Alert tone="error" title="Không tải được lô">{state.error || 'Không có dữ liệu lô.'}<div className="actions"><Button onClick={() => { setState({ data: null, loading: true, error: '' }); setAttempt(value => value + 1); }}>Thử lại</Button></div></Alert> : <>
      {conflicts > 0 && <Alert tone="warning" title="Xung đột cảm biến">{conflicts} số đo có cờ xung đột từ server. Giữ cả hai chuỗi; không tự chọn chuỗi đúng hoặc lấy trung bình.</Alert>}
      <Panel title="Biểu đồ nhiệt độ"><TemperatureChart batch={batch} measurements={state.data.measurements} /></Panel>
      <Panel title="Chặng và mốc thời gian"><BatchTimeline batch={batch} /></Panel>
    </>}
    <Panel title="Số đo nhiệt độ"><ApiRecords path={`${path}/measurements`} label="Số đo nhiệt độ" emptyText="Chưa có số đo cho lô này." columns={[['timestamp', 'Thời gian (UTC+7)'], ['source_sensor_id', 'Cảm biến'], ['segment_id', 'Chặng'], ['temperature_c', 'Nhiệt độ (°C)'], ['source_row_or_ref', 'Tham chiếu nguồn'], ['measurement_origin', 'Xuất xứ']]} /></Panel>
    <Panel title="Sự cố"><ApiRecords path={`${path}/exceptions`} collection="exceptions" label="Sự cố" emptyText="Server chưa ghi nhận sự cố cho lô này." linkColumn={{ key: 'id', href: value => `/qa/${encodeURIComponent(value)}` }} columns={[['id', 'Sự cố'], ['profile_id', 'Profile'], ['status', 'Trạng thái']]} /></Panel>
    <Panel title="Chất lượng dữ liệu"><ApiRecords path={`${path}/exceptions`} collection="quality_issues" label="Chất lượng dữ liệu" emptyText="Chưa có vấn đề chất lượng dữ liệu." warning={qualityWarning} columns={[['id', 'Issue'], ['code', 'Mã lỗi'], ['detail', 'Nội dung']]} /></Panel>
    <div className="form-footer"><p>Bước tiếp theo: QA xem xét sự cố. Giao diện không kết luận lô đạt/không đạt.</p><div className="actions"><Button href="/reports">Xem hồ sơ bằng chứng</Button><Button primary href="/qa">Tiếp tục: QA review</Button></div></div>
  </>;
}

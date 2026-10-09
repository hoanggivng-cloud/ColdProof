'use client';
import { ApiRecords } from '../ApiRecords';
import { PageHeader } from '../layout/PageHeader';
import { WorkflowProgress } from '../shipment/ShipmentWorkflow';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';

const qualityWarning = (rows: unknown[]) => `${rows.length} vấn đề chất lượng dữ liệu từ server cần xem xét. Không nội suy hoặc xóa dữ liệu thiếu.`;

export function BatchDetail({ id }: { id: string }) {
  const path = `batches/${encodeURIComponent(id)}`;
  return <>
    <PageHeader title={id} breadcrumb={[{ href: '/batches', label: 'Lô hàng' }, { label: id }]} description="Thông tin lô, số đo, sự cố và chất lượng dữ liệu từ server."><Button href="/batches">Về danh sách lô</Button></PageHeader>
    <WorkflowProgress current={4} batchId={id} />
    <Panel title="Thông tin lô"><ApiRecords path={path} label="Thông tin lô" columns={[['id', 'Mã lô'], ['profile_id', 'Profile'], ['business_context_origin', 'Xuất xứ'], ['segments', 'Chặng'], ['timeline', 'Mốc thời gian']]} /></Panel>
    <Panel title="Số đo nhiệt độ"><ApiRecords path={`${path}/measurements`} label="Số đo nhiệt độ" emptyText="Chưa có số đo cho lô này." columns={[['timestamp', 'Thời gian (UTC+7)'], ['source_sensor_id', 'Cảm biến'], ['temperature_c', 'Nhiệt độ (°C)'], ['source_row_or_ref', 'Tham chiếu nguồn'], ['measurement_origin', 'Xuất xứ']]} /></Panel>
    <Panel title="Sự cố"><ApiRecords path={`${path}/exceptions`} collection="exceptions" label="Sự cố" emptyText="Server chưa ghi nhận sự cố cho lô này." linkColumn={{ key: 'id', href: value => `/qa/${encodeURIComponent(value)}` }} columns={[['id', 'Sự cố'], ['profile_id', 'Profile'], ['status', 'Trạng thái']]} /></Panel>
    <Panel title="Chất lượng dữ liệu"><ApiRecords path={`${path}/exceptions`} collection="quality_issues" label="Chất lượng dữ liệu" emptyText="Chưa có vấn đề chất lượng dữ liệu." warning={qualityWarning} columns={[['id', 'Issue'], ['code', 'Mã lỗi'], ['detail', 'Nội dung']]} /></Panel>
    <div className="form-footer"><p>Bước tiếp theo: QA xem xét sự cố. Giao diện không kết luận lô đạt/không đạt.</p><div className="actions"><Button href="/reports">Xem hồ sơ bằng chứng</Button><Button primary href="/qa">Tiếp tục: QA review</Button></div></div>
  </>;
}

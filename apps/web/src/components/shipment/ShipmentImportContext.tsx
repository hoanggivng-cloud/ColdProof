'use client';
import { useShipmentWorkflow, WorkflowProgress } from './ShipmentWorkflow';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
export function ShipmentImportContext() {
  const { shipment, deviceIds, devicesConfirmed, handover } = useShipmentWorkflow();
  const ready = Boolean(shipment && devicesConfirmed && handover);
  return <><WorkflowProgress current={3} /><Panel title="Thông tin chuyển sang Import">
    {!ready || !shipment || !handover ? <><Alert tone="warning" title="Chưa chuẩn bị lô">Chưa hoàn thành Tạo Shipment → Gán thiết bị → Ghi nhận bàn giao trong phiên này. Hoàn thành ba bước trước khi nhập file cho lô mới.</Alert><Button primary href="/batches/new">Tiếp tục chuẩn bị Shipment</Button></> : <><Alert title="Dữ liệu mô phỏng">Dữ liệu được chuyển từ form, chưa có mã lô trên server. Upload và xử lý file chưa được kết nối.</Alert><dl className="workflow-summary"><dt>Mã lô trong form</dt><dd className="number">{shipment.lot}</dd><dt>Sản phẩm</dt><dd>{shipment.product}</dd><dt>Hành trình</dt><dd>{shipment.origin} → {shipment.destination}</dd><dt>Profile</dt><dd className="number">{shipment.profileId}</dd><dt>Thiết bị đã chọn</dt><dd className="number">{deviceIds.join(', ')}</dd><dt>Điểm bàn giao</dt><dd>{handover.location} · <span className="number">{handover.timestampRaw.replace('T', ' ')}</span> (UTC+7)</dd><dt>Tài liệu bàn giao</dt><dd>{handover.attachment?.name ?? 'Chưa chọn tài liệu'}</dd></dl><div className="form-footer"><Button href="/batches/new">Quay lại kiểm tra Shipment</Button></div></>}
    <p>Tải lại trang sẽ xóa dữ liệu form chưa lưu. Chưa upload hoặc tạo import job.</p>
  </Panel></>;
}

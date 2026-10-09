'use client';
import { ApiRecords } from '../../components/ApiRecords';
import { RoleGate } from '../../components/auth/RoleGate';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import type { ApiRecord } from '../../services/api-client';

const missingProfile = (rows: ApiRecord[]) => {
  const count = rows.filter(row => typeof row.profile_id !== 'string' || !row.profile_id).length;
  return count ? `${count} lô chưa gắn profile nhiệt độ trên server.` : null;
};

export default function Batches() {
  return <>
    <PageHeader title="Lô hàng" description="Mở hồ sơ lô để xem số đo, sự cố và chất lượng dữ liệu."><RoleGate roles={['OPERATOR', 'ADMIN']}><Button primary href="/batches/new">Tạo Shipment</Button></RoleGate></PageHeader>
    <ApiRecords path="batches" label="Danh sách lô" batchLinks emptyText="Chưa có lô trên server." warning={missingProfile} columns={[['id', 'Mã lô'], ['scenario_id', 'Kịch bản'], ['status', 'Trạng thái'], ['segments_count', 'Số chặng'], ['profile_id', 'Profile'], ['created_at', 'Tạo lúc (UTC+7)']]} />
  </>;
}

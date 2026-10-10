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
    <PageHeader title="Lô hàng (Batches)" description="Quản lý hồ sơ lô, theo dõi tiến trình, sự cố và chất lượng dữ liệu nhiệt độ.">
      <RoleGate roles={['OPERATOR', 'ADMIN']}>
        <Button primary href="/batches/new">+ Tạo Shipment Mới</Button>
      </RoleGate>
    </PageHeader>
    <div className="panel" style={{ marginTop: '24px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '16px' }}>Danh sách Lô hàng trên Hệ thống</h2>
      <ApiRecords path="batches" batchLinks emptyText="Chưa có lô hàng nào trên server." warning={missingProfile} columns={[['id', 'Mã lô'], ['scenario_id', 'Kịch bản'], ['status', 'Trạng thái'], ['segments_count', 'Số chặng'], ['profile_id', 'Profile'], ['created_at', 'Tạo lúc (UTC+7)']]} />
    </div>
  </>;
}

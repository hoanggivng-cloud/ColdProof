'use client';
import { useEffect, useState } from 'react';
import { ApiRecords } from '../ApiRecords';
import { PageHeader } from '../layout/PageHeader';
import { WorkflowProgress } from '../shipment/ShipmentWorkflow';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { TemperatureChart } from './TemperatureChart';
import { BatchSegmentsCard } from './BatchSegmentsCard';
import { BatchTimelineView } from './BatchTimelineView';
import { readRecords, type ApiRecord } from '../../services/api-client';
import { useSession } from '../auth/SessionProvider';

const qualityWarning = (rows: unknown[]) =>
  `${rows.length} vấn đề chất lượng dữ liệu từ server cần xem xét. Không nội suy hoặc xóa dữ liệu thiếu.`;

export function BatchDetail({ id }: { id: string }) {
  const path = `batches/${encodeURIComponent(id)}`;
  const [batchData, setBatchData] = useState<ApiRecord | null>(null);
  const [measurements, setMeasurements] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      readRecords(path).catch(() => []),
      readRecords(`${path}/measurements`).catch(() => []),
    ]).then(([batches, meas]) => {
      if (isMounted) {
        if (batches.length > 0) setBatchData(batches[0]);
        setMeasurements(meas);
        setLoading(false);
      }
    });
    return () => { isMounted = false; };
  }, [path]);

  const { hasRole } = useSession();
  const isOperator = hasRole('OPERATOR') && !hasRole('ADMIN');

  const segments = Array.isArray(batchData?.segments) ? (batchData?.segments as ApiRecord[]) : [];
  const timeline = Array.isArray(batchData?.timeline) ? (batchData?.timeline as ApiRecord[]) : [];
  const lowerThreshold = typeof batchData?.lower_threshold === 'number' ? batchData.lower_threshold : 2.0;
  const upperThreshold = typeof batchData?.upper_threshold === 'number' ? batchData.upper_threshold : 8.0;

  const exportLogCSV = () => {
    if (!measurements.length) return;
    const headers = ['Mã lô', 'Thời gian (UTC+7)', 'Mã cảm biến', 'Nhiệt độ (°C)', 'Tham chiếu nguồn', 'Xuất xứ'];
    const rows = measurements.map((m) => [
      id,
      m.timestamp ?? '',
      m.source_sensor_id ?? '',
      m.temperature_c ?? '',
      m.source_row_or_ref ?? '',
      m.measurement_origin ?? '',
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\r\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coldproof-log-hanh-trinh-${id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <p role="status">Đang tải dữ liệu lô từ server…</p>;
  }

  return (
    <>
      <PageHeader
        title={id}
        breadcrumb={[{ href: '/batches', label: 'Lô hàng' }, { label: id }]}
        description="Thông tin lô, biểu đồ nhiệt độ thời gian thực, hành trình các chặng và hồ sơ sự cố."
      >
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Button href="/batches">Về danh sách lô</Button>
          {hasRole('QA_REVIEWER', 'ADMIN') && (
            <Button disabled={!measurements.length} onClick={exportLogCSV}>
              📥 Xuất log hành trình (CSV)
            </Button>
          )}
        </div>
      </PageHeader>

      <WorkflowProgress current={3} batchId={id} />

      {/* 1. HERO COMPONENT: Visual Temperature Chart with Safe Zone & Excursions */}
      <TemperatureChart
        measurements={measurements}
        lowerThreshold={lowerThreshold}
        upperThreshold={upperThreshold}
        batchId={id}
      />

      {/* 2. Visual Journey Cards (Segments) */}
      <BatchSegmentsCard segments={segments} batchId={id} />

      {/* 3. Visual Vertical Timeline */}
      <BatchTimelineView timeline={timeline} batchId={id} />

      {/* 4. Tabular Compliance Records (Auditable raw data tables) */}
      <Panel title="Bảng số đo nhiệt độ chi tiết (Canonical Stream)">
        <ApiRecords
          path={`${path}/measurements`}
          label="Số đo nhiệt độ"
          emptyText="Chưa có số đo cho lô này."
          columns={[
            ['timestamp', 'Thời gian (UTC+7)'],
            ['source_sensor_id', 'Cảm biến'],
            ['temperature_c', 'Nhiệt độ (°C)'],
            ['source_row_or_ref', 'Tham chiếu nguồn'],
            ['measurement_origin', 'Xuất xứ'],
          ]}
        />
      </Panel>

      <Panel title="Sự cố vượt ngưỡng (Exceptions)">
        <ApiRecords
          path={`${path}/exceptions`}
          collection="exceptions"
          label="Sự cố"
          emptyText="Server chưa ghi nhận sự cố cho lô này."
          linkColumn={{ key: 'id', href: (value) => `/qa/${encodeURIComponent(value)}` }}
          columns={[
            ['id', 'Sự cố'],
            ['profile_id', 'Profile'],
            ['status', 'Trạng thái'],
          ]}
        />
      </Panel>

      <Panel title="Chất lượng dữ liệu (Data Quality Issues)">
        <ApiRecords
          path={`${path}/exceptions`}
          collection="quality_issues"
          label="Chất lượng dữ liệu"
          emptyText="Chưa có vấn đề chất lượng dữ liệu."
          warning={qualityWarning}
          columns={[
            ['id', 'Issue'],
            ['code', 'Mã lỗi'],
            ['detail', 'Nội dung'],
          ]}
        />
      </Panel>

      <div className="form-footer">
        {isOperator ? (
          <>
            <p>Hành trình và số đo cảm biến của lô hàng đã được ghi nhận. Việc trích xuất log, đối chiếu sai lệch nhiệt độ và thẩm định hồ sơ được phụ trách bởi QA Reviewer.</p>
            <div className="actions">
              <Button primary href="/batches">Về danh sách lô hàng</Button>
            </div>
          </>
        ) : (
          <>
            <p>Bước tiếp theo: QA trích xuất file log đối chiếu, xem xét sự cố nhiệt độ và phát hành hồ sơ bằng chứng.</p>
            <div className="actions" style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Button disabled={!measurements.length} onClick={exportLogCSV}>
                📥 Xuất log hành trình (CSV)
              </Button>
              <Button href={`/imports?batchId=${encodeURIComponent(id)}`}>
                📂 Nạp thêm log logger
              </Button>
              <Button href="/reports">Xem hồ sơ bằng chứng</Button>
              <Button primary href="/qa">
                Tiếp tục: QA review →
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

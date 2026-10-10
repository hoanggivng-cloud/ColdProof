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

  const segments = Array.isArray(batchData?.segments) ? (batchData?.segments as ApiRecord[]) : [];
  const timeline = Array.isArray(batchData?.timeline) ? (batchData?.timeline as ApiRecord[]) : [];
  const lowerThreshold = typeof batchData?.lower_threshold === 'number' ? batchData.lower_threshold : 2.0;
  const upperThreshold = typeof batchData?.upper_threshold === 'number' ? batchData.upper_threshold : 8.0;

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
        <Button href="/batches">Về danh sách lô</Button>
      </PageHeader>

      <WorkflowProgress current={4} batchId={id} />

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
        <p>Bước tiếp theo: QA xem xét sự cố. Giao diện không kết luận lô đạt/không đạt.</p>
        <div className="actions">
          <Button href="/reports">Xem hồ sơ bằng chứng</Button>
          <Button primary href="/qa">
            Tiếp tục: QA review
          </Button>
        </div>
      </div>
    </>
  );
}

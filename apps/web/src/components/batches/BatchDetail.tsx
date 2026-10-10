'use client';
import { useEffect, useState } from 'react';
import { ApiRecords } from '../ApiRecords';
import { PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { TemperatureChart } from './TemperatureChart';
import { BatchSegmentsCard } from './BatchSegmentsCard';
import { BatchTimelineView } from './BatchTimelineView';
import { readRecords, writeRecord, type ApiRecord } from '../../services/api-client';
import { RoleGate } from '../auth/RoleGate';

const qualityWarning = (rows: unknown[]) =>
  `${rows.length} vấn đề chất lượng dữ liệu từ server cần xem xét. Không nội suy hoặc xóa dữ liệu thiếu.`;

export function BatchDetail({ id }: { id: string }) {
  const path = `batches/${encodeURIComponent(id)}`;
  const [batchData, setBatchData] = useState<ApiRecord | null>(null);
  const [measurements, setMeasurements] = useState<ApiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      readRecords(path, controller.signal).catch(() => []),
      readRecords(`${path}/measurements`, controller.signal).catch(() => []),
    ]).then(([batches, meas]) => {
      if (!controller.signal.aborted) {
        if (batches.length > 0) setBatchData(batches[0]);
        setMeasurements(meas);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [path]);

  const handleGenerateReport = async () => {
    try {
      setGeneratingReport(true);
      await writeRecord(`batches/${encodeURIComponent(id)}/reports`, 'POST');
      window.location.href = '/reports';
    } catch (e) {
      alert('Lỗi khi tạo hồ sơ: ' + (e instanceof Error ? e.message : 'Unknown error'));
      setGeneratingReport(false);
    }
  };

  const segments = Array.isArray(batchData?.segments) ? (batchData?.segments as ApiRecord[]) : [];
  const timeline = Array.isArray(batchData?.timeline) ? (batchData?.timeline as ApiRecord[]) : [];
  const lowerThreshold = typeof batchData?.lower_threshold === 'number' ? batchData.lower_threshold : 2.0;
  const upperThreshold = typeof batchData?.upper_threshold === 'number' ? batchData.upper_threshold : 8.0;

  if (loading) {
    return <p role="status">Đang tải dữ liệu lô từ server…</p>;
  }

  if (!batchData) {
    return (
      <div className="panel">
        <PageHeader title="Không tìm thấy lô hàng" />
        <p style={{ margin: '1rem 0' }}>Lô hàng <strong>{id}</strong> không tồn tại trên hệ thống hoặc bạn không có quyền truy cập.</p>
        <Button href="/batches">Về danh sách lô</Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={id}
        breadcrumb={[{ href: '/batches', label: 'Lô hàng' }, { label: id }]}
        description="Thông tin Shipment, số đo mô phỏng, sự cố và lịch sử QA."
      >
        <RoleGate roles={['QA_REVIEWER', 'ADMIN']}><Button onClick={handleGenerateReport} disabled={generatingReport}>{generatingReport ? 'Đang tạo...' : 'Xuất hồ sơ bằng chứng'}</Button></RoleGate>
        {!measurements.length && <RoleGate roles={['OPERATOR', 'ADMIN']}><Button primary href={`/imports?batchId=${encodeURIComponent(id)}`}>Sinh dữ liệu mô phỏng</Button></RoleGate>}
        <Button href="/batches">Về danh sách lô</Button>
      </PageHeader>

      <Panel title="Cấu hình Shipment và bàn giao đã lưu"><dl>{Object.entries((batchData.context ?? {}) as ApiRecord).filter(([key]) => ['product','origin','destination','start','end','reference','sop'].includes(key)).map(([key,value]) => <div key={key}><dt>{({product:'Sản phẩm',origin:'Điểm xuất phát',destination:'Điểm nhận',start:'Bắt đầu (UTC)',end:'Kết thúc (UTC)',reference:'Vận đơn',sop:'Phiên bản SOP'} as Record<string,string>)[key]}</dt><dd>{String(value)}</dd></div>)}<dt>Bàn giao</dt><dd>{String(((batchData.context as ApiRecord)?.handover as ApiRecord)?.location ?? 'Chưa ghi nhận')}</dd></dl></Panel>
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
        <p>Giao diện không kết luận lô đạt/không đạt.</p>
        <div className="actions">
          <RoleGate roles={['QA_REVIEWER', 'ADMIN']}><Button onClick={handleGenerateReport} disabled={generatingReport}>{generatingReport ? 'Đang tạo...' : 'Xuất hồ sơ bằng chứng'}</Button></RoleGate>
        {!measurements.length && <RoleGate roles={['OPERATOR', 'ADMIN']}><Button primary href={`/imports?batchId=${encodeURIComponent(id)}`}>Sinh dữ liệu mô phỏng</Button></RoleGate>}
          <RoleGate roles={['QA_REVIEWER', 'ADMIN']}>
            <Button primary href="/qa">
              Tiếp tục: QA review
            </Button>
          </RoleGate>
        </div>
      </div>
    </>
  );
}

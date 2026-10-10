'use client';
import { OriginBadge } from '../OriginBadge';
import type { ApiRecord } from '../../services/api-client';

interface BatchSegmentsCardProps {
  segments?: ApiRecord[];
  batchId?: string;
}

export function BatchSegmentsCard({ segments = [], batchId = 'CP-DEMO-001' }: BatchSegmentsCardProps) {
  if (!segments.length) {
    return (
      <section className="panel" aria-label="Danh sách chặng hành trình">
        <h2>Hành trình các chặng (Segments)</h2>
        <p>Chưa có dữ liệu chặng cho lô này.</p>
      </section>
    );
  }

  // Segment metadata mapping for demo CP-DEMO-001
  const segmentMetaMap: Record<string, { title: string; route: string; desc: string; status: 'ok' | 'warning' | 'alert' }> = {
    'LEG-01': {
      title: 'Chặng 1: Xuất phát & Vận chuyển xe lạnh',
      route: 'Kho Nhà máy Bình Dương → Điểm chuyển tiếp QL1A',
      desc: 'Giữ nhiệt độ ổn định 4.5°C – 5.2°C trong suốt hành trình xe container lạnh.',
      status: 'ok',
    },
    'LEG-02': {
      title: 'Chặng 2: Bàn giao trung chuyển (HANDOVER-01)',
      route: 'Sân bãi trung chuyển ngoài trời (Nhiệt độ môi trường 34°C)',
      desc: 'Mở cửa xe kiểm tra hàng. Nhiệt độ vượt ngưỡng lên đỉnh 9.2°C kéo dài 26 phút.',
      status: 'alert',
    },
    'LEG-03': {
      title: 'Chặng 3: Chặng giao cuối & Nhập kho đích',
      route: 'Xe tải lạnh trung chuyển → Bệnh viện Đa khoa Long An',
      desc: 'Hệ thống làm lạnh phục hồi, nhiệt độ hạ về mức 4.8°C – 5.5°C an toàn khi vào kho.',
      status: 'ok',
    },
  };

  return (
    <section className="panel" aria-label="Hành trình các chặng vận chuyển">
      <div className="section-heading">
        <div>
          <h2>Hành trình các chặng (Segments) — {batchId}</h2>
          <p>Mỗi chặng liên kết với thiết bị đo độc lập và có bằng chứng xuất xứ riêng.</p>
        </div>
        <span className="badge">
          Tổng cộng <strong className="number">{segments.length} chặng</strong>
        </span>
      </div>

      <div className="segment-cards-grid">
        {segments.map((seg, index) => {
          const segId = typeof seg.id === 'string' ? seg.id : `LEG-0${index + 1}`;
          const deviceAlias = typeof seg.device_alias === 'string' ? seg.device_alias : 'SENSOR06';
          const handoverId = typeof seg.handover_id === 'string' ? seg.handover_id : null;
          const origin = typeof seg.business_context_origin === 'string' ? seg.business_context_origin : 'SYNTHETIC';
          const meta = segmentMetaMap[segId] ?? {
            title: `Chặng ${index + 1}: ${segId}`,
            route: 'Tuyến vận chuyển lô hàng',
            desc: `Cảm biến ${deviceAlias}`,
            status: 'ok',
          };

          return (
            <div key={segId} className={`segment-card status-${meta.status}`}>
              <div className="segment-card-header">
                <div className="segment-badge-row">
                  <span className="number segment-id">{segId}</span>
                  {handoverId && <span className="badge tone-warning">⚡ {handoverId}</span>}
                  <OriginBadge origin={origin as 'SYNTHETIC' | 'REAL_PUBLIC_DATA' | 'DERIVED'} />
                </div>
                <span className={`segment-status-pill pill-${meta.status}`}>
                  {meta.status === 'alert' ? 'Sự cố phơi nhiệt' : 'Ổn định'}
                </span>
              </div>

              <h3 className="segment-title">{meta.title}</h3>
              <p className="segment-route">📍 {meta.route}</p>
              <p className="segment-desc">{meta.desc}</p>

              <div className="segment-footer">
                <small>
                  Thiết bị: <strong className="number">{deviceAlias}</strong>
                </small>
                {typeof seg.selector === 'string' && (
                  <small className="number selector-tag">{seg.selector}</small>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

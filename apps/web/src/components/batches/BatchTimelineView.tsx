'use client';
import { OriginBadge } from '../OriginBadge';
import type { ApiRecord } from '../../services/api-client';

interface BatchTimelineViewProps {
  timeline?: ApiRecord[];
  batchId?: string;
}

export function BatchTimelineView({ timeline = [], batchId = 'CP-DEMO-001' }: BatchTimelineViewProps) {
  if (!timeline.length) {
    return (
      <section className="panel" aria-label="Dòng thời gian sự kiện">
        <h2>Dòng thời gian sự kiện (Timeline)</h2>
        <p>Chưa có dữ liệu mốc thời gian cho lô này.</p>
      </section>
    );
  }

  const timeFormat = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });

  const getEventMeta = (type: string) => {
    switch (type) {
      case 'SEGMENT_START':
        return { icon: '🚛', label: 'Bắt đầu chặng', tone: 'neutral' };
      case 'HANDOVER':
        return { icon: '🤝', label: 'Điểm bàn giao', tone: 'warning' };
      case 'DOOR_OPEN':
        return { icon: '🚪', label: 'Mở cửa xe', tone: 'warning' };
      case 'EXCURSION_START':
        return { icon: '⚠️', label: 'Bắt đầu vượt ngưỡng', tone: 'danger' };
      case 'EXCURSION_END':
        return { icon: '✅', label: 'Hồi phục dải an toàn', tone: 'success' };
      default:
        return { icon: '📍', label: type, tone: 'neutral' };
    }
  };

  return (
    <section className="panel" aria-label="Dòng sự kiện và mốc chuyển tiếp">
      <div className="section-heading">
        <div>
          <h2>Dòng thời gian sự kiện (Timeline) — {batchId}</h2>
          <p>Truy vết chi tiết từng mốc chuyển tiếp, mở cửa kiểm tra và sự cố nhiệt độ.</p>
        </div>
        <span className="badge">
          Tổng cộng <strong className="number">{timeline.length} sự kiện</strong>
        </span>
      </div>

      <div className="vertical-timeline">
        {timeline.map((item, idx) => {
          const eventType = typeof item.event_type === 'string' ? item.event_type : 'EVENT';
          const meta = getEventMeta(eventType);
          const timeStr = typeof item.timestamp === 'string' ? item.timestamp : '';
          const date = timeStr ? new Date(timeStr) : null;
          const detail = typeof item.detail === 'string' ? item.detail : 'Mốc ghi nhận';
          const device = typeof item.device_alias === 'string' ? item.device_alias : null;
          const origin = typeof item.business_context_origin === 'string' ? item.business_context_origin : 'SYNTHETIC';

          return (
            <div key={typeof item.id === 'string' ? item.id : idx} className={`timeline-row tone-${meta.tone}`}>
              <div className="timeline-node">
                <span className="timeline-icon" aria-hidden="true">{meta.icon}</span>
                {idx < timeline.length - 1 && <div className="timeline-connector" />}
              </div>

              <div className="timeline-body">
                <div className="timeline-header">
                  <div className="timeline-type-row">
                    <span className={`badge tone-${meta.tone}`}>{meta.label}</span>
                    {device && <span className="number timeline-device">Thiết bị: {device}</span>}
                    <OriginBadge origin={origin as 'SYNTHETIC' | 'REAL_PUBLIC_DATA' | 'DERIVED'} />
                  </div>
                  {date && (
                    <time dateTime={timeStr} className="number timeline-time">
                      {timeFormat.format(date)}
                    </time>
                  )}
                </div>

                <p className="timeline-detail">{detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

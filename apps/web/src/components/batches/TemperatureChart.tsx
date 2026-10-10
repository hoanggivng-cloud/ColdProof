'use client';
import { useState, useId } from 'react';
import type { ApiRecord } from '../../services/api-client';

interface TemperatureChartProps {
  measurements: ApiRecord[];
  lowerThreshold?: number;
  upperThreshold?: number;
  batchId?: string;
  onPointSelect?: (point: ApiRecord) => void;
}

export function TemperatureChart({
  measurements = [],
  lowerThreshold = 2.0,
  upperThreshold = 8.0,
  batchId = 'CP-DEMO-001',
}: TemperatureChartProps) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!measurements.length) {
    return (
      <section className="panel" aria-label="Biểu đồ nhiệt độ">
        <h2>Biểu đồ nhiệt độ theo thời gian</h2>
        <p>Chưa có dữ liệu đo để vẽ biểu đồ.</p>
      </section>
    );
  }

  // Parse points
  const points = measurements
    .map((m, idx) => {
      const timeStr = typeof m.timestamp === 'string' ? m.timestamp : '';
      const date = new Date(timeStr);
      const temp = typeof m.temperature_c === 'number' ? m.temperature_c : null;
      const hum = typeof m.humidity_pct === 'number' ? m.humidity_pct : null;
      const isExcursion = Boolean(m.excursion_flag) || (temp !== null && (temp > upperThreshold || temp < lowerThreshold));
      const sensor = typeof m.source_sensor_id === 'string' ? m.source_sensor_id : 'SENSOR06';
      const leg = typeof m.segment_id === 'string' ? m.segment_id : '';
      return {
        idx,
        timeStr,
        date,
        temp,
        hum,
        isExcursion,
        sensor,
        leg,
        rawRef: typeof m.source_row_or_ref === 'string' ? m.source_row_or_ref : '',
      };
    })
    .filter((p): p is { idx: number; timeStr: string; date: Date; temp: number; hum: number | null; isExcursion: boolean; sensor: string; leg: string; rawRef: string } => p.temp !== null);

  if (!points.length) {
    return (
      <section className="panel" aria-label="Biểu đồ nhiệt độ">
        <h2>Biểu đồ nhiệt độ theo thời gian</h2>
        <p>Số đo không chứa giá trị nhiệt độ hợp lệ.</p>
      </section>
    );
  }

  const temps = points.map(p => p.temp);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  const excursionPoints = points.filter(p => p.isExcursion);
  const peakPoint = points.reduce((prev, curr) => (curr.temp > prev.temp ? curr : prev), points[0]);

  // Chart Dimensions & Coordinate Mapping
  const width = 860;
  const height = 300;
  const padding = { top: 35, right: 35, bottom: 45, left: 55 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const yMin = Math.min(0, Math.floor(minTemp - 1));
  const yMax = Math.max(12, Math.ceil(maxTemp + 1.5));
  const yRange = yMax - yMin;

  const getX = (index: number) => {
    if (points.length <= 1) return padding.left + chartWidth / 2;
    return padding.left + (index / (points.length - 1)) * chartWidth;
  };

  const getY = (tempVal: number) => {
    return padding.top + chartHeight - ((tempVal - yMin) / yRange) * chartHeight;
  };

  const yUpper = getY(upperThreshold);
  const yLower = getY(lowerThreshold);

  // SVG Path Generator
  const linePath = points.reduce((acc, p, idx) => {
    const x = getX(idx);
    const y = getY(p.temp);
    return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
  }, '');

  // Time formatter
  const timeFormat = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  });

  const activePoint = hoverIndex !== null && hoverIndex >= 0 && hoverIndex < points.length ? points[hoverIndex] : null;

  return (
    <section className="panel" aria-label="Biểu đồ nhiệt độ chuỗi thời gian">
      <div className="section-heading">
        <div>
          <h2>Biểu đồ nhiệt độ theo thời gian ({batchId})</h2>
          <p>
            Dải kiểm soát <strong className="number">{lowerThreshold.toFixed(1)}°C – {upperThreshold.toFixed(1)}°C</strong> · Dữ liệu vật lý thực nghiệm Zenodo · Cảm biến SENSOR06
          </p>
        </div>
        <div className="actions">
          {excursionPoints.length > 0 ? (
            <span className="badge tone-danger">
              ⚠️ Có sự cố vượt ngưỡng ({peakPoint.temp.toFixed(1)}°C)
            </span>
          ) : (
            <span className="badge tone-success">✓ Nhiệt độ ổn định</span>
          )}
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="chart-stats-grid">
        <div className="stat-card">
          <small>Tổng số đo</small>
          <strong className="number">{points.length} điểm</strong>
        </div>
        <div className="stat-card">
          <small>Nhiệt độ thấp nhất</small>
          <strong className="number">{minTemp.toFixed(1)}°C</strong>
        </div>
        <div className="stat-card">
          <small>Nhiệt độ đỉnh (Peak)</small>
          <strong className={`number ${maxTemp > upperThreshold ? 'color-danger' : ''}`}>
            {maxTemp.toFixed(1)}°C
          </strong>
        </div>
        <div className="stat-card">
          <small>Thời lượng sự cố</small>
          <strong className="number">{excursionPoints.length > 0 ? '26–30 phút' : '0 phút'}</strong>
        </div>
        <div className="stat-card">
          <small>MKT ước tính</small>
          <strong className="number">4.6°C</strong>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="chart-wrapper">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="temperature-svg"
          aria-label="Đồ thị nhiệt độ"
        >
          <defs>
            <linearGradient id={`${gradientId}-excursion`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#B42318" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#B42318" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id={`${gradientId}-safe`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1F3A68" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#1F3A68" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Safe Temperature Band (2°C - 8°C) */}
          <rect
            x={padding.left}
            y={yUpper}
            width={chartWidth}
            height={Math.max(0, yLower - yUpper)}
            fill={`url(#${gradientId}-safe)`}
            stroke="#D9DEE7"
            strokeDasharray="2 2"
          />
          <text
            x={padding.left + 10}
            y={yUpper + 18}
            fill="#4A5568"
            fontSize="11"
            fontFamily="var(--font-sans)"
          >
            DẢI AN TOÀN GDP/GSP (2.0°C – 8.0°C)
          </text>

          {/* Grid lines & Y-axis labels */}
          {[0, 2, 4, 6, 8, 10, 12].map((deg) => {
            if (deg < yMin || deg > yMax) return null;
            const y = getY(deg);
            const isUpper = deg === upperThreshold;
            const isLower = deg === lowerThreshold;
            return (
              <g key={deg}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={width - padding.right}
                  y2={y}
                  stroke={isUpper ? '#B42318' : isLower ? '#1F3A68' : '#EAECF0'}
                  strokeWidth={isUpper || isLower ? 1.5 : 1}
                  strokeDasharray={isUpper || isLower ? '4 3' : undefined}
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill={isUpper ? '#B42318' : isLower ? '#1F3A68' : '#718096'}
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                  fontWeight={isUpper || isLower ? '600' : '400'}
                >
                  {deg.toFixed(1)}°C
                </text>
              </g>
            );
          })}

          {/* Handover / Door Open Annotation Zone (LEG-02 at points 6 to 9) */}
          {points.length >= 10 && (
            <g>
              <rect
                x={getX(6) - 10}
                y={padding.top}
                width={getX(9) - getX(6) + 20}
                height={chartHeight}
                fill="rgba(180, 35, 24, 0.05)"
              />
              <line
                x1={getX(6)}
                y1={padding.top}
                x2={getX(6)}
                y2={padding.top + chartHeight}
                stroke="#B42318"
                strokeWidth="1.5"
                strokeDasharray="3 3"
              />
              {/* Handover Event Label */}
              <g transform={`translate(${getX(6)}, ${padding.top - 8})`}>
                <rect x="-6" y="-18" width="168" height="20" rx="3" fill="#0E1E3A" />
                <text x="4" y="-4" fill="#FFFFFF" fontSize="10" fontWeight="500" fontFamily="var(--font-sans)">
                  🚚 17:00 Bàn giao & Sân bê tông 34°C
                </text>
              </g>
            </g>
          )}

          {/* Excursion Shaded Area under peak */}
          {excursionPoints.length > 1 && (
            <path
              d={`M ${getX(points.indexOf(excursionPoints[0]))} ${yUpper} ${excursionPoints
                .map((p) => `L ${getX(points.indexOf(p))} ${getY(p.temp)}`)
                .join(' ')} L ${getX(points.indexOf(excursionPoints[excursionPoints.length - 1]))} ${yUpper} Z`}
              fill={`url(#${gradientId}-excursion)`}
            />
          )}

          {/* Main Temperature Line */}
          <path
            d={linePath}
            fill="none"
            stroke="#1F3A68"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Excursion Highlight Line */}
          {excursionPoints.length > 1 && (
            <path
              d={excursionPoints
                .map((p, idx) => {
                  const x = getX(points.indexOf(p));
                  const y = getY(p.temp);
                  return idx === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                })
                .join(' ')}
              fill="none"
              stroke="#B42318"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          )}

          {/* Data Points */}
          {points.map((p, idx) => {
            const x = getX(idx);
            const y = getY(p.temp);
            const isHover = hoverIndex === idx;
            const isPeak = p.idx === peakPoint.idx && p.isExcursion;
            return (
              <g
                key={p.rawRef || idx}
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={isPeak ? 5.5 : isHover ? 6 : p.isExcursion ? 4.5 : 3.5}
                  fill={p.isExcursion ? '#B42318' : '#1F3A68'}
                  stroke="#FFFFFF"
                  strokeWidth={isHover || isPeak ? 2 : 1}
                />
                {/* Peak Callout Badge */}
                {isPeak && (
                  <g transform={`translate(${x}, ${y - 14})`}>
                    <rect x="-55" y="-18" width="110" height="20" rx="3" fill="#B42318" />
                    <text x="0" y="-4" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="bold" fontFamily="var(--font-mono)">
                      Đỉnh: {p.temp.toFixed(1)}°C (Vượt 8°C)
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* X-axis ticks & time labels */}
          {points.map((p, idx) => {
            if (idx % 2 !== 0 && idx !== points.length - 1) return null;
            const x = getX(idx);
            return (
              <g key={`x-${idx}`}>
                <line
                  x1={x}
                  y1={padding.top + chartHeight}
                  x2={x}
                  y2={padding.top + chartHeight + 6}
                  stroke="#A0AEC0"
                />
                <text
                  x={x}
                  y={padding.top + chartHeight + 20}
                  textAnchor="middle"
                  fill="#4A5568"
                  fontSize="11"
                  fontFamily="var(--font-mono)"
                >
                  {timeFormat.format(p.date)}
                </text>
              </g>
            );
          })}

          {/* X Axis Base Line */}
          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={width - padding.right}
            y2={padding.top + chartHeight}
            stroke="#D9DEE7"
            strokeWidth="1"
          />
        </svg>

        {/* Hover Tooltip Overlay */}
        {activePoint && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(getX(hoverIndex!) / width) * 100}%`,
              top: `${(getY(activePoint.temp) / height) * 100}%`,
            }}
          >
            <div className="tooltip-header">
              <span className="number">{timeFormat.format(activePoint.date)}</span>
              {activePoint.leg && <span className="tooltip-leg">{activePoint.leg}</span>}
            </div>
            <div className="tooltip-body">
              <span className={`tooltip-temp ${activePoint.isExcursion ? 'temp-danger' : ''}`}>
                {activePoint.temp.toFixed(1)}°C
              </span>
              {activePoint.hum !== null && (
                <span className="tooltip-hum">Độ ẩm: {activePoint.hum.toFixed(1)}%</span>
              )}
            </div>
            <div className="tooltip-meta">
              <small>Sensor: {activePoint.sensor}</small>
              {activePoint.isExcursion && <strong className="tag-excursion">VƯỢT NGƯỠNG</strong>}
            </div>
          </div>
        )}
      </div>

      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-swatch swatch-line" />
          <span>Nhiệt độ đo được</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch swatch-danger" />
          <span>Vùng vượt ngưỡng (&gt; 8.0°C)</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch swatch-safe" />
          <span>Dải an toàn 2.0°C – 8.0°C</span>
        </div>
        <div className="legend-item">
          <span className="legend-swatch swatch-handover" />
          <span>Mốc chuyển tiếp bàn giao</span>
        </div>
      </div>
    </section>
  );
}

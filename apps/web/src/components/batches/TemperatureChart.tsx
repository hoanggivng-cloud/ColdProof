'use client';
import type { ApiRecord } from '../../services/api-client';
export function TemperatureChart({ measurements = [], lowerThreshold = 2, upperThreshold = 8, batchId = '' }: { measurements: ApiRecord[]; lowerThreshold?: number; upperThreshold?: number; batchId?: string; onPointSelect?: (point: ApiRecord) => void }) {
  const points = measurements.filter(m => typeof m.temperature_c === 'number' && typeof m.timestamp === 'string' && Number.isFinite(Date.parse(m.timestamp)));
  if (!points.length) return <section className="panel"><h2>Biểu đồ nhiệt độ</h2><p>Chưa có số đo. Sinh dữ liệu mô phỏng để xem biểu đồ.</p></section>;
  const times = points.map(m => Date.parse(String(m.timestamp))), temps = points.map(m => Number(m.temperature_c));
  const start = Math.min(...times), end = Math.max(...times), low = Math.min(lowerThreshold - 1, ...temps), high = Math.max(upperThreshold + 1, ...temps);
  const x = (m: ApiRecord) => 55 + (Date.parse(String(m.timestamp)) - start) / Math.max(1, end - start) * 760;
  const y = (t: number) => 250 - (t - low) / Math.max(1, high - low) * 210;
  const sensors = [...new Set(points.map(m => String(m.source_sensor_id)))];
  const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
  return <section className="panel"><h2>Biểu đồ nhiệt độ — {batchId}</h2><p>{points.every(m => m.measurement_origin === 'SYNTHETIC') ? 'Dữ liệu mô phỏng' : 'Nguồn dữ liệu theo từng số đo'} · Ngưỡng {lowerThreshold}–{upperThreshold}°C · {points.length} số đo</p><p>Thấp nhất {Math.min(...temps)}°C · Cao nhất {Math.max(...temps)}°C. Các chuỗi thiết bị được giữ riêng; không nối qua khoảng trống.</p>
    <svg viewBox="0 0 860 300" role="img" aria-label="Biểu đồ chuỗi nhiệt độ từng thiết bị">
      <rect x={55} y={y(upperThreshold)} width={760} height={y(lowerThreshold)-y(upperThreshold)} fill="var(--color-border)" opacity={.35} />
      {[lowerThreshold, upperThreshold].map(t => <g key={t}><line x1={55} x2={815} y1={y(t)} y2={y(t)} stroke="var(--color-text-muted)" strokeDasharray="4 3" /><text x={4} y={y(t)} fontSize={12}>{t}°C</text></g>)}
      {sensors.map((sensor, index) => { const rows = points.filter(m => String(m.source_sensor_id) === sensor).sort((a,b) => Date.parse(String(a.timestamp))-Date.parse(String(b.timestamp))); const deltas = rows.slice(1).map((m,i) => Date.parse(String(m.timestamp))-Date.parse(String(rows[i].timestamp))).filter(d => d > 0).sort((a,b)=>a-b); const cadence = deltas[Math.floor(deltas.length / 2)] ?? Infinity; const path = rows.map((m,i) => `${i === 0 || Date.parse(String(m.timestamp))-Date.parse(String(rows[i-1].timestamp)) > cadence * 1.5 ? 'M' : 'L'} ${x(m)} ${y(Number(m.temperature_c))}`).join(' '); return <g key={sensor}><path d={path} fill="none" stroke="var(--color-text-muted)" strokeWidth={2} strokeDasharray={index % 2 ? '6 3' : undefined} />{rows.map(m => <circle key={String(m.record_id)} cx={x(m)} cy={y(Number(m.temperature_c))} r={3} fill={m.excursion_flag ? 'var(--color-danger)' : 'var(--color-accent)'}><title>{sensor} · {time.format(new Date(String(m.timestamp)))} · {String(m.temperature_c)}°C</title></circle>)}</g>; })}
      <text x={55} y={280} fontSize={12}>{time.format(new Date(start))}</text><text x={760} y={280} fontSize={12}>{time.format(new Date(end))}</text>
    </svg><p>Thiết bị: {sensors.join(' · ')}. Điểm đỏ: số đo được backend đánh dấu vượt ngưỡng.</p>
  </section>;
}

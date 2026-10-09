import type { BatchInfo, BatchMeasurement } from '../../types/batch-detail';

const W = 1000, H = 320, M = { top: 28, right: 24, bottom: 40, left: 52 };
const hhmm = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short' });
const dashes = ['', '6 4', '2 3', '8 3 2 3'];
interface Point { t: number; v: number; excursion: boolean; segment: string | null; id: string }

const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0; };

/**
 * Drawing rules only (no data-quality verdicts): a line is broken at missing/blank readings, at gaps longer than
 * twice the sensor's median sampling interval, and when the next reading belongs to a segment with a different source.
 * Red marks follow the server's excursion_flag and EXCURSION_START/END events.
 */
function runs(rows: BatchMeasurement[], sourceOf: (segment: string | null) => string | null): Point[][] {
  const sorted = rows.filter(row => row.timestamp && Number.isFinite(Date.parse(row.timestamp))).sort((a, b) => Date.parse(a.timestamp!) - Date.parse(b.timestamp!));
  const times = sorted.filter(row => !row.missing && row.temperature_c !== null).map(row => Date.parse(row.timestamp!));
  const step = median(times.slice(1).map((time, index) => time - times[index]));
  const result: Point[][] = [];
  let current: Point[] = [];
  for (const row of sorted) {
    if (row.missing || row.temperature_c === null) { if (current.length) result.push(current); current = []; continue; }
    const point = { t: Date.parse(row.timestamp!), v: row.temperature_c, excursion: row.excursion, segment: row.segment_id, id: row.record_id };
    const previous = current[current.length - 1];
    const gap = previous && step > 0 && point.t - previous.t > step * 2;
    const sourceChange = previous && previous.segment !== point.segment && sourceOf(previous.segment) !== sourceOf(point.segment);
    if (previous && (gap || sourceChange)) { result.push(current); current = []; }
    current.push(point);
  }
  if (current.length) result.push(current);
  return result;
}

export function TemperatureChart({ batch, measurements }: { batch: BatchInfo; measurements: BatchMeasurement[] }) {
  const sources = new Map(batch.segments.map(item => [item.id, item.source_id]));
  const sensors = [...new Set(measurements.map(row => row.sensor))];
  const series = sensors.map(sensor => ({ sensor, runs: runs(measurements.filter(row => row.sensor === sensor), segment => (segment ? sources.get(segment) ?? null : null)) }));
  const points = series.flatMap(item => item.runs.flat());
  if (!points.length) return <p>Chưa có số đo có giá trị để vẽ biểu đồ.</p>;
  const handovers = batch.timeline.filter(item => item.event_type === 'HANDOVER');
  const starts = batch.timeline.filter(item => item.event_type === 'EXCURSION_START');
  const bands = starts.map(start => ({ start: Date.parse(start.timestamp), end: Date.parse(batch.timeline.find(item => item.event_type === 'EXCURSION_END' && Date.parse(item.timestamp) >= Date.parse(start.timestamp))?.timestamp ?? start.timestamp) }));
  const times = [...points.map(point => point.t), ...handovers.map(item => Date.parse(item.timestamp))];
  const t0 = Math.min(...times), t1 = Math.max(...times);
  const values = [...points.map(point => point.v), ...(batch.lower !== null ? [batch.lower] : []), ...(batch.upper !== null ? [batch.upper] : [])];
  const v0 = Math.floor(Math.min(...values) - 1), v1 = Math.ceil(Math.max(...values) + 1);
  const x = (t: number) => M.left + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - v0) / (v1 - v0 || 1)) * (H - M.top - M.bottom);
  const yTicks = Array.from({ length: 5 }, (_, index) => v0 + ((v1 - v0) * index) / 4);
  const xTicks = Array.from({ length: 6 }, (_, index) => t0 + ((t1 - t0) * index) / 5);
  const path = (run: Point[]) => run.map((point, index) => `${index ? 'L' : 'M'}${x(point.t).toFixed(1)},${y(point.v).toFixed(1)}`).join(' ');
  const flagged = points.filter(point => point.excursion).length;
  const summary = `Biểu đồ nhiệt độ lô ${batch.id}: ${sensors.length} cảm biến, ${points.length} số đo có giá trị, ${flagged} số đo server đánh dấu vượt ngưỡng, ${handovers.length} mốc bàn giao.`;
  return <figure className="chart">
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="chart-title chart-desc" className="chart-svg">
        <title id="chart-title">Nhiệt độ theo thời gian</title>
        <desc id="chart-desc">{summary}</desc>
        {bands.map(band => <rect key={band.start} className="chart-band" x={x(band.start)} y={M.top} width={Math.max(2, x(band.end) - x(band.start))} height={H - M.top - M.bottom} />)}
        {yTicks.map(tick => <g key={tick}><line className="chart-grid" x1={M.left} x2={W - M.right} y1={y(tick)} y2={y(tick)} /><text className="chart-label" x={M.left - 8} y={y(tick) + 4} textAnchor="end">{tick.toFixed(1)}</text></g>)}
        {xTicks.map(tick => <text key={tick} className="chart-label" x={x(tick)} y={H - M.bottom + 18} textAnchor="middle">{hhmm.format(new Date(tick))}</text>)}
        <line className="chart-axis" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
        {batch.upper !== null && <g><line className="chart-threshold" x1={M.left} x2={W - M.right} y1={y(batch.upper)} y2={y(batch.upper)} /><text className="chart-label" x={W - M.right} y={y(batch.upper) - 6} textAnchor="end">Ngưỡng trên {batch.upper}°C</text></g>}
        {batch.lower !== null && <g><line className="chart-threshold" x1={M.left} x2={W - M.right} y1={y(batch.lower)} y2={y(batch.lower)} /><text className="chart-label" x={W - M.right} y={y(batch.lower) + 16} textAnchor="end">Ngưỡng dưới {batch.lower}°C</text></g>}
        {handovers.map(item => <g key={item.id}><line className="chart-handover" x1={x(Date.parse(item.timestamp))} x2={x(Date.parse(item.timestamp))} y1={M.top - 8} y2={H - M.bottom} /><text className="chart-label chart-handover-label" x={x(Date.parse(item.timestamp)) + 4} y={M.top - 12}>{item.handover_id ?? 'Bàn giao'}</text></g>)}
        {series.map((item, index) => <g key={item.sensor}>
          {item.runs.map(run => <path key={run[0].id} className="chart-line" strokeDasharray={dashes[index % dashes.length] || undefined} d={path(run)} />)}
          {item.runs.flatMap(run => run.slice(1).map((point, i) => run[i].excursion && point.excursion ? <path key={`x-${point.id}`} className="chart-line chart-line-excursion" d={path([run[i], point])} /> : null))}
          {item.runs.flat().map(point => <circle key={point.id} className={point.excursion ? 'chart-point chart-point-excursion' : 'chart-point'} cx={x(point.t)} cy={y(point.v)} r={point.excursion ? 4 : 3}><title>{`${item.sensor} · ${hhmm.format(new Date(point.t))} · ${point.v}°C${point.excursion ? ' · server đánh dấu vượt ngưỡng' : ''}`}</title></circle>)}
        </g>)}
      </svg>
    </div>
    <figcaption>
      <ul className="chart-legend">
        {series.map((item, index) => <li key={item.sensor}><svg width="28" height="10" aria-hidden="true"><line className="chart-line" x1="0" x2="28" y1="5" y2="5" strokeDasharray={dashes[index % dashes.length] || undefined} /></svg><span className="number">{item.sensor}</span></li>)}
        <li><svg width="28" height="10" aria-hidden="true"><line className="chart-line chart-line-excursion" x1="0" x2="28" y1="5" y2="5" /></svg>Server đánh dấu vượt ngưỡng</li>
        <li><svg width="28" height="10" aria-hidden="true"><line className="chart-threshold" x1="0" x2="28" y1="5" y2="5" /></svg>Ngưỡng profile</li>
        <li><svg width="12" height="14" aria-hidden="true"><line className="chart-handover" x1="6" x2="6" y1="0" y2="14" /></svg>Mốc bàn giao</li>
      </ul>
      <p>Ngày <span className="number">{day.format(new Date(t0))}</span>, giờ UTC+7. Đường bị ngắt khi thiếu số đo, khi hai số đo cách nhau quá 2 lần chu kỳ lấy mẫu, hoặc khi sang chặng khác nguồn; không nội suy. Mỗi cảm biến là một đường riêng.</p>
    </figcaption>
  </figure>;
}

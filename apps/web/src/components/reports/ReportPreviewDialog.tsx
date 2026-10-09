'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { MeasurementOrigin } from '@coldproof/canonical-schema';
import { getReportContext } from '../../services/reports';
import type { EvidenceReport, ReportContext } from '../../types/reports';
import { OriginBadge } from '../OriginBadge';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { formatTime, shortHash } from './format';

const origins: MeasurementOrigin[] = ['REAL_PUBLIC_DATA', 'DERIVED', 'SYNTHETIC'];
const isOrigin = (value: string | null): value is MeasurementOrigin => origins.some(origin => origin === value);
const missing = 'Chưa có';

export function ReportPreviewDialog({ report, focus, onClose }: { report: EvidenceReport; focus: 'summary' | 'audit'; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const auditSection = useRef<HTMLElement>(null);
  const [state, setState] = useState<{ context: ReportContext | null; loading: boolean; error: string }>({ context: null, loading: true, error: '' });
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    node?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { node?.close(); document.body.style.overflow = oldOverflow; if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => { const controller = new AbortController(); getReportContext(report, controller.signal).then(context => { if (!controller.signal.aborted) setState({ context, loading: false, error: '' }); }).catch((error: unknown) => { if (!controller.signal.aborted) setState({ context: null, loading: false, error: error instanceof Error ? error.message : 'Không tải được dữ liệu liên quan của hồ sơ.' }); }); return () => controller.abort(); }, [report]);
  useEffect(() => { if (focus === 'audit' && !state.loading) auditSection.current?.scrollIntoView({ block: 'start' }); }, [focus, state.loading]);
  const code = report.report_code ?? report.id;
  const context = state.context;
  const origin = context?.origin ?? null;
  const pending = state.loading ? <p role="status">Đang tải dữ liệu lô…</p> : state.error ? <Alert tone="error">{state.error}</Alert> : null;
  const thresholds = context && context.lower !== null && context.upper !== null ?`${context.lower}°C – ${context.upper}°C` : missing;
  return <dialog ref={dialog} className="logger-dialog report-dialog" aria-labelledby="report-title" aria-describedby="report-description" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="logger-heading"><div><h2 id="report-title">Hồ sơ {code}</h2><div className="actions"><span className="report-version number">v{report.version}</span>{isOrigin(origin) ? <OriginBadge origin={origin} /> : origin && <span className="badge">{origin}</span>}</div><p id="report-description">Metadata và gói bằng chứng do server trả về. Không kết luận lô đạt/không đạt.</p></div><Button onClick={onClose} aria-label="Đóng hộp thoại">Đóng</Button></div>
    <div className="report-body">
      <div className="report-summary"><div><small>Mã lô</small><strong><Link href={`/batches/${encodeURIComponent(report.batch_id)}`}>{report.batch_id}</Link></strong></div><div><small>Profile</small><strong>{report.profile_id ?? missing}</strong></div><div><small>SHA-256</small><strong title={report.checksum_sha256}>{shortHash(report.checksum_sha256)}</strong></div></div>
      <section><h3>1. Ngưỡng nhiệt và sự cố của lô</h3>{pending ?? <dl className="report-meta"><div><dt>Ngưỡng profile</dt><dd className="number">{thresholds}</dd></div><div><dt>Sự cố từ server</dt><dd className="number">{context?.exceptions ?? missing}</dd></div><div><dt>Vấn đề chất lượng dữ liệu</dt><dd className="number">{context?.quality_issues ?? missing}</dd></div></dl>}<p>Số liệu lấy từ API của lô; giao diện không tự tính nhiệt độ hay sự cố. <Link href={`/batches/${encodeURIComponent(report.batch_id)}`}>Xem chi tiết lô</Link></p></section>
      <section><h3>2. Thông tin hồ sơ</h3><dl className="report-meta"><div><dt>Mã hồ sơ</dt><dd className="number">{code}</dd></div><div><dt>ID server</dt><dd className="number">{report.id}</dd></div><div><dt>Kịch bản</dt><dd>{report.scenario_id ?? missing}</dd></div><div><dt>Tạo lúc (UTC+7)</dt><dd className="number">{formatTime(report.created_at)}</dd></div><div><dt>Người tạo</dt><dd>{report.generated_by ?? missing}</dd></div><div><dt>SHA-256</dt><dd className="number">{report.checksum_sha256}</dd></div><div><dt>Chặng</dt><dd className="number">{report.segments.join(', ') || missing}</dd></div><div><dt>Nguồn dữ liệu</dt><dd className="number">{report.source_assets.join(', ') || missing}</dd></div><div><dt>Parser</dt><dd className="number">{report.parser_versions.join(', ') || missing}</dd></div></dl><Alert>SHA-256 hiển thị đúng như server trả về; giao diện chưa tính lại để đối chiếu.</Alert>{report.disclaimer && <Alert title="Ghi chú từ server">{report.disclaimer}</Alert>}</section>
      <section ref={auditSection} aria-labelledby="report-audit-title"><h3 id="report-audit-title">3. Nhật ký audit</h3>{pending ?? (!context?.audit.length ? <p>Chưa có sự kiện audit gắn với hồ sơ này.</p> : <div className="table-scroll"><table><thead><tr>{['Thời gian (UTC+7)', 'Hành động', 'Đối tượng', 'Người thực hiện'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{context.audit.map(entry => <tr key={entry.id}><td className="number">{formatTime(entry.created_at)}</td><td>{entry.action}</td><td>{entry.entity_type}</td><td className="number">{entry.actor_id ?? 'Hệ thống'}</td></tr>)}</tbody></table></div>)}</section>
    </div>
    <div className="logger-footer"><p>Xuất PDF chưa có trên server. Gói tải về là JSON từ endpoint download.</p><div className="actions"><Button onClick={onClose}>Đóng</Button><a className="button button-primary" href={`/api/backend/reports/${encodeURIComponent(report.id)}/download`} download={`${code}.json`}>Tải gói bằng chứng JSON</a></div></div>
  </dialog>;
}

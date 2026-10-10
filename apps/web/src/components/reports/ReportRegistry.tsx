'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getReports, reportsCSV } from '../../services/reports';
import type { EvidenceReport } from '../../types/reports';
import { PageHeader } from '../layout/PageHeader';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { ReportPreviewDialog } from './ReportPreviewDialog';
import { WorkflowProgress } from '../shipment/ShipmentWorkflow';
import { formatTime, shortHash } from './format';
const pageSizes = [10, 25, 50];
function pageList(count: number, current: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index);
  const pages = [...new Set([0, current - 1, current, current + 1, count - 1])].filter(value => value >= 0 && value < count).sort((a, b) => a - b);
  return pages.flatMap((value, index) => index > 0 && value - pages[index - 1] > 1 ? [null, value] : [value]);
}
export function ReportRegistry() {
  const [state, setState] = useState<{ data: EvidenceReport[] | null; loading: boolean; error: string; loadedAt: string }>({ data: null, loading: true, error: '', loadedAt: '' });
  const [attempt, setAttempt] = useState(0), [query, setQuery] = useState(''), [batch, setBatch] = useState(''), [profile, setProfile] = useState('');
  const [tab, setTab] = useState('all'), [selected, setSelected] = useState<string[]>([]), [page, setPage] = useState(0), [pageSize, setPageSize] = useState(pageSizes[0]);
  const [preview, setPreview] = useState<{ report: EvidenceReport; focus: 'summary' | 'audit' } | null>(null);
  const selectAll = useRef<HTMLInputElement>(null), search = useRef<HTMLInputElement>(null);
  useEffect(() => { const controller = new AbortController(); getReports(controller.signal).then(data => { if (!controller.signal.aborted) setState({ data, loading: false, error: '', loadedAt: formatTime(new Date().toISOString()) }); }).catch((error: unknown) => { if (!controller.signal.aborted) setState({ data: null, loading: false, error: error instanceof Error ? error.message : 'Không tải được danh sách hồ sơ.', loadedAt: '' }); }); return () => controller.abort(); }, [attempt]);
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); search.current?.focus(); } }; window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut); }, []);
  const data = state.data;
  const filtered = (data ?? []).filter(row => (!query || `${row.id} ${row.report_code ?? ''} ${row.batch_id} ${row.profile_id ?? ''} ${row.scenario_id ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) && (!batch || row.batch_id === batch) && (!profile || row.profile_id === profile));
  const rows = filtered.filter(row => tab === 'all' || selected.includes(row.id));
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const shown = rows.slice(page * pageSize, page * pageSize + pageSize);
  const allChecked = shown.length > 0 && shown.every(row => selected.includes(row.id));
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = !allChecked && shown.some(row => selected.includes(row.id)); }, [shown, selected, allChecked]);
  const reload = () => { setState({ data: null, loading: true, error: '', loadedAt: '' }); setSelected([]); setPage(0); setAttempt(value => value + 1); };
  const changeTab = (value: string) => { setTab(value); setPage(0); };
  const reset = () => { setQuery(''); setBatch(''); setProfile(''); changeTab('all'); };
  const exportRows = () => { const values = rows.filter(row => !selected.length || selected.includes(row.id)); const url = URL.createObjectURL(new Blob([reportsCSV(values)], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'coldproof-reports.csv'; anchor.click(); URL.revokeObjectURL(url); };
  const distinct = (values: (string | null)[]) => [...new Set(values.filter((value): value is string => Boolean(value)))];
  const meta = data ? [<><strong className="number">{data.length}</strong> hồ sơ</>, <><strong className="number">{distinct(data.map(row => row.batch_id)).length}</strong> lô</>, <><strong className="number">{distinct(data.flatMap(row => row.source_assets)).length}</strong> nguồn dữ liệu</>, <>Tải lúc <strong className="number">{state.loadedAt}</strong> (UTC+7)</>] : undefined;
  const tabs: [string, string, number][] = [['all', 'Tất cả hồ sơ', filtered.length], ['selected', 'Đã chọn', filtered.filter(row => selected.includes(row.id)).length]];
  return <><PageHeader title="Hồ sơ bằng chứng" description="Metadata hồ sơ, provenance và mã SHA-256 do server lưu." meta={meta}><Button disabled={!rows.length} onClick={exportRows}>Xuất danh sách CSV</Button><Button primary disabled={state.loading} onClick={reload}>Làm mới danh sách</Button></PageHeader>
    <WorkflowProgress current={5} />
    <Alert title="Chế độ đọc">Chưa nối tạo hồ sơ mới, ký duyệt QA hoặc xuất PDF. SHA-256 hiển thị đúng như server trả về; giao diện chưa tính lại để đối chiếu.</Alert>
    <section className="report-registry" aria-label="Danh sách hồ sơ">
      <div className="report-tabs-row"><div className="report-tabs" aria-label="Nhóm hồ sơ">{tabs.map(([value, label, count]) => <button key={value} type="button" className="report-tab" aria-pressed={tab === value} onClick={() => changeTab(value)}>{label}<span className="report-count number">{count}</span></button>)}</div><p className="report-showing">Hiển thị {shown.length} / {rows.length} hồ sơ</p></div>
      <div className="report-filters">
        <div className="report-search"><input ref={search} aria-label="Tìm hồ sơ" aria-keyshortcuts="Control+k Meta+k" placeholder="Tìm mã hồ sơ, mã lô, profile…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /><kbd>Ctrl / ⌘ K</kbd></div>
        <select aria-label="Lọc mã lô" value={batch} onChange={event => { setBatch(event.target.value); setPage(0); }}><option value="">Mã lô: tất cả</option>{distinct(data?.map(row => row.batch_id) ?? []).map(value => <option key={value} value={value}>{value}</option>)}</select>
        <select aria-label="Lọc profile" value={profile} onChange={event => { setProfile(event.target.value); setPage(0); }}><option value="">Profile: tất cả</option>{distinct(data?.map(row => row.profile_id) ?? []).map(value => <option key={value} value={value}>{value}</option>)}</select>
        <Button onClick={reset}>Đặt lại bộ lọc</Button>
      </div>
      {state.loading ? <p role="status" className="report-state">Đang tải danh sách hồ sơ…</p> : state.error ? <Alert tone="error" title="Không tải được danh sách hồ sơ" className="report-state">{state.error}<div className="actions"><Button onClick={reload}>Thử lại</Button></div></Alert> : <div className="table-scroll"><table className="report-table"><thead><tr><th><input ref={selectAll} type="checkbox" aria-label="Chọn tất cả hồ sơ trên trang" checked={allChecked} disabled={!shown.length} onChange={event => { const ids = shown.map(row => row.id); setSelected(values => event.target.checked ? [...new Set([...values, ...ids])] : values.filter(id => !ids.includes(id))); }} /></th>{['Mã hồ sơ', 'Mã lô', 'Profile / Kịch bản', 'Phiên bản', 'SHA-256', 'Tạo lúc (UTC+7)', 'Người tạo', 'Thao tác'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{shown.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`Chọn hồ sơ ${row.report_code ?? row.id}`} checked={selected.includes(row.id)} onChange={event => setSelected(values => event.target.checked ? [...values, row.id] : values.filter(id => id !== row.id))} /></td><td className="number"><strong>{row.report_code ?? row.id}</strong><small className="logger-reason">{row.id}</small></td><td className="number"><Link href={`/batches/${encodeURIComponent(row.batch_id)}`}>{row.batch_id}</Link></td><td>{row.profile_id ?? 'Chưa có profile'}<small className="logger-reason">{row.scenario_id ?? 'Chưa có kịch bản'}</small></td><td className="number"><span className="report-version">v{row.version}</span></td><td className="number" title={row.checksum_sha256}>{shortHash(row.checksum_sha256)}</td><td className="number">{formatTime(row.created_at)}</td><td>{row.generated_by ?? 'Chưa có'}</td><td><div className="report-row-actions"><Button onClick={() => setPreview({ report: row, focus: 'summary' })}>Xem trước</Button><Button onClick={() => setPreview({ report: row, focus: 'audit' })}>Xem audit</Button></div></td></tr>)}{!shown.length && <tr><td colSpan={9}>{data?.length ? 'Không có hồ sơ khớp bộ lọc.' : 'Chưa có hồ sơ trên server.'}</td></tr>}</tbody></table></div>}
      <div className="report-pagination"><p>{rows.length ? `${page * pageSize + 1}–${page * pageSize + shown.length}` : '0'} / {rows.length} hồ sơ · Đã chọn {selected.length}<label className="report-page-size">Số dòng<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(0); }}>{pageSizes.map(value => <option key={value} value={value}>{value}</option>)}</select></label></p><div className="report-pages"><Button disabled={page === 0} onClick={() => setPage(value => value - 1)}>Trang trước</Button>{pageList(pageCount, page).map((value, index) => value === null ? <span key={`gap-${index}`}>…</span> : <Button key={value} aria-label={`Trang ${value + 1}`} aria-current={value === page ? 'page' : undefined} onClick={() => setPage(value)}>{value + 1}</Button>)}<Button disabled={page + 1 >= pageCount} onClick={() => setPage(value => value + 1)}>Trang sau</Button></div></div>
    </section>
    <footer className="report-footer"><p><strong>Lưu ý:</strong> ColdProof tổng hợp số đo, sự cố và provenance thành hồ sơ để QA xem xét. Quyết định xử lý lô thuộc về người có thẩm quyền QA; hồ sơ không kết luận lô đạt/không đạt. CSV là danh sách đang xem, không phải gói bằng chứng hay audit log.</p><p><span className="number">{rows.length}</span> hồ sơ đang xem</p></footer>
    {preview && <ReportPreviewDialog report={preview.report} focus={preview.focus} onClose={() => setPreview(null)} />}
  </>;
}

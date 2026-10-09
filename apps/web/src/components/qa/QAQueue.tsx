'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { getQAQueue, queueCSV } from '../../services/qa-queue';
import type { QAQueueData } from '../../types/qa-queue';
import { PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { Table } from '../ui/Table';
import { BatchStatusBadge } from '../BatchStatusBadge';
import { WorkflowProgress } from '../shipment/ShipmentWorkflow';
const formatTime = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : value;
export function QAQueue() {
  const [state, setState] = useState<{ data: QAQueueData | null; loading: boolean; error: string }>({ data: null, loading: true, error: '' });
  const [attempt, setAttempt] = useState(0), [query, setQuery] = useState(''), [status, setStatus] = useState('');
  const [tab, setTab] = useState('all'), [selected, setSelected] = useState<string[]>([]), [page, setPage] = useState(0);
  const selectAll = useRef<HTMLInputElement>(null);
  useEffect(() => { const controller = new AbortController(); getQAQueue(controller.signal).then(data => { if (!controller.signal.aborted) setState({ data, loading: false, error: '' }); }).catch((error: unknown) => { if (!controller.signal.aborted) setState({ data: null, loading: false, error: error instanceof Error ? error.message : 'Không tải được hàng đợi QA.' }); }); return () => controller.abort(); }, [attempt]);
  const data = state.data;
  const rows = (data?.exceptions ?? []).filter(row => (!query || `${row.id} ${row.batch_id} ${row.profile_id ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (!status || row.status === status) && (tab === 'all' || tab === 'pending' && row.status === 'PENDING_REVIEW' || tab === 'recorded' && data?.reviews.some(review => review.exception_id === row.id) || tab === 'selected' && selected.includes(row.id)));
  const shown = rows.slice(page * 10, page * 10 + 10);
  const allChecked = shown.length > 0 && shown.every(row => selected.includes(row.id));
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = !allChecked && shown.some(row => selected.includes(row.id)); }, [shown, selected, allChecked]);
  const reload = () => { setState({ data: null, loading: true, error: '' }); setSelected([]); setPage(0); setAttempt(value => value + 1); };
  const changeTab = (value: string) => { setTab(value); setPage(0); };
  const exportRows = () => { const values = rows.filter(row => !selected.length || selected.includes(row.id)); const url = URL.createObjectURL(new Blob([queueCSV(values)], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'coldproof-qa-queue.csv'; anchor.click(); URL.revokeObjectURL(url); };
  const pending = data?.exceptions.filter(row => row.status === 'PENDING_REVIEW').length;
  const meta = data ? [<><strong className="number">{data.exceptions.length}</strong> sự cố</>, <><strong className="number">{pending}</strong> chờ xem xét</>, <><strong className="number">{data.reviews.length}</strong> ghi nhận QA</>, <><strong className="number">{new Set(data.exceptions.map(row => row.batch_id)).size}</strong> lô liên quan</>] : undefined;
  return <><PageHeader title="Hàng đợi QA" description="Xem sự cố, đối chiếu số đo và lịch sử ghi nhận QA." meta={meta}><Button href="/reports">Tiếp tục: Hồ sơ bằng chứng</Button><Button primary disabled={state.loading} onClick={reload}>Làm mới hàng đợi</Button></PageHeader>
    <WorkflowProgress current={5} />
    <Alert title="Chế độ đọc">Chưa kết nối phân công, ký duyệt hoặc gửi quyết định review. Không có kết luận lô đạt/không đạt.</Alert>
    <section className="report-registry" aria-label="Hàng đợi sự cố">
      <div className="report-tabs-row"><div className="report-tabs" aria-label="Nhóm hàng đợi">{[['all', 'Tất cả'], ['pending', 'Chờ xem xét'], ['recorded', 'Có ghi nhận QA'], ['selected', 'Đã chọn']].map(([value, label]) => <button key={value} type="button" className="report-tab" aria-pressed={tab === value} onClick={() => changeTab(value)}>{label}</button>)}</div><p className="report-showing">Hiển thị {shown.length} / {rows.length} sự cố</p></div>
      <div className="report-filters"><div className="report-search"><input aria-label="Tìm mã lô / sự cố / profile" placeholder="Tìm mã lô, sự cố, profile…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></div><select aria-label="Lọc trạng thái QA" value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}><option value="">Trạng thái: tất cả</option>{[...new Set(data?.exceptions.map(row => row.status) ?? [])].map(value => <option key={value}>{value}</option>)}</select><Button onClick={() => { setQuery(''); setStatus(''); changeTab('all'); }}>Đặt lại bộ lọc</Button><Button disabled={!rows.length} onClick={exportRows}>Xuất danh sách CSV</Button></div>
      {state.loading ? <p role="status" className="report-state">Đang tải hàng đợi QA…</p> : state.error ? <Alert tone="error" title="Không tải được hàng đợi" className="report-state">{state.error}<div className="actions"><Button onClick={reload}>Thử lại</Button></div></Alert> : <>
        {data && data.exceptions.some(row => !row.profile_id) && <Alert tone="warning" className="report-state">Có sự cố chưa gắn profile trên server; đối chiếu ngưỡng trên trang lô trước khi ghi nhận.</Alert>}
        <Table label="Sự cố và ghi nhận QA" className="qa-table"><thead><tr><th scope="col"><input ref={selectAll} type="checkbox" aria-label="Chọn tất cả sự cố trên trang" checked={allChecked} disabled={!shown.length} onChange={event => { const ids = shown.map(row => row.id); setSelected(values => event.target.checked ? [...new Set([...values, ...ids])] : values.filter(id => !ids.includes(id))); }} /></th><th scope="col">Lô</th><th scope="col">Sự cố / Profile</th><th scope="col" className="number">Số đo liên quan</th><th scope="col">Ghi nhận QA</th><th scope="col">Trạng thái server</th><th scope="col">Tạo lúc (UTC+7)</th><th scope="col">Thao tác</th></tr></thead><tbody>{shown.map(row => { const reviews = data?.reviews.filter(review => review.exception_id === row.id) ?? []; return <tr key={row.id}><td><input type="checkbox" aria-label={`Chọn sự cố ${row.id}`} checked={selected.includes(row.id)} onChange={event => setSelected(values => event.target.checked ? [...values, row.id] : values.filter(id => id !== row.id))} /></td><td><Link className="number" href={`/batches/${encodeURIComponent(row.batch_id)}`}>{row.batch_id}</Link></td><td><Link className="number" href={`/qa/${encodeURIComponent(row.id)}`}>{row.id}</Link><small>{row.profile_id ?? 'Chưa có profile'}</small></td><td className="number">{row.record_ids.length}</td><td><span className="number">{reviews.length}</span> ghi nhận</td><td><BatchStatusBadge status={row.status} /></td><td className="number">{formatTime(row.created_at)}</td><td><div className="report-row-actions"><Button href={`/qa/${encodeURIComponent(row.id)}`}>Xem chi tiết</Button></div></td></tr>; })}{!shown.length && <tr><td colSpan={8}>{data?.exceptions.length ? 'Không có sự cố khớp bộ lọc.' : 'Chưa có sự cố trong hàng đợi QA.'}</td></tr>}</tbody></Table>
      </>}
      <div className="report-pagination"><p>{rows.length} sự cố · Đã chọn {selected.length} · Trang {page + 1} / {Math.max(1, Math.ceil(rows.length / 10))}</p><div className="report-pages"><Button disabled={page === 0} onClick={() => setPage(value => value - 1)}>Trang trước</Button><Button disabled={(page + 1) * 10 >= rows.length} onClick={() => setPage(value => value + 1)}>Trang sau</Button></div></div>
    </section>
    <p>CSV là danh sách đang xem, không phải audit log. Nhận phân công và duyệt hàng loạt chưa được hỗ trợ.</p>
  </>;
}

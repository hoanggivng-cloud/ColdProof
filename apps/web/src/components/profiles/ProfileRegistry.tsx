'use client';
import { useEffect, useRef, useState } from 'react';
import { getFormProfiles, getServerProfiles, mergeProfiles, profilesCSV } from '../../services/profiles';
import type { ProfileRow, ProfileSource } from '../../types/profiles';
import { PageHeader } from '../layout/PageHeader';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { ProfileDetailDrawer } from './ProfileDetailDrawer';
import { ProfileSourceBadge } from './ProfileSourceBadge';
const formProfiles = getFormProfiles();
const temperature = (value: number | null) => value === null ? '—' : `${value}°C`;
export function ProfileRegistry() {
  const [state, setState] = useState<{ server: ProfileRow[] | null; loading: boolean; error: string }>({ server: null, loading: true, error: '' });
  const [attempt, setAttempt] = useState(0), [query, setQuery] = useState(''), [tab, setTab] = useState<'all' | 'form' | 'server'>('all');
  const [open, setOpen] = useState<ProfileRow | null>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { const controller = new AbortController(); getServerProfiles(controller.signal).then(server => { if (!controller.signal.aborted) setState({ server, loading: false, error: '' }); }).catch((error: unknown) => { if (!controller.signal.aborted) setState({ server: null, loading: false, error: error instanceof Error ? error.message : 'Không tải được profile từ lô trên server.' }); }); return () => controller.abort(); }, [attempt]);
  useEffect(() => { const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !document.querySelector('dialog[open]')) { event.preventDefault(); search.current?.focus(); } }; window.addEventListener('keydown', shortcut); return () => window.removeEventListener('keydown', shortcut); }, []);
  const all = mergeProfiles(formProfiles, state.server ?? []);
  const inTab = (source: ProfileSource, value: typeof tab) => value === 'all' || (value === 'form' ? source !== 'SERVER_BATCH' : source !== 'FORM_FIXTURE');
  const matches = all.filter(row => !query || `${row.id} ${row.label ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const rows = matches.filter(row => inTab(row.source, tab));
  const serverOnly = all.filter(row => row.source === 'SERVER_BATCH');
  const reload = () => { setState({ server: null, loading: true, error: '' }); setAttempt(value => value + 1); };
  const exportRows = () => { const url = URL.createObjectURL(new Blob([profilesCSV(rows)], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'coldproof-profiles.csv'; anchor.click(); URL.revokeObjectURL(url); };
  const meta = [<><strong className="number">{formProfiles.length}</strong> profile trong form</>, <><strong className="number">{state.server?.length ?? '—'}</strong> profile từ lô server</>, <><strong className="number">{state.server ? state.server.reduce((sum, row) => sum + row.batchIds.length, 0) : '—'}</strong> lô có profile</>];
  const tabs: [typeof tab, string][] = [['all', 'Tất cả'], ['form', 'Trong form'], ['server', 'Từ lô server']];
  return <><PageHeader title="Profile nhiệt độ" description="Ngưỡng nhiệt dùng khi tạo Shipment và ngưỡng đang gắn trên lô ở server." meta={meta}><Button disabled={!rows.length} onClick={exportRows}>Xuất danh sách CSV</Button><Button primary href="/batches/new">Tạo Shipment</Button></PageHeader>
    <Alert title="Dữ liệu mô phỏng">Profile trong form và ngưỡng trên lô demo là bối cảnh mô phỏng. Chưa có API tạo hoặc sửa profile.</Alert>
    {serverOnly.length > 0 && <Alert tone="warning" title="Chưa đồng bộ">{serverOnly.length} profile trên server không có trong form Tạo Shipment: <span className="number">{serverOnly.map(row => row.id).join(', ')}</span>.</Alert>}
    <section className="report-registry" aria-label="Danh sách profile">
      <div className="report-tabs-row"><div className="report-tabs" aria-label="Nguồn profile">{tabs.map(([value, label]) => <button key={value} type="button" className="report-tab" aria-pressed={tab === value} onClick={() => setTab(value)}>{label}<span className="report-count number">{matches.filter(row => inTab(row.source, value)).length}</span></button>)}</div><p className="report-showing">Hiển thị {rows.length} / {all.length} profile</p></div>
      <div className="report-filters"><div className="report-search"><input ref={search} aria-label="Tìm profile" aria-keyshortcuts="Control+k Meta+k" placeholder="Tìm mã hoặc tên profile…" value={query} onChange={event => setQuery(event.target.value)} /><kbd>Ctrl / ⌘ K</kbd></div><Button onClick={() => { setQuery(''); setTab('all'); }}>Đặt lại bộ lọc</Button></div>
      {state.loading && <p role="status" className="report-state">Đang tải profile từ lô trên server…</p>}
      {state.error && <Alert tone="error" title="Không tải được profile từ server" className="report-state">{state.error} Đang chỉ hiện profile trong form.<div className="actions"><Button onClick={reload}>Thử lại</Button></div></Alert>}
      <div className="table-scroll"><table className="report-table profile-table"><thead><tr>{['Profile', 'Nguồn', 'Ngưỡng dưới', 'Ngưỡng trên', 'Thời lượng demo', 'Lô trên server', 'Thao tác'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong className="number">{row.id}</strong><small className="logger-reason">{row.label ?? 'Server chưa trả tên profile'}</small></td><td><ProfileSourceBadge source={row.source} /></td><td className="number">{temperature(row.lower)}</td><td className="number">{temperature(row.upper)}</td><td className="number">{row.durationMinutes === null ? '—' : `${row.durationMinutes} phút`}</td><td className="number">{row.batchIds.length}</td><td><div className="report-row-actions"><Button onClick={() => setOpen(row)}>Xem chi tiết</Button></div></td></tr>)}{!rows.length && <tr><td colSpan={7}>{all.length ? 'Không có profile khớp bộ lọc.' : 'Chưa có profile.'}</td></tr>}</tbody></table></div>
      <div className="report-pagination"><p>{rows.length} profile đang xem</p><p>Mã profile trong form và trên server được gộp khi trùng nhau.</p></div>
    </section>
    <footer className="report-footer"><p><strong>Lưu ý:</strong> Profile chỉ cung cấp ngưỡng để backend phát hiện sự cố. Vượt ngưỡng khi nhỏ hơn ngưỡng dưới hoặc lớn hơn ngưỡng trên. Quyết định xử lý lô thuộc về QA; profile không dùng để kết luận lô đạt/không đạt.</p><p><span className="number">{all.length}</span> profile</p></footer>
    {open && <ProfileDetailDrawer profile={open} onClose={() => setOpen(null)} />}
  </>;
}

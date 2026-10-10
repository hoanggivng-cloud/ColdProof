'use client';
import { useRef, useState, useEffect } from 'react';
import { Alert } from '../ui/Alert';
import { Badge, type BadgeTone } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Panel } from '../ui/Panel';
import { Table } from '../ui/Table';
import { useShipmentWorkflow } from '../shipment/ShipmentWorkflow';
import { getDemoImportPreview } from '../../services/import-preview';
import type { ImportPreview } from '../../types/import-preview';
import { writeRecord, readRecords } from '../../services/api-client';

const flags = { VALID: 'Bản ghi mẫu hợp lệ', EXCURSION_LOW: 'Sự cố nhiệt độ mẫu', PARSE_TIMESTAMP_ERROR: 'Thiếu timestamp', DUPLICATE_TIMESTAMP: 'Timestamp trùng' };
const flagTones: Record<keyof typeof flags, BadgeTone> = { VALID: 'neutral', EXCURSION_LOW: 'danger', PARSE_TIMESTAMP_ERROR: 'danger', DUPLICATE_TIMESTAMP: 'warning' };
const timeFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'medium' });

import { useSearchParams } from 'next/navigation';

export function ImportWorkbench() {
  const searchParams = useSearchParams();
  const queryBatchId = searchParams?.get('batchId');
  const { shipment, deviceIds, devicesConfirmed, handover } = useShipmentWorkflow();
  const targetBatchId = queryBatchId || shipment?.lot;
  const ready = Boolean(targetBatchId);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null), [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null), [loading, setLoading] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false), [page, setPage] = useState(0), [result, setResult] = useState(false);
  const [message, setMessage] = useState('');
  const [sources, setSources] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    readRecords('sources').then(data => setSources(data as Record<string, unknown>[])).catch(() => {});
  }, []);

  const clearPreview = () => { setPreview(null); setResult(false); setPage(0); setFlaggedOnly(false); setMessage(''); };
  const choose = (value?: File) => {
    clearPreview(); setFile(null); setError('');
    if (!value) return;
    if (!/\.(csv|tsv|txt)$/i.test(value.name) || !value.size) { setError('Chọn file CSV, TSV hoặc TXT có dữ liệu. PDF/XLSX chưa được hỗ trợ bởi luồng hiện tại.'); return; }
    setFile(value);
  };
  const loadDemo = async () => {
    setLoading(true); setError(''); setPage(0); setFlaggedOnly(false);
    try { setPreview(await getDemoImportPreview()); }
    catch { setError('Không tải được dữ liệu xem trước mô phỏng.'); }
    finally { setLoading(false); }
  };

  const createImportJob = async () => {
    try {
        const sourceId = sources.length > 0 ? String(sources[0].id) : '00000000-0000-0000-0000-000000000000';
        const payload: Record<string, any> = { source_id: sourceId, parser_id: 'format-a', parser_version: '0.1.0' };
        if (targetBatchId) {
            payload.batch_id = targetBatchId;
        }
        const job = (await writeRecord('imports', 'POST', payload)) as Record<string, unknown>;
        setMessage(`Tạo import job và mô phỏng dữ liệu thành công cho lô ${targetBatchId || 'demo'}.`);
        setResult(true);
        await loadDemo();
    } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tạo import job');
    }
  };

  const rows = preview?.rows.filter(row => !flaggedOnly || row.flag !== 'VALID') ?? [];
  return <section aria-label="Import dữ liệu logger" className="space-y-6">
    <Alert title="Dữ liệu mô phỏng">File chọn tại máy chưa được upload hoặc parse. Dữ liệu xem trước lấy từ fixture riêng, không phải nội dung file bạn chọn.</Alert>
    {error && <Alert tone="error">{error}</Alert>}
    <div className="import-grid">
      <Panel title="01. Chọn file logger"><div className="import-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (ready) choose(event.dataTransfer.files[0]); }}><p>Kéo thả file xuất từ logger. CSV / TSV / TXT, chỉ chọn tại trình duyệt.</p><Field id="import-file" label="Chọn file nhiệt độ"><input id="import-file" ref={input} type="file" accept=".csv,.tsv,.txt" disabled={!ready} onChange={event => choose(event.target.files?.[0])} /></Field></div>
        {!file ? <p>Chưa chọn file nhiệt độ.</p> : <div className="attachment-row"><span className="number">{file.name} · {(file.size / 1024).toFixed(1)} KB</span>{result ? <Badge tone="success">Đã ghi nhận Job</Badge> : <Badge tone="warning">Chưa upload / parse</Badge>}<Button variant="text" onClick={() => { choose(); if (input.current) input.current.value = ''; }}>Bỏ file</Button></div>}
        <ul className="page-meta"><li>Lô: {targetBatchId ? <strong className="number">{targetBatchId}</strong> : <strong>Chưa xác định lô</strong>}</li></ul>
        <div className="form-footer"><Button primary disabled={!ready || !file} onClick={createImportJob}>Kiểm tra file trên server</Button></div>
      </Panel>
      <Panel title="02. Kiểm tra và mapping"><p>Format, múi giờ, đơn vị và thiết bị của bộ dữ liệu.</p>
        {!preview ? <p>Chưa có kết quả kiểm tra. Chọn xem mẫu để kiểm tra bố cục.</p> : <><dl className="workflow-summary"><dt>File mẫu</dt><dd className="number">{preview.file_name}</dd><dt>Format</dt><dd>{preview.format}</dd><dt>Múi giờ gốc</dt><dd>{preview.timezone}</dd><dt>Đơn vị</dt><dd>{preview.unit}</dd><dt>Thiết bị trong mẫu</dt><dd className="number">{preview.device_id}</dd><dt>Profile trong mẫu</dt><dd className="number">{preview.profile_id} · {preview.lower}–{preview.upper}°C</dd></dl><Alert>Các cờ kiểm tra được dựng sẵn trong mẫu (mô phỏng). Chưa kiểm tra schema, serial hoặc checksum file đã chọn.</Alert>{!deviceIds.includes(preview.device_id) && <Alert tone="warning" title="Thiết bị không khớp">Thiết bị trong mẫu không nằm trong lựa chọn của lô. Không tự gán mẫu vào thiết bị khác.</Alert>}</>}
      </Panel>
    </div>
    {loading && (
      <div className="panel" aria-busy="true">
        <div className="section-heading"><h2 className="skeleton" style={{ width: '200px', height: '24px' }}>Loading...</h2></div>
        <div className="table-scroll">
          <table className="skeleton" style={{ width: '100%', height: '200px' }}>
            <tbody><tr><td></td></tr></tbody>
          </table>
        </div>
      </div>
    )}
    <Panel title="03. Xem trước số đo và cờ dữ liệu">
      {!preview ? <p>Chưa có số đo xem trước.</p> : <>
        <ul className="page-meta"><li><strong className="number">{preview.summary.total}</strong> dòng mẫu</li><li><strong className="number">{preview.summary.flagged}</strong> dòng có cờ</li><li>Thấp nhất <strong className="number">{preview.summary.minimum}°C</strong></li><li>Cao nhất <strong className="number">{preview.summary.maximum}°C</strong></li><li><strong className="number">{preview.summary.excursions}</strong> sự cố mẫu</li></ul>
        <Alert tone="warning" title="Cần xem xét">Giữ cả dòng thiếu timestamp và dòng trùng; không xóa hoặc nội suy dữ liệu.</Alert>
        <label className="import-filter"><input type="checkbox" checked={flaggedOnly} onChange={event => { setFlaggedOnly(event.target.checked); setPage(0); }} /> Chỉ xem dòng có cờ</label>
        <Table label="Số đo xem trước"><thead><tr><th scope="col">Tham chiếu gốc</th><th scope="col">Thời gian (UTC+7)</th><th scope="col" className="number">Nhiệt độ (°C)</th><th scope="col">Thiết bị</th><th scope="col">Cờ dữ liệu</th><th scope="col">Xử lý / nguồn</th></tr></thead><tbody>{rows.slice(page * 4, page * 4 + 4).map(row => <tr key={row.source_ref}><td className="number">{row.source_ref}</td><td className="number">{row.timestamp ? timeFormat.format(new Date(row.timestamp)) : 'Thiếu timestamp gốc'}</td><td className="number">{row.temp_c}</td><td className="number">{row.device_id}</td><td><Badge tone={flagTones[row.flag]}>{flags[row.flag]}</Badge></td><td>{row.detail}<small>Mô phỏng · {row.origin}</small></td></tr>)}</tbody></Table>
        <div className="form-footer"><p>{rows.length} dòng trong mẫu · Trang {page + 1} / {Math.max(1, Math.ceil(rows.length / 4))}</p><div className="actions"><Button disabled={page === 0} onClick={() => setPage(value => value - 1)}>Trang trước</Button><Button disabled={(page + 1) * 4 >= rows.length} onClick={() => setPage(value => value + 1)}>Trang sau</Button><Button primary={!result} onClick={() => setResult(true)}>Xem kết quả mô phỏng</Button></div></div>
      </>}
    </Panel>
    <Panel title="04. Kết quả import">{!result || !preview ? <p>Chưa có kết quả import. Chưa ghi số đo hoặc audit trên server.</p> : <><Alert title="Mô phỏng · REQUIRES_REVIEW">Kết quả từ fixture, chưa tạo review task hoặc import job trên server.</Alert><p>{preview.summary.total} dòng mẫu được giữ lại, {preview.summary.flagged} dòng có cờ cần xem xét. Chưa có kết luận lô đạt/không đạt.</p><div className="actions"><Button onClick={clearPreview}>Xem lại / chọn file khác</Button><Button href="/batches/new">Xem Shipment trong form</Button><Button primary href="/batches">Tiếp tục: Phân tích lô trên server</Button></div></>}</Panel>
    {message && <Alert role="status">{message}</Alert>}
  </section>;
}

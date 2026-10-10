'use client';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { writeRecord } from '../../services/api-client';
import { RoleGate } from '../auth/RoleGate';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
export function ImportWorkbench() {
  const params = useSearchParams();
  const batchId = params.get('batchId') ?? '';
  const [scenario, setScenario] = useState('EXCURSION'), [seed, setSeed] = useState(42);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generate = async () => {
    setBusy(true); setError('');
    try { await writeRecord(`batches/${encodeURIComponent(batchId)}/simulate`, 'POST', { scenario, seed }); window.location.href = `/batches/${encodeURIComponent(batchId)}`; }
    catch (e) { setError(e instanceof Error ? e.message : 'Không sinh được dữ liệu'); setBusy(false); }
  };
  return <RoleGate roles={['OPERATOR', 'ADMIN']} fallback={<Alert>Chỉ Operator hoặc Admin được sinh dữ liệu.</Alert>}>
    <Alert title="Dữ liệu mô phỏng">Sinh số đo mới trên server, phân tích theo ngưỡng của lô. Không nhập dữ liệu thiết bị thật. Mỗi lô chỉ sinh một lần.</Alert>
    <section className="panel"><h2>Sinh dữ liệu mô phỏng</h2><p>Lô: {batchId || 'Chưa chọn lô'}</p>
      <label>Kịch bản <select value={scenario} onChange={e => setScenario(e.target.value)}><option value="NORMAL">Bình thường</option><option value="EXCURSION">Vượt ngưỡng</option><option value="MISSING">Thiếu dữ liệu</option><option value="CONFLICT">Cảm biến xung đột</option></select></label>
      <label>Seed <input type="number" min={0} max={2147483647} value={seed} onChange={e => setSeed(Number(e.target.value))} /></label>
      <p>Cùng cấu hình và seed sẽ tạo cùng chuỗi nhiệt độ. Thời gian và thiết bị lấy từ Shipment đã lưu.</p>
      {error && <Alert tone="error">{error}</Alert>}<div className="actions"><Button href="/batches/new">Tạo lô mới</Button><Button primary disabled={!batchId || busy} onClick={generate}>{busy ? 'Đang sinh và phân tích…' : 'Sinh và phân tích dữ liệu'}</Button></div>
    </section>
  </RoleGate>;
}

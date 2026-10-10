'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { SetupDevice, TemperaturePreset } from '../../types/shipment-setup';
import { RoleGate } from '../auth/RoleGate';
import { Alert } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Table } from '../ui/Table';
import { PageHeader } from '../layout/PageHeader';
import { AssignLoggerDialog } from './AssignLoggerDialog';
import { useShipmentWorkflow, WorkflowProgress } from './ShipmentWorkflow';
import { RecordHandoverDialog } from './RecordHandoverDialog';

export function ShipmentSetup({ presets, devices }: { presets: TemperaturePreset[]; devices: SetupDevice[] }) {
  const router = useRouter();
  const workflow = useShipmentWorkflow();
  const [restored, setRestored] = useState(workflow.shipment), [formVersion, setFormVersion] = useState(0);
  const [profileId, setProfileId] = useState(workflow.shipment?.profileId ?? presets[0]?.id ?? '');
  useEffect(() => { const requested = new URLSearchParams(window.location.search).get('profile'); if (!workflow.shipment && requested && presets.some(item => item.id === requested)) setProfileId(requested); }, [workflow.shipment, presets]);
  const initialSelection = devices.filter(device => device.initiallySelected && device.allocationAllowed).map(device => device.id);
  const [selected, setSelected] = useState(workflow.shipment ? workflow.deviceIds : initialSelection);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [assign, setAssign] = useState(false), [issues, setIssues] = useState<string[]>([]), [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false), [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const profile = presets.find(item => item.id === profileId);

  const saveToServer = async (targetLot?: string) => {
    const lotToSave = targetLot ?? workflow.shipment?.lot;
    if (!lotToSave) return false;
    setSaving(true);
    try {
      const response = await fetch('/api/backend/batches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: lotToSave,
          scenario_id: 'S02',
          profile_id: profileId,
          lower_threshold: profile?.lower ?? 2.0,
          upper_threshold: profile?.upper ?? 8.0,
          device_ids: selected,
        }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          setSaveSuccess(lotToSave);
          setMessage(`Lô ${lotToSave} đã có trên server. Đang chuyển hướng đến hồ sơ lô...`);
          router.push(`/batches/${encodeURIComponent(lotToSave)}`);
          return true;
        }
        const err: unknown = await response.json().catch(() => ({}));
        const msg = typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : 'Không thể lưu lô lên server. Kiểm tra kết nối.';
        setMessage(msg);
        return false;
      } else {
        setSaveSuccess(lotToSave);
        setIsDirty(false);
        setMessage(`Đã tạo lô ${lotToSave} thành công! Hãy tiếp tục gán thiết bị.`);
        return true;
      }
    } catch {
      setMessage('Không kết nối được server.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { workflow.reset(); setRestored(null); setFormVersion(value => value + 1); setProfileId(presets[0]?.id ?? ''); setSelected(initialSelection); setIssues([]); setMessage(''); setAssign(false); setHandoverOpen(false); setSaveSuccess(null); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget), errors: string[] = [];
    const names: [string, string][] = [
      ['product', 'Sản phẩm'],
      ['lot', 'Mã lô'],
      ['origin', 'Điểm xuất phát'],
      ['destination', 'Điểm nhận'],
      ['start', 'Thời gian bắt đầu'],
      ['end', 'Thời gian kết thúc'],
      ['reference', 'Mã vận đơn'],
      ['sop', 'Phiên bản SOP'],
    ];
    let firstInvalidKey: string | null = null;
    for (const [key, label] of names) {
      if (!String(values.get(key) ?? '').trim()) {
        errors.push(`${label}: cần nhập thông tin.`);
        if (!firstInvalidKey) firstInvalidKey = key;
      }
    }
    const start = String(values.get('start') ?? ''), end = String(values.get('end') ?? '');
    if (start && end && end <= start) {
      errors.push('Thời gian kết thúc phải sau thời gian bắt đầu.');
      if (!firstInvalidKey) firstInvalidKey = 'end';
    }
    if (!profile) errors.push('Cần chọn profile nhiệt độ.');
    if (!selected.length) errors.push('Cần chọn ít nhất một thiết bị.');
    if (errors.length > 0) {
      setIssues(errors);
      setMessage(`${errors.length} thông tin cần kiểm tra trước khi tạo Shipment.`);
      if (firstInvalidKey) {
        const el = document.querySelector<HTMLElement>(`[name="${firstInvalidKey}"]`) || document.getElementById(`shipment-${firstInvalidKey}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
        }
      }
      return;
    }
    setIssues([]);
    const get = (key: string) => String(values.get(key) ?? '').trim();
    const lot = get('lot');
    workflow.prepare({
      product: get('product'),
      lot,
      transport: get('transport'),
      origin: get('origin'),
      destination: get('destination'),
      start,
      end,
      reference: get('reference'),
      sop: get('sop'),
      notes: get('notes'),
      profileId,
      originType: 'SYNTHETIC',
    }, selected);
    await saveToServer(lot);
  };

  const field = (id: string, label: string, control: ReactNode, className?: string, hint?: string) => <Field id={id} label={label} className={className} hint={hint}>{control}</Field>;
  return <><PageHeader title="Tạo Shipment" breadcrumb={[{ href: '/batches', label: 'Lô hàng' }, { label: 'Tạo Shipment' }]} description="Nhập thông tin lô, chọn profile nhiệt độ và gán thiết bị."><Button href="/batches">Xem danh sách lô</Button></PageHeader>
    <WorkflowProgress />
    <RoleGate roles={['OPERATOR', 'ADMIN']} fallback={<Alert tone="warning" title="Không có quyền tạo Shipment">Tạo Shipment cần vai trò Operator hoặc Admin. Vai trò hiện tại chỉ xem lô và hồ sơ.</Alert>}>
    <Alert title="Hệ thống sẵn sàng">Khi nhấn Tạo Shipment, lô hàng sẽ được lưu trực tiếp vào cơ sở dữ liệu và chuyển hướng đến trang chi tiết lô.</Alert>
    {issues.length > 0 && <Alert tone="error" title={`${issues.length} thông tin cần kiểm tra`}><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></Alert>}
    <form id="shipment-form" key={formVersion} noValidate onSubmit={submit} onReset={reset} onChange={event => {
      if (!(event.target instanceof HTMLElement) || event.target.closest('dialog')) return;
      if (workflow.shipment && !isDirty) { setIsDirty(true); setMessage('Thông tin đã thay đổi. Hãy lưu lại Shipment.'); }
    }}>
      <section className="panel"><div className="section-heading"><div><h2>01. Thông tin Shipment</h2><p>Thông tin lô và khung giờ vận chuyển</p></div><Button type="reset">Đặt lại form</Button></div><div className="form-grid">
        {field('shipment-id', 'Shipment ID', <input id="shipment-id" readOnly value="Được cấp khi server tạo lô" aria-describedby="shipment-id-hint" />, undefined, 'Tự động tạo mã lô trên server')}
        {field('shipment-lot', 'Batch / Lot Number *', <input id="shipment-lot" name="lot" defaultValue={restored?.lot ?? ''} required className="number" placeholder="VD: BATCH-2026-001" maxLength={80} />)}
        {field('shipment-product', 'Sản phẩm *', <input id="shipment-product" name="product" defaultValue={restored?.product ?? ''} required placeholder="Nhập tên sản phẩm" maxLength={120} />)}
        {field('shipment-transport', 'Loại vận chuyển', <select id="shipment-transport" name="transport" defaultValue={restored?.transport}><option>Xe lạnh</option><option>Đường hàng không</option><option>Vận chuyển có kiểm soát nhiệt độ</option></select>)}
        {field('shipment-origin', 'Điểm xuất phát *', <input id="shipment-origin" name="origin" defaultValue={restored?.origin ?? ''} required placeholder="Nhập kho hoặc điểm xuất phát" maxLength={200} />)}
        {field('shipment-destination', 'Điểm nhận *', <input id="shipment-destination" name="destination" defaultValue={restored?.destination ?? ''} required placeholder="Nhập điểm nhận" maxLength={200} />)}
        {field('shipment-start', 'Thời gian bắt đầu (UTC+7) *', <input id="shipment-start" name="start" defaultValue={restored?.start ?? ''} type="datetime-local" required className="number" />)}
        {field('shipment-end', 'Thời gian kết thúc (UTC+7) *', <input id="shipment-end" name="end" defaultValue={restored?.end ?? ''} type="datetime-local" required className="number" />)}
      </div></section>
      <section className="panel"><div className="section-heading"><div><h2>02. Profile nhiệt độ</h2><p>Ngưỡng theo profile được chọn</p></div><Badge tone="synthetic">Chuẩn GDP/GSP</Badge></div><div className="form-grid">
        {field('shipment-profile', 'Profile nhiệt độ', <select id="shipment-profile" value={profileId} onChange={event => setProfileId(event.target.value)}>{presets.map(item => <option key={item.id} value={item.id}>{item.label} · {item.id}</option>)}</select>, 'span-full')}
        {field('profile-lower', 'Ngưỡng dưới (°C)', <input id="profile-lower" readOnly value={profile?.lower ?? ''} className="number" />)}
        {field('profile-upper', 'Ngưỡng trên (°C)', <input id="profile-upper" readOnly value={profile?.upper ?? ''} className="number" />)}
        {field('profile-duration', 'Thời lượng tiêu chuẩn (phút)', <input id="profile-duration" readOnly value={profile?.durationMinutes ?? ''} className="number" aria-describedby="profile-duration-hint" />)}
      </div>{profile && <div className="thermal-preview" aria-label="Xem trước ngưỡng"><span>Dưới {profile.lower}°C</span><span>Khoảng {profile.lower}°C – {profile.upper}°C</span><span>Trên {profile.upper}°C</span></div>}</section>
      <section className="panel"><div className="section-heading"><div><h2>03. Gán thiết bị</h2><p>Chọn thiết bị theo dõi cho lô</p></div><Button onClick={() => setAssign(value => !value)}>Gán thiết bị</Button></div>
        {assign && <AssignLoggerDialog devices={devices} selected={selected} onClose={() => setAssign(false)} onConfirm={ids => { setSelected(ids); workflow.assign(ids); setAssign(false); }} />}
        {devices.some(device => selected.includes(device.id) && device.warning) && <Alert tone="warning" title="Kiểm tra hiệu chuẩn">Một thiết bị đã chọn cần kiểm tra hạn hiệu chuẩn. Giữ riêng các chuỗi cảm biến.</Alert>}
        <Table label="Thiết bị đã gán"><thead><tr>{['Thiết bị', 'Serial', 'Model', 'Kênh', 'Hiệu chuẩn'].map(label => <th key={label} scope="col">{label}</th>)}<th scope="col" className="number">Pin</th><th scope="col">Thao tác</th></tr></thead><tbody>{devices.filter(device => selected.includes(device.id)).map(device => <tr key={device.id}><td className="number">{device.id}</td><td className="number">{device.serial}</td><td>{device.model}</td><td>{device.channel}</td><td><Badge tone={device.warning ? 'warning' : 'neutral'}>{device.calibrationLabel}</Badge></td><td className="number">{device.battery}%</td><td><Button variant="text" onClick={() => { const ids = selected.filter(id => id !== device.id); setSelected(ids); workflow.assign(ids, false); }}>Bỏ gán</Button></td></tr>)}{!selected.length && <tr><td colSpan={7}>Chưa gán thiết bị.</td></tr>}</tbody></Table>
      </section>
      <section className="panel"><div className="section-heading"><div><h2>04. Thông tin bổ sung & tham chiếu QA</h2><p>Vận đơn, SOP và hướng dẫn bàn giao</p></div></div><div className="form-grid">
        {field('shipment-reference', 'Mã vận đơn / tham chiếu *', <input id="shipment-reference" name="reference" defaultValue={restored?.reference ?? 'REF-2026-001'} required maxLength={100} placeholder="VD: REF-2026-001" />)}
        {field('shipment-sop', 'Phiên bản SOP *', <input id="shipment-sop" name="sop" defaultValue={restored?.sop ?? 'SOP-COLD-01 (v2.4)'} required maxLength={100} placeholder="VD: SOP-COLD-01 (v2.4)" />)}
        {field('shipment-notes', 'Ghi chú / hướng dẫn xử lý', <textarea id="shipment-notes" name="notes" defaultValue={restored?.notes ?? ''} rows={3} maxLength={500} aria-describedby="shipment-notes-hint" />, 'span-full', 'Tối đa 500 ký tự')}
      </div></section>
      <section className="panel" style={{ opacity: (!workflow.shipment || !workflow.devicesConfirmed) ? 0.6 : 1, transition: 'opacity 0.2s' }}><div className="section-heading"><div><h2>05. Ghi nhận bàn giao</h2><p>Hoàn thành thông tin Shipment và xác nhận thiết bị trước bước này</p></div><Button disabled={!workflow.shipment || !workflow.devicesConfirmed} onClick={() => setHandoverOpen(true)}>{workflow.handover ? 'Chỉnh sửa bàn giao' : 'Ghi nhận bàn giao'}</Button></div>
        {!workflow.handover ? <p style={{ color: 'var(--text-sub)' }}>Chưa ghi nhận bàn giao trong form.</p> : <><Alert>Bàn giao (mô phỏng) đã được giữ trong phiên ứng dụng; chưa lưu server.</Alert><dl className="workflow-summary"><dt>Thời gian (UTC+7)</dt><dd className="number">{workflow.handover.timestampRaw.replace('T', ' ')}</dd><dt>Địa điểm</dt><dd>{workflow.handover.location}</dd><dt>Bàn giao</dt><dd>{workflow.handover.fromParty} → {workflow.handover.toParty}</dd><dt>Người giao / nhận</dt><dd>{workflow.handover.sender} / {workflow.handover.receiver}</dd><dt>Tài liệu</dt><dd>{workflow.handover.attachment?.name ?? 'Chưa chọn tài liệu'}</dd></dl></>}
      </section>
    </form>
    
    <div className="panel form-footer" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p>Lô hàng sẽ được tạo và lưu trực tiếp vào cơ sở dữ liệu trên server.</p>
        {issues.length > 0 && <Alert tone="error" title={`${issues.length} thông tin cần kiểm tra`}><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></Alert>}
        {saveSuccess && !isDirty && <Alert title="Đã lưu thành công">Lô <strong>{saveSuccess}</strong> đã được lưu vào cơ sở dữ liệu trên server. Vui lòng hoàn thành Gán thiết bị và Ghi nhận bàn giao. <a href={`/batches/${encodeURIComponent(saveSuccess)}`}>Xem chi tiết lô</a></Alert>}
        {isDirty && <Alert tone="warning" title="Thông tin có thay đổi">Bạn vừa thay đổi thông tin form. Hãy bấm Lưu/Tạo Shipment lại để cập nhật thay đổi.</Alert>}
        {message && <Alert role="status">{message}</Alert>}
      </div>
      <div className="actions" style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
        <Button variant="text" href="/batches">Hủy</Button>
        <Button onClick={() => setMessage('Dữ liệu biểu mẫu hiện tại đã được ghi nhận.')}>Lưu bản nháp</Button>
        <Button primary type="submit" form="shipment-form" disabled={saving}>{saving ? 'Đang lưu…' : saveSuccess ? 'Lưu thay đổi Shipment' : 'Tạo Shipment'}</Button>
        {workflow.shipment && !workflow.devicesConfirmed && <Button onClick={() => setAssign(true)}>Tiếp tục: Gán thiết bị</Button>}
        {workflow.shipment && workflow.devicesConfirmed && !workflow.handover && <Button onClick={() => setHandoverOpen(true)}>Tiếp tục: Ghi nhận bàn giao</Button>}
        {workflow.handover && <Button primary href="/imports">Tiếp tục sang Import</Button>}
      </div>
    </div>
    
    {handoverOpen && workflow.shipment && <RecordHandoverDialog shipment={workflow.shipment} initial={workflow.handover} onClose={() => setHandoverOpen(false)} onSave={value => { workflow.saveHandover(value); setHandoverOpen(false); setMessage('Đã giữ thông tin bàn giao trong form mô phỏng. Chưa lưu server; có thể tiếp tục sang Import.'); }} />}
    </RoleGate>
    </>;
}

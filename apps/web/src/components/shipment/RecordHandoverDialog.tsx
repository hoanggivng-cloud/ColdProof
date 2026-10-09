'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ShipmentDraft, HandoverDraft } from '../../types/shipment-workflow';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

export function RecordHandoverDialog({ shipment, initial, onClose, onSave }: { shipment: ShipmentDraft; initial: HandoverDraft | null; onClose: () => void; onSave: (value: HandoverDraft) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [time, setTime] = useState(initial?.timestampRaw ?? '');
  const [attachment, setAttachment] = useState<File | null>(initial?.attachment ?? null);
  const [fileError, setFileError] = useState(''), [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState('');
  const outsideWindow = Boolean(time && (time < shipment.start || time > shipment.end));
  useEffect(() => {
    const node = dialog.current, previous = document.activeElement, overflow = document.body.style.overflow;
    node?.showModal(); document.body.style.overflow = 'hidden';
    return () => { node?.close(); document.body.style.overflow = overflow; if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => {
    if (!attachment) return;
    const url = URL.createObjectURL(attachment); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget), problems: Record<string, string> = {};
    const get = (key: string) => String(values.get(key) ?? '').trim();
    for (const [key, label] of [['location', 'Địa điểm'], ['fromParty', 'Bên giao'], ['toParty', 'Bên nhận'], ['sender', 'Người giao'], ['receiver', 'Người nhận']]) if (!get(key)) problems[key] = `${label}: cần nhập thông tin.`;
    const parsed = new Date(`${time}:00+07:00`);
    if (!time || Number.isNaN(parsed.getTime())) problems.time = 'Cần nhập thời gian bàn giao hợp lệ.';
    if (fileError) problems.attachment = fileError;
    setErrors(problems);
    if (!Object.keys(problems).length) onSave({ timestampRaw: time, timestampUtc: parsed.toISOString(), location: get('location'), fromParty: get('fromParty'), toParty: get('toParty'), sender: get('sender'), receiver: get('receiver'), reference: get('reference'), notes: get('handoverNotes'), attachment, origin: 'SYNTHETIC' });
  };
  return <dialog ref={dialog} className="handover-dialog" aria-labelledby="handover-title" aria-describedby="handover-description" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="logger-heading"><div><h2 id="handover-title">Ghi nhận bàn giao</h2><p id="handover-description">Lô {shipment.lot} · Mô phỏng · Chưa lưu trên server</p></div><Button onClick={onClose} aria-label="Đóng biểu mẫu bàn giao">Đóng</Button></div>
    <form id="handover-form" noValidate onSubmit={submit} className="handover-body" onChange={event => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.name && errors[target.name]) setErrors(values => { const next = { ...values }; delete next[target.name]; return next; });
    }}>
      <Alert title="Dữ liệu mô phỏng">Chỉ nhập thông tin thử nghiệm. Dữ liệu và tài liệu chỉ ở phiên mở ứng dụng; tải lại trang sẽ mất.</Alert>
      {Object.keys(errors).length > 0 && <Alert tone="error" title="Kiểm tra thông tin bàn giao"><ul>{Object.values(errors).map(error => <li key={error}>{error}</li>)}</ul></Alert>}
      {outsideWindow && <Alert tone="warning" title="Ngoài khung giờ">Thời gian bàn giao nằm ngoài khung giờ đã nhập ({shipment.start.replace('T', ' ')} – {shipment.end.replace('T', ' ')} UTC+7). Kiểm tra lại; cảnh báo này không phải kết luận nghiệp vụ.</Alert>}
      <div className="handover-grid">
        <label className="field">Thời gian bàn giao (UTC+7) *<input name="time" aria-label="Thời gian bàn giao" type="datetime-local" autoFocus required value={time} onChange={event => setTime(event.target.value)} aria-invalid={Boolean(errors.time)} />{errors.time && <small className="field-error">{errors.time}</small>}</label>
        <label className="field">Địa điểm *<input name="location" aria-label="Địa điểm bàn giao" defaultValue={initial?.location ?? ''} required maxLength={200} aria-invalid={Boolean(errors.location)} />{errors.location && <small className="field-error">{errors.location}</small>}</label>
        {([['fromParty', 'Bên giao'], ['toParty', 'Bên nhận'], ['sender', 'Người giao'], ['receiver', 'Người nhận']] as const).map(([name, label]) => <label key={name} className="field">{label} *<input name={name} aria-label={label} required defaultValue={initial?.[name] ?? ''} maxLength={120} aria-invalid={Boolean(errors[name])} />{errors[name] && <small className="field-error">{errors[name]}</small>}</label>)}
        <label className="field span-full">Mã vận đơn / tham chiếu<input name="reference" defaultValue={initial?.reference ?? shipment.reference} maxLength={100} /></label>
        <label className="field span-full">Ghi chú kiểm tra và bàn giao<textarea name="handoverNotes" defaultValue={initial?.notes ?? ''} rows={3} maxLength={500} /></label>
      </div>
      <section className="handover-evidence"><h3>Tài liệu bàn giao</h3><p>PDF, PNG hoặc JPG · Tối đa 15 MB · Chỉ xem tại trình duyệt, chưa upload.</p><label className="field">Chọn tài liệu<input ref={fileInput} name="attachment" type="file" accept=".pdf,.png,.jpg,.jpeg" aria-label="Chọn tài liệu bàn giao" onChange={event => {
        const file = event.target.files?.[0];
        if (!file) return;
        const valid = /\.(pdf|png|jpe?g)$/i.test(file.name) && ['application/pdf', 'image/png', 'image/jpeg'].includes(file.type);
        if (!valid || file.size > 15 * 1024 * 1024) { setFileError('Chọn PDF, PNG hoặc JPG không quá 15 MB.'); event.target.value = ''; return; }
        setFileError(''); setAttachment(file);
      }} /></label>{fileError && <p role="alert" className="field-error">{fileError}</p>}
      {attachment && <div className="attachment-row"><span className="number">{attachment.name} · {(attachment.size / 1024).toFixed(1)} KB</span><div className="actions">{preview && <a href={preview} target="_blank" rel="noreferrer" className="button">Xem tài liệu</a>}<Button onClick={() => { setAttachment(null); setFileError(''); setPreview(''); if (fileInput.current) fileInput.current.value = ''; }}>Bỏ tài liệu</Button></div></div>}
      </section>
    </form>
    <div className="logger-footer"><p>Chưa ghi audit hoặc xác thực chữ ký.</p><div className="actions"><Button onClick={onClose}>Hủy bàn giao</Button><Button primary type="submit" form="handover-form">Lưu bàn giao vào form</Button></div></div>
  </dialog>;
}

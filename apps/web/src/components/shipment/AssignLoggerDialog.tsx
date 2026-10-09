'use client';
import { useEffect, useRef, useState } from 'react';
import type { SetupDevice } from '../../types/shipment-setup';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

const calibrationLabels = { VALID: 'Còn hạn', DUE: 'Sắp đến hạn', EXPIRED: 'Hết hạn' };
const availabilityLabels = { AVAILABLE: 'Có thể sử dụng', ASSIGNED: 'Đã gán', UNAVAILABLE: 'Không khả dụng' };

export function AssignLoggerDialog({ devices, selected, onClose, onConfirm }: { devices: SetupDevice[]; selected: string[]; onClose: () => void; onConfirm: (ids: string[]) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(selected);
  const [query, setQuery] = useState(''), [manufacturer, setManufacturer] = useState('');
  const [calibration, setCalibration] = useState(''), [availability, setAvailability] = useState('');
  const visible = devices.filter(device => `${device.id} ${device.serial} ${device.model}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) && (!manufacturer || device.manufacturer === manufacturer) && (!calibration || device.calibrationStatus === calibration) && (!availability || device.availability === availability));
  const eligible = visible.filter(device => device.allocationAllowed);
  const allChecked = eligible.length > 0 && eligible.every(device => draft.includes(device.id));
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    node?.showModal();
    document.body.style.overflow = 'hidden';
    const shortcut = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); search.current?.focus(); } };
    node?.addEventListener('keydown', shortcut);
    return () => { node?.removeEventListener('keydown', shortcut); node?.close(); document.body.style.overflow = oldOverflow; if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = !allChecked && eligible.some(device => draft.includes(device.id)); }, [draft, eligible, allChecked]);
  const toggle = (id: string, checked: boolean) => setDraft(values => checked ? [...new Set([...values, id])] : values.filter(value => value !== id));
  return <dialog ref={dialog} className="logger-dialog logger-drawer" aria-labelledby="logger-title" aria-describedby="logger-description" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="logger-heading"><div><h2 id="logger-title">Gán thiết bị đo nhiệt độ</h2><span className="badge">Kho thiết bị: {devices.length}</span><p id="logger-description">Mô phỏng · Chọn thiết bị cho form Shipment; chưa ghi lên server.</p></div><Button onClick={onClose} aria-label="Đóng hộp thoại">Đóng</Button></div>
    <div className="logger-filters">
      <label className="field logger-search">Tìm thiết bị<div className="logger-search-control"><input ref={search} autoFocus aria-label="Tìm thiết bị" aria-keyshortcuts="Control+k Meta+k" value={query} onChange={event => setQuery(event.target.value)} placeholder="Mã thiết bị, serial, model…" /><kbd>Ctrl / ⌘ K</kbd></div></label>
      <label className="field">Nhà sản xuất<select value={manufacturer} onChange={event => setManufacturer(event.target.value)}><option value="">Tất cả nhà sản xuất</option>{[...new Set(devices.map(device => device.manufacturer))].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="field">Hiệu chuẩn<select aria-label="Bộ lọc hiệu chuẩn" value={calibration} onChange={event => setCalibration(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(calibrationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field">Khả dụng<select value={availability} onChange={event => setAvailability(event.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(availabilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    </div>
    <div className="logger-count" aria-live="polite"><p>Hiển thị {visible.length} / {devices.length} thiết bị · Có thể chọn: {eligible.length} · Đã chọn: {draft.length}</p><p className="logger-lock-count">Không được phép chọn: {visible.filter(device => !device.allocationAllowed).length}</p></div>
    <div className="table-scroll logger-table"><table><thead><tr><th><input ref={selectAll} type="checkbox" aria-label="Chọn tất cả thiết bị khả dụng đang hiển thị" disabled={!eligible.length} checked={allChecked} onChange={event => { const ids = eligible.map(device => device.id); setDraft(values => event.target.checked ? [...new Set([...values, ...ids])] : values.filter(id => !ids.includes(id))); }} /></th>{['Thiết bị', 'Serial', 'Nhà sản xuất / Model', 'Hiệu chuẩn', 'Gán / lưu giữ', 'Trạng thái'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>
      {visible.map(device => <tr key={device.id} className={draft.includes(device.id) ? 'logger-selected' : ''}><td><input type="checkbox" aria-label={`Chọn ${device.id}`} checked={draft.includes(device.id)} disabled={!device.allocationAllowed} onChange={event => toggle(device.id, event.target.checked)} /></td><td className="number">{device.id}<small className="logger-reason">Mô phỏng</small></td><td className="number">{device.serial}</td><td><strong>{device.manufacturer}</strong><small className="logger-reason">{device.model}</small></td><td className="logger-calibration">{device.calibrationValidUntil && <span className="number">{device.calibrationValidUntil}</span>}<span className={`badge tone-${device.calibrationStatus === 'EXPIRED' ? 'danger' : device.calibrationStatus === 'DUE' ? 'warning' : 'success'}`}>{calibrationLabels[device.calibrationStatus]}</span></td><td>{device.assignmentLabel}{device.locationLabel && <small className="logger-reason">{device.locationLabel}</small>}{device.allocationReason && <small className="logger-reason">{device.allocationReason}</small>}</td><td><span className={`badge tone-${device.availability === 'AVAILABLE' ? 'success' : 'neutral'}`}>{availabilityLabels[device.availability]}</span></td></tr>)}
      {!visible.length && <tr><td colSpan={7}>Không có thiết bị khớp bộ lọc.</td></tr>}
    </tbody></table></div>
    {!devices.length && <Alert>Chưa có thiết bị để gán.</Alert>}
    <p className="logger-provenance">Nguồn: fixture SYNTHETIC · Chưa ghi audit trên server.</p>
    <div className="logger-footer"><div className="logger-selection"><strong>Đã chọn ({draft.length})</strong><div className="logger-chips">{draft.map(id => <span className="badge" key={id}>{id}<button type="button" aria-label={`Bỏ chọn ${id}`} onClick={() => toggle(id, false)}>×</button></span>)}</div></div><div className="actions"><Button onClick={onClose}>Hủy lựa chọn</Button><Button primary onClick={() => onConfirm(draft.filter(id => devices.some(device => device.id === id && device.allocationAllowed)))}>Gán {draft.length} thiết bị vào form</Button></div></div>
  </dialog>;
}

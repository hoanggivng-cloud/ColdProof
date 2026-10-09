'use client';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import type { ProfileRow } from '../../types/profiles';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { ProfileSourceBadge } from './ProfileSourceBadge';

const value = (item: number | null, unit = '') => item === null ? 'Chưa có' : `${item}${unit}`;

export function ProfileDetailDrawer({ profile, onClose }: { profile: ProfileRow; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    const oldOverflow = document.body.style.overflow;
    node?.showModal();
    document.body.style.overflow = 'hidden';
    return () => { node?.close(); document.body.style.overflow = oldOverflow; if (previous instanceof HTMLElement) previous.focus(); };
  }, []);
  const inForm = profile.source !== 'SERVER_BATCH';
  return <dialog ref={dialog} className="logger-dialog logger-drawer" aria-labelledby="profile-title" aria-describedby="profile-description" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="logger-heading"><div><h2 id="profile-title">Profile {profile.id}</h2><div className="actions"><ProfileSourceBadge source={profile.source} /></div><p id="profile-description">{profile.label ?? 'Profile lấy từ lô trên server; server chưa trả tên profile.'}</p></div><Button onClick={onClose} aria-label="Đóng hộp thoại">Đóng</Button></div>
    <div className="report-body">
      <div className="report-summary"><div><small>Ngưỡng dưới</small><strong>{value(profile.lower, '°C')}</strong></div><div><small>Ngưỡng trên</small><strong>{value(profile.upper, '°C')}</strong></div><div><small>Lô trên server</small><strong>{profile.batchIds.length}</strong></div></div>
      <section><h3>1. Ngưỡng nhiệt</h3><dl className="report-meta"><div><dt>Mã profile</dt><dd className="number">{profile.id}</dd></div><div><dt>Khoảng cho phép</dt><dd className="number">{profile.lower !== null && profile.upper !== null ? `${profile.lower}°C – ${profile.upper}°C` : 'Chưa có'}</dd></div><div><dt>Cách so ngưỡng</dt><dd>Vượt khi nhỏ hơn ngưỡng dưới hoặc lớn hơn ngưỡng trên; bằng đúng ngưỡng không tính là vượt.</dd></div><div><dt>Thời lượng theo profile demo</dt><dd className="number">{value(profile.durationMinutes, ' phút')}</dd></div></dl><p>Backend đánh giá sự cố; QA quyết định. Giao diện không dùng profile để kết luận lô đạt/không đạt.</p></section>
      <section><h3>2. Lô trên server dùng profile</h3>{profile.batchIds.length ? <ul className="profile-batches">{profile.batchIds.map(id => <li key={id}><Link className="number" href={`/batches/${encodeURIComponent(id)}`}>{id}</Link></li>)}</ul> : <p>Chưa có lô trên server dùng mã profile này.</p>}</section>
      {!inForm && <Alert tone="warning" title="Chưa đồng bộ">Profile này có trên server nhưng không có trong danh sách form Tạo Shipment, nên chưa chọn được khi tạo Shipment.</Alert>}
      {profile.source === 'FORM_FIXTURE' && <Alert>Profile mẫu chỉ có trong form frontend (mô phỏng); server chưa có lô nào dùng mã này.</Alert>}
    </div>
    <div className="logger-footer"><p>Chưa có API tạo hoặc sửa profile. Thay đổi profile phải qua backend.</p><div className="actions"><Button onClick={onClose}>Đóng</Button>{inForm && <Button primary href={`/batches/new?profile=${encodeURIComponent(profile.id)}`}>Tạo Shipment với profile này</Button>}</div></div>
  </dialog>;
}

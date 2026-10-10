'use client';
import { useEffect, useState } from 'react';
import { readRecords, writeRecord, type ApiRecord } from '../services/api-client';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
export function AdminUsers() {
  const [users, setUsers] = useState<ApiRecord[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState('');
  const reload = () => readRecords('users').then(setUsers).catch(e => setError(String(e)));
  useEffect(() => { void reload(); }, []);
  const update = async (id: string, payload: unknown) => { setBusy(id); setError(''); try { await writeRecord(`users/${id}`, 'PATCH', payload); await reload(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(''); } };
  return <section className="panel"><h2>Tài khoản và quyền truy cập</h2>{error && <Alert tone="error">{error}</Alert>}<table><thead><tr><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{users.map(u => <tr key={String(u.id)}><td>{String(u.email)}</td><td><select aria-label={`Vai trò ${u.email}`} disabled={busy === u.id} value={String(u.role)} onChange={e => void update(String(u.id), { role: e.target.value })}>{['OPERATOR', 'QA_REVIEWER', 'ADMIN'].map(r => <option key={r}>{r}</option>)}</select></td><td>{u.active ? 'Hoạt động' : 'Đã khóa'}</td><td><Button disabled={busy === u.id} onClick={() => void update(String(u.id), { active: !u.active })}>{u.active ? 'Khóa' : 'Mở khóa'}</Button></td></tr>)}</tbody></table></section>;
}

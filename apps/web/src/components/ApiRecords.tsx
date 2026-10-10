'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { readRecords, type ApiRecord } from '../services/api-client';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Table } from './ui/Table';
import { OriginBadge } from './OriginBadge';
import { BatchStatusBadge } from './BatchStatusBadge';

const formatCell = (value: unknown) => {
  if (value === null || value === undefined) return 'Chưa có';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (Array.isArray(value)) return `${value.length} mục`;
  return 'Xem thông tin chi tiết';
};
const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });

const SKELETON_WIDTHS = ['68%', '82%', '56%', '74%', '60%'];

/** Read-only table of API rows. Loading, error (with retry), empty and data-warning states are rendered here. */
export function ApiRecords({ path, columns, label, batchLinks = false, collection, linkColumn, emptyText = 'Chưa có dữ liệu.', warning }: {
  path: string; columns: [string, string][]; label?: string; batchLinks?: boolean; collection?: string;
  linkColumn?: { key: string; href: (value: string) => string }; emptyText?: string; warning?: (rows: ApiRecord[]) => string | null;
}) {
  const [state, setState] = useState<{ rows: ApiRecord[]; error: string; loading: boolean }>({ rows: [], error: '', loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let isMounted = true;
    readRecords(path).then(rows => {
      if (!isMounted) return;
      if (collection) {
        const items = rows[0]?.[collection];
        if (!Array.isArray(items) || !items.every(value => typeof value === 'object' && value !== null && !Array.isArray(value))) throw new Error('Dữ liệu API không đúng định dạng.');
        rows = items as ApiRecord[];
      }
      setState({ rows, error: '', loading: false });
    }).catch((error: unknown) => {
      if (!isMounted) return;
      setState({ rows: [], error: error instanceof Error ? error.message : 'Không tải được dữ liệu.', loading: false });
    });
    return () => { isMounted = false; };
  }, [path, attempt, collection]);
  const retry = () => { setState({ rows: [], error: '', loading: true }); setAttempt(value => value + 1); };
  if (state.loading) {
    return (
      <Table label={label}>
        <thead>
          <tr>
            {columns.map(([key, text]) => (
              <th key={key} scope="col">{text}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...Array(5)].map((_, i) => (
            <tr key={i}>
              {columns.map(([key], colIdx) => (
                <td key={key}>
                  <div className="skeleton" style={{ height: '20px', width: SKELETON_WIDTHS[(i + colIdx) % SKELETON_WIDTHS.length] }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    );
  }
  const numeric = new Set(columns.map(([key]) => key).filter(key => state.rows.some(row => typeof row[key] === 'number')));
  const message = state.rows.length && warning ? warning(state.rows) : null;
  const link = linkColumn ?? (batchLinks ? { key: 'id', href: (value: string) => `/batches/${encodeURIComponent(value)}` } : undefined);
  return <>
    {state.error && <Alert tone="error" title="Không tải được dữ liệu">{state.error}<div className="actions"><Button onClick={retry}>Thử lại</Button></div></Alert>}
    {message && <Alert tone="warning">{message}</Alert>}
    <Table label={label}><thead><tr>{columns.map(([key, text]) => <th key={key} scope="col" className={numeric.has(key) ? 'number' : undefined}>{text}</th>)}</tr></thead><tbody>{state.rows.length ? state.rows.map((row, index) => <tr key={typeof row.id === 'string' ? row.id : index}>{columns.map(([key]) => {
      const value = row[key];
      const content = link && key === link.key && typeof value === 'string' ? <Link href={link.href(value)} className="number">{value}</Link>
        : (key === 'origin' || key === 'business_context_origin' || key === 'measurement_origin') && (value === 'SYNTHETIC' || value === 'DERIVED' || value === 'REAL_PUBLIC_DATA') ? <OriginBadge origin={value} />
        : key === 'status' && typeof value === 'string' ? <BatchStatusBadge status={value} />
        : (key.endsWith('_at') || key === 'timestamp') && typeof value === 'string' && Number.isFinite(Date.parse(value)) ? <time dateTime={value}>{time.format(new Date(value))}</time>
        : formatCell(value);
      return <td key={key} className={numeric.has(key) ? 'number' : undefined}>{content}</td>;
    })}</tr>) : <tr><td colSpan={columns.length}><div className="empty-state"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="empty-icon"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="m9 16 3-3 3 3"/></svg><p>{state.error ? 'Lỗi tải dữ liệu.' : emptyText}</p></div></td></tr>}</tbody></Table>
  </>;
}

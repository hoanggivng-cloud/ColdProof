import { readRecords, type ApiRecord } from './api-client';
import type { QAException, QAReview, QAQueueData } from '../types/qa-queue';
const required = (row: ApiRecord, key: string) => { const value = row[key]; if (typeof value !== 'string' || !value) throw new Error('Dữ liệu QA từ server thiếu trường bắt buộc.'); return value; };
function exception(row: ApiRecord): QAException {
  if (!Array.isArray(row.record_ids) || !row.record_ids.every(value => typeof value === 'string')) throw new Error('Tham chiếu số đo của sự cố không đúng định dạng.');
  return { id: required(row, 'id'), batch_id: required(row, 'batch_id'), profile_id: typeof row.profile_id === 'string' ? row.profile_id : null, status: required(row, 'status'), record_ids: row.record_ids, created_at: required(row, 'created_at') };
}
function review(row: ApiRecord): QAReview { return { id: required(row, 'id'), exception_id: required(row, 'exception_id'), reviewer_id: required(row, 'reviewer_id'), status: required(row, 'status'), notes: typeof row.notes === 'string' ? row.notes : null, created_at: required(row, 'created_at') }; }
export async function getQAQueue(signal?: AbortSignal): Promise<QAQueueData> {
  const [items, reviews] = await Promise.all([readRecords('exceptions', signal), readRecords('qa-reviews', signal)]);
  return { exceptions: items.map(exception), reviews: reviews.map(review) };
}
export async function getQAException(id: string, signal?: AbortSignal): Promise<QAQueueData> {
  const [items, reviews] = await Promise.all([readRecords(`exceptions/${encodeURIComponent(id)}`, signal), readRecords('qa-reviews', signal)]);
  return { exceptions: items.map(exception), reviews: reviews.map(review).filter(item => item.exception_id === id) };
}
export function queueCSV(rows: QAException[]): string {
  const cell = (value: string) => `"${(/^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  return '\uFEFF' + [['exception_id', 'batch_id', 'profile_id', 'status', 'created_at'], ...rows.map(row => [row.id, row.batch_id, row.profile_id ?? '', row.status, row.created_at])].map(row => row.map(cell).join(',')).join('\r\n');
}

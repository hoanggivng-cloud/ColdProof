'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { getQAException } from '../../services/qa-queue';
import { writeRecord } from '../../services/api-client';
import type { QAQueueData } from '../../types/qa-queue';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { Table } from '../ui/Table';
import { Field } from '../ui/Field';
import { WorkflowProgress } from '../shipment/ShipmentWorkflow';
import { PageHeader } from '../layout/PageHeader';
import { BatchStatusBadge } from '../BatchStatusBadge';
const time = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
export function QAExceptionDetail({ id }: { id: string }) {
  const [state, setState] = useState<{ data: QAQueueData | null; error: string; loading: boolean }>({ data: null, error: '', loading: true });
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const loadData = () => {
    const controller = new AbortController(); 
    getQAException(id, controller.signal).then(data => { 
        if (!controller.signal.aborted) setState({ data, error: '', loading: false }); 
    }).catch((error: unknown) => { 
        if (!controller.signal.aborted) setState({ data: null, loading: false, error: error instanceof Error ? error.message : 'Không tải được sự cố.' }); 
    }); 
    return controller;
  };

  useEffect(() => { 
    const controller = loadData();
    return () => controller.abort(); 
  }, [id, attempt]);

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    const values = new FormData(event.currentTarget);
    const action = String(values.get('action'));
    const notes = String(values.get('notes') ?? '').trim();

    try {
      await writeRecord(`exceptions/${id}/review`, 'POST', { action, notes });
      loadData();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Không thể gửi đánh giá QA.');
    } finally {
      setSubmitting(false);
    }
  };

  const item = state.data?.exceptions[0];
  return <><PageHeader title="Chi tiết sự cố" breadcrumb={[{ href: '/qa', label: 'QA' }, { label: id }]} description="Đối chiếu sự cố với số đo của lô trước khi ghi nhận." meta={[<span key="id" className="number">{id}</span>]}><Button href="/qa">Về hàng đợi QA</Button><Button href="/reports">Tiếp tục: Hồ sơ bằng chứng</Button></PageHeader>
    <WorkflowProgress current={5} batchId={item?.batch_id} />
    {state.loading ? <p role="status">Đang tải sự cố…</p> : state.error ? <Alert tone="error" title="Không tải được sự cố">{state.error}<div className="actions"><Button onClick={() => { setState({ data: null, error: '', loading: true }); setAttempt(value => value + 1); }}>Thử lại</Button></div></Alert> : !item ? <p>Chưa có thông tin sự cố.</p> : <>
      {!item.record_ids.length && <Alert tone="warning">Sự cố chưa có tham chiếu số đo; không đối chiếu được với chuỗi nhiệt độ.</Alert>}
      <Panel title="Thông tin sự cố"><dl className="workflow-summary"><dt>Lô</dt><dd className="number">{item.batch_id}</dd><dt>Profile</dt><dd className="number">{item.profile_id ?? 'Chưa có'}</dd><dt>Trạng thái server</dt><dd><BatchStatusBadge status={item.status} /></dd><dt>Tham chiếu số đo</dt><dd className="number">{item.record_ids.join(', ') || 'Chưa có tham chiếu'}</dd></dl><div className="form-footer"><span /><Button primary href={`/batches/${encodeURIComponent(item.batch_id)}`}>Xem số đo và bằng chứng của lô</Button></div></Panel>
      <Panel title="Đánh giá QA">
          <form noValidate onSubmit={submitReview}>
            <div className="form-grid">
                <Field id="review-action" label="Quyết định">
                    <select id="review-action" name="action" required disabled={submitting}>
                        <option value="ACKNOWLEDGE">Ghi nhận (ACKNOWLEDGE)</option>
                        <option value="ESCALATE">Leo thang (ESCALATE)</option>
                    </select>
                </Field>
                <Field id="review-notes" label="Ghi chú / Hành động khắc phục" className="span-full">
                    <textarea id="review-notes" name="notes" rows={3} maxLength={500} required disabled={submitting} />
                </Field>
            </div>
            {submitError && <Alert tone="error">{submitError}</Alert>}
            <div className="form-footer mt-4">
                <Button type="submit" primary disabled={submitting}>{submitting ? 'Đang gửi...' : 'Gửi đánh giá'}</Button>
            </div>
          </form>
      </Panel>
      <Panel title="Lịch sử ghi nhận QA">{!state.data?.reviews.length ? <p>Chưa có ghi nhận QA cho sự cố này.</p> : <Table label="Lịch sử ghi nhận QA"><thead><tr>{['Review', 'Người ghi nhận', 'Trạng thái', 'Ghi chú', 'Thời gian (UTC+7)'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{state.data.reviews.map(review => <tr key={review.id}><td className="number">{review.id}</td><td className="number">{review.reviewer_id}</td><td><BatchStatusBadge status={review.status} /></td><td>{review.notes ?? 'Chưa có ghi chú'}</td><td className="number"><time dateTime={review.created_at}>{Number.isFinite(Date.parse(review.created_at)) ? time.format(new Date(review.created_at)) : review.created_at}</time></td></tr>)}</tbody></Table>}</Panel>
    </>}</>;
}

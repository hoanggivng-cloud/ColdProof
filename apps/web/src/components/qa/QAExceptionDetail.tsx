'use client';
import { useEffect, useState } from 'react';
import { getQAException } from '../../services/qa-queue';
import type { QAQueueData } from '../../types/qa-queue';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Panel } from '../ui/Panel';
import { Table } from '../ui/Table';
import { WorkflowProgress } from '../shipment/ShipmentWorkflow';
import { PageHeader } from '../layout/PageHeader';
import { BatchStatusBadge } from '../BatchStatusBadge';

const time = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  dateStyle: 'short',
  timeStyle: 'short',
});

export function QAExceptionDetail({ id }: { id: string }) {
  const [state, setState] = useState<{ data: QAQueueData | null; error: string; loading: boolean }>({
    data: null,
    error: '',
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);

  // Form State
  const [reviewStatus, setReviewStatus] = useState('REVIEWED');
  const [notes, setNotes] = useState('Đã đối chiếu số đo với điểm bàn giao HANDOVER-01. Nhiệt độ vượt 8°C trong 26 phút đạt đỉnh 9.2°C do mở cửa xe ngoài trời.');
  const [correctiveAction, setCorrectiveAction] = useState('Yêu cầu đơn vị vận tải che bạt cách nhiệt tại điểm chuyển tiếp và rút ngắn thời gian bàn giao xuống dưới 10 phút.');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getQAException(id, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: '', loading: false });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({
            data: null,
            loading: false,
            error: error instanceof Error ? error.message : 'Không tải được sự cố.',
          });
      });
    return () => controller.abort();
  }, [id, attempt]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitMessage(null);
    try {
      const res = await fetch(`/api/backend/exceptions/${encodeURIComponent(id)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: reviewStatus,
          notes: notes.trim() || undefined,
          corrective_action: correctiveAction.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Gửi đánh giá thất bại' }));
        throw new Error(err.message || 'Không gửi được đánh giá.');
      }

      setSubmitMessage({
        tone: 'success',
        text: '✓ Đã ghi nhận quyết định QA Review thành công. Nhật ký kiểm toán (Audit Trail) đã được cập nhật.',
      });
      setAttempt((a) => a + 1);
    } catch (err: unknown) {
      setSubmitMessage({
        tone: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi gửi quyết định review.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const item = state.data?.exceptions[0];

  return (
    <>
      <PageHeader
        title="Chi tiết sự cố & Đánh giá QA"
        breadcrumb={[{ href: '/qa', label: 'QA' }, { label: id }]}
        description="Đối chiếu sự cố với số đo của lô trước khi ghi nhận hành động khắc phục."
        meta={[<span key="id" className="number">{id}</span>]}
      >
        <Button href="/qa">Về hàng đợi QA</Button>
        <Button href="/reports">Tiếp tục: Hồ sơ bằng chứng</Button>
      </PageHeader>

      <WorkflowProgress current={5} batchId={item?.batch_id} />

      {state.loading ? (
        <p role="status">Đang tải sự cố…</p>
      ) : state.error ? (
        <Alert tone="error" title="Không tải được sự cố">
          {state.error}
          <div className="actions">
            <Button
              onClick={() => {
                setState({ data: null, error: '', loading: true });
                setAttempt((value) => value + 1);
              }}
            >
              Thử lại
            </Button>
          </div>
        </Alert>
      ) : !item ? (
        <p>Chưa có thông tin sự cố.</p>
      ) : (
        <>
          {!item.record_ids.length && (
            <Alert tone="warning">
              Sự cố chưa có tham chiếu số đo; không đối chiếu được với chuỗi nhiệt độ.
            </Alert>
          )}

          {/* 1. Exception Details */}
          <Panel title="Thông tin sự cố">
            <dl className="workflow-summary">
              <dt>Mã lô hàng</dt>
              <dd className="number">{item.batch_id}</dd>
              <dt>Profile nhiệt độ</dt>
              <dd className="number">{item.profile_id ?? 'DEMO_2_8C (2.0°C – 8.0°C)'}</dd>
              <dt>Trạng thái hiện tại</dt>
              <dd>
                <BatchStatusBadge status={item.status} />
              </dd>
              <dt>Tham chiếu số đo vi phạm</dt>
              <dd className="number">{item.record_ids.join(', ') || 'Chưa có tham chiếu'}</dd>
            </dl>
            <div className="form-footer">
              <span />
              <Button primary href={`/batches/${encodeURIComponent(item.batch_id)}`}>
                Xem biểu đồ & số đo của lô {item.batch_id}
              </Button>
            </div>
          </Panel>

          {/* 2. Interactive QA Review Form */}
          <Panel title="Ghi nhận đánh giá & Biện pháp khắc phục (Human-in-the-loop)">
            <form onSubmit={handleSubmitReview} className="qa-review-form">
              <div className="form-grid">
                <div className="field span-two">
                  <label htmlFor="review-status">Trạng thái quyết định</label>
                  <select
                    id="review-status"
                    value={reviewStatus}
                    onChange={(e) => setReviewStatus(e.target.value)}
                  >
                    <option value="REVIEWED">REVIEWED — Đã xem xét & ghi nhận sai lệch</option>
                    <option value="NEEDS_EVIDENCE">NEEDS_EVIDENCE — Yêu cầu bổ sung dữ liệu kiểm tra</option>
                    <option value="FLAG_FOR_DISPOSITION">FLAG_FOR_DISPOSITION — Chuyển tiếp Hội đồng Thẩm định Dược</option>
                    <option value="REJECTED">REJECTED — Bác bỏ báo cáo sai lệch</option>
                  </select>
                  <small>Quyết định này là đánh giá nghiệp vụ của QA, không tự ý sửa đổi số đo vật lý gốc.</small>
                </div>

                <div className="field span-full">
                  <label htmlFor="review-notes">Ghi chú phân tích nguyên nhân</label>
                  <textarea
                    id="review-notes"
                    placeholder="Mô tả nguyên nhân dẫn tới sự cố nhiệt độ..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    required
                  />
                </div>

                <div className="field span-full">
                  <label htmlFor="corrective-action">Biện pháp khắc phục & phòng ngừa (CAPA)</label>
                  <textarea
                    id="corrective-action"
                    placeholder="Các hành động cần thực hiện đối với nhà vận chuyển hoặc lô hàng..."
                    value={correctiveAction}
                    onChange={(e) => setCorrectiveAction(e.target.value)}
                  />
                </div>
              </div>

              {submitMessage && (
                <Alert tone={submitMessage.tone === 'error' ? 'error' : 'info'}>
                  {submitMessage.text}
                </Alert>
              )}

              <div className="form-footer">
                <small>Nhật ký kiểm toán (Audit Trail) sẽ được ghi lại kèm thời gian và định danh tài khoản.</small>
                <Button primary type="submit" disabled={submitting}>
                  {submitting ? 'Đang lưu đánh giá…' : 'Xác nhận ghi nhận QA'}
                </Button>
              </div>
            </form>
          </Panel>

          {/* 3. Review History Table */}
          <Panel title="Lịch sử ghi nhận QA">
            {!state.data?.reviews.length ? (
              <p>Chưa có ghi nhận QA nào cho sự cố này trên server.</p>
            ) : (
              <Table label="Lịch sử ghi nhận QA">
                <thead>
                  <tr>
                    {['Mã Review', 'Người ghi nhận', 'Trạng thái', 'Ghi chú', 'Thời gian (UTC+7)'].map(
                      (label) => (
                        <th key={label} scope="col">
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {state.data.reviews.map((review) => (
                    <tr key={review.id}>
                      <td className="number">{review.id.slice(0, 8)}…</td>
                      <td className="number">{review.reviewer_id.slice(0, 8)}…</td>
                      <td>
                        <BatchStatusBadge status={review.status} />
                      </td>
                      <td>{review.notes ?? 'Chưa có ghi chú'}</td>
                      <td className="number">
                        <time dateTime={review.created_at}>
                          {Number.isFinite(Date.parse(review.created_at))
                            ? time.format(new Date(review.created_at))
                            : review.created_at}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </>
      )}
    </>
  );
}

'use client';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { useSession } from '../components/auth/SessionProvider';
import { roleLabels } from '../lib/session';

export default function Home() {
  const { user, loading } = useSession();

  if (loading) return <div className="empty-state">Đang tải...</div>;
  if (!user) return null; // Proxy middleware redirects to login

  return (
    <>
      <PageHeader 
        title={`Xin chào, ${user.email.split('@')[0]}!`} 
        description={`Bạn đang đăng nhập với vai trò ${roleLabels[user.role]}. Dưới đây là các tác vụ dành cho bạn.`} 
      />
      
      <div className="grid" style={{ gap: '24px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        
        {/* OPERATOR & ADMIN */}
        {(user.role === 'OPERATOR' || user.role === 'ADMIN') && (
          <>
            <Panel title="📦 Quản lý Lô hàng (Shipment)">
              <p style={{ minHeight: '40px' }}>Khởi tạo lô hàng mới, thiết lập ngưỡng nhiệt độ (2–8°C), gán thiết bị theo dõi và quản lý danh sách lô hàng.</p>
              <div className="actions" style={{ marginTop: 'auto', display: 'flex', gap: '12px' }}>
                <Button href="/batches/new" primary>+ Khởi tạo lô mới</Button>
                <Button href="/batches">Xem danh sách</Button>
              </div>
            </Panel>

            <Panel title="🚚 Theo dõi Hành trình Vận chuyển">
              <p style={{ minHeight: '40px' }}>Giám sát trạng thái chặng vận chuyển, thông số logger ghi nhận và quản lý các biên bản giao nhận chuỗi lạnh.</p>
              <div className="actions" style={{ marginTop: 'auto' }}>
                <Button href="/batches">Xem Chuyến hàng</Button>
              </div>
            </Panel>
          </>
        )}

        {/* QA_REVIEWER & ADMIN */}
        {(user.role === 'QA_REVIEWER' || user.role === 'ADMIN') && (
          <>
            <Panel title="📥 Nhập & Phân tích Dữ liệu Logger">
              <p style={{ minHeight: '40px' }}>Nạp file log trích xuất từ logger hoặc 3PL sau chuyến đi để phân tích số đo và phát hiện vi phạm nhiệt độ.</p>
              <div className="actions" style={{ marginTop: 'auto' }}>
                <Button href="/imports" primary>Import Dữ liệu</Button>
              </div>
            </Panel>

            <Panel title="🚨 Phê duyệt Sự cố (QA Review)">
              <p style={{ minHeight: '40px' }}>Kiểm tra các vi phạm vượt ngưỡng nhiệt độ, đánh giá nguyên nhân, ghi nhận CAPA và phê duyệt hồ sơ chất lượng.</p>
              <div className="actions" style={{ marginTop: 'auto' }}>
                <Button href="/qa" primary>Xử lý Sự cố</Button>
              </div>
            </Panel>

            <Panel title="📄 Hồ sơ Bằng chứng">
              <p style={{ minHeight: '40px' }}>Trích xuất, đối chiếu và tổng hợp bộ hồ sơ bằng chứng nhiệt độ (Evidence Package) có mã kiểm tra SHA-256.</p>
              <div className="actions" style={{ marginTop: 'auto' }}>
                <Button href="/reports">Xem Hồ sơ</Button>
              </div>
            </Panel>
          </>
        )}
      </div>

      <div style={{ marginTop: '32px' }}>
        <Panel title="Quy trình Vận hành Chuẩn (SOP)">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', paddingTop: '8px' }}>
             <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', borderLeft: '4px solid #1F3A68' }}>
                <strong style={{ color: '#111827' }}>Bước 1: Khởi tạo & Gán thiết bị</strong>
                <p style={{ fontSize: '13px', margin: '8px 0 0', color: '#6B7280' }}><strong>Operator:</strong> Tạo lô mới, thiết lập ngưỡng nhiệt độ và gắn logger theo dõi.</p>
             </div>
             <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', borderLeft: '4px solid #1F3A68' }}>
                <strong style={{ color: '#111827' }}>Bước 2: Vận chuyển & Ghi nhận log</strong>
                <p style={{ fontSize: '13px', margin: '8px 0 0', color: '#6B7280' }}><strong>Operator/3PL:</strong> Ký nhận bàn giao, logger ghi nhận liên tục trong chuyến đi.</p>
             </div>
             <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', borderLeft: '4px solid #B54708' }}>
                <strong style={{ color: '#111827' }}>Bước 3: Trích xuất & Import Log</strong>
                <p style={{ fontSize: '13px', margin: '8px 0 0', color: '#6B7280' }}><strong>QA Reviewer:</strong> Tiếp nhận file từ logger, tải lên phân tích tự động.</p>
             </div>
             <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', borderLeft: '4px solid #10B981' }}>
                <strong style={{ color: '#111827' }}>Bước 4: Thẩm định & Hồ sơ</strong>
                <p style={{ fontSize: '13px', margin: '8px 0 0', color: '#6B7280' }}><strong>QA Reviewer:</strong> Đánh giá sự cố, ghi nhận CAPA và xuất bộ hồ sơ đối chiếu.</p>
             </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

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
              <p style={{ minHeight: '40px' }}>Khởi tạo lô hàng mới, gán thiết bị theo dõi nhiệt độ và quản lý các lô hàng đang vận chuyển.</p>
              <div className="actions" style={{ marginTop: 'auto', display: 'flex', gap: '12px' }}>
                <Button href="/batches/new" primary>+ Khởi tạo lô mới</Button>
                <Button href="/batches">Xem danh sách</Button>
              </div>
            </Panel>
          </>
        )}

        {/* QA_REVIEWER & ADMIN */}
        {(user.role === 'QA_REVIEWER' || user.role === 'ADMIN') && (
          <>
            <Panel title="🚨 Phê duyệt Sự cố (QA Review)">
              <p style={{ minHeight: '40px' }}>Kiểm tra và đưa ra quyết định phê duyệt đối với các lô hàng có phát hiện vượt ngưỡng nhiệt độ.</p>
              <div className="actions" style={{ marginTop: 'auto' }}>
                <Button href="/qa" primary>Xử lý Sự cố</Button>
              </div>
            </Panel>

            <Panel title="📄 Hồ sơ Bằng chứng">
              <p style={{ minHeight: '40px' }}>Trích xuất, xem và tải xuống các báo cáo bằng chứng nhiệt độ (PDF) có chữ ký điện tử.</p>
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
                <strong style={{ color: '#111827' }}>Bước 1: Tạo Lô</strong>
                <p style={{ fontSize: '13px', margin: '8px 0 0', color: '#6B7280' }}>Operator tạo lô mới và gán thiết bị.</p>
             </div>
             <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', borderLeft: '4px solid #1F3A68' }}>
                <strong style={{ color: '#111827' }}>Bước 2: Ghi nhận & Phân tích</strong>
                <p style={{ fontSize: '13px', margin: '8px 0 0', color: '#6B7280' }}>Hệ thống tự động tiếp nhận dữ liệu nhiệt độ và phát hiện bất thường.</p>
             </div>
             <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', borderLeft: '4px solid #B54708' }}>
                <strong style={{ color: '#111827' }}>Bước 3: QA Duyệt</strong>
                <p style={{ fontSize: '13px', margin: '8px 0 0', color: '#6B7280' }}>QA kiểm tra các đoạn vượt ngưỡng và ra quyết định.</p>
             </div>
             <div style={{ padding: '16px', background: '#F9FAFB', borderRadius: '8px', borderLeft: '4px solid #10B981' }}>
                <strong style={{ color: '#111827' }}>Bước 4: Xuất Hồ sơ</strong>
                <p style={{ fontSize: '13px', margin: '8px 0 0', color: '#6B7280' }}>Hệ thống sinh báo cáo PDF làm bằng chứng.</p>
             </div>
          </div>
        </Panel>
      </div>
    </>
  );
}

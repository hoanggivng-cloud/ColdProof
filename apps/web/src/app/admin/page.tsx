import { PageHeader } from '../../components/layout/PageHeader';
import { RoleGate } from '../../components/auth/RoleGate';
import { ApiRecords } from '../../components/ApiRecords';
import { Alert } from '../../components/ui/Alert';

export default function Admin() { 
  return (
    <>
      <PageHeader title="Administration" description="Quản lý quyền truy cập và cấu hình hệ thống" />
      <RoleGate roles={['ADMIN']} fallback={<Alert tone="error">Bạn không có quyền truy cập trang quản trị.</Alert>}>
        <div className="panel">
          <h2>Danh sách tài khoản hệ thống</h2>
          <p>Quản lý người dùng và phân quyền (RBAC).</p>
          <ApiRecords 
            path="users" 
            label="Danh sách người dùng" 
            emptyText="Chưa có người dùng nào." 
            columns={[['id', 'UUID'], ['email', 'Email'], ['role', 'Vai trò'], ['created_at', 'Ngày tạo']]} 
          />
        </div>
      </RoleGate>
    </>
  ); 
}

import { PageHeader } from '../../components/layout/PageHeader';
import { RoleGate } from '../../components/auth/RoleGate';
import { AdminUsers } from '../../components/AdminUsers';
import { ApiRecords } from '../../components/ApiRecords';
import { Alert } from '../../components/ui/Alert';
export default function Admin() { return <><PageHeader title="Quản trị" description="Cấp quyền, khóa tài khoản và kiểm tra lịch sử thao tác" /><RoleGate roles={['ADMIN']} fallback={<Alert tone="error">Bạn không có quyền quản trị.</Alert>}><AdminUsers /><ApiRecords path="audit" label="Lịch sử thao tác" emptyText="Chưa có lịch sử" columns={[["created_at", "Thời gian"], ["action", "Hành động"], ["entity_id", "Đối tượng"]]} /></RoleGate></>; }

import { RoleGate } from '../../components/auth/RoleGate';
import { ImportWorkbench } from '../../components/imports/ImportWorkbench';
import { PageHeader } from '../../components/layout/PageHeader';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';

export default function Page() {
  return (
    <>
      <PageHeader title="Sinh dữ liệu mô phỏng" breadcrumb={[{ href: '/batches', label: 'Lô hàng' }, { label: 'Nhập dữ liệu' }]} description="Chọn kịch bản, sinh số đo và phân tích trên server.">
        <Button href="/batches">Xem danh sách lô</Button>
      </PageHeader>
      <div className="mt-6 space-y-6">
        <RoleGate roles={['OPERATOR', 'ADMIN']} fallback={<Alert tone="warning" title="Không có quyền import">Sinh dữ liệu cần vai trò Operator hoặc Admin.</Alert>}>
          <ImportWorkbench />
        </RoleGate>
      </div>
    </>
  );
}

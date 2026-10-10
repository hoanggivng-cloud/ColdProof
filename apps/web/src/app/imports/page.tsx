import { RoleGate } from '../../components/auth/RoleGate';
import { ImportWorkbench } from '../../components/imports/ImportWorkbench';
import { PageHeader } from '../../components/layout/PageHeader';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';

export default function Page() {
  return (
    <>
      <PageHeader title="Nhập Dữ liệu Logger" breadcrumb={[{ href: '/batches', label: 'Lô hàng' }, { label: 'Nhập dữ liệu' }]} description="Dành cho QA Reviewer: Nạp file logger từ thiết bị hoặc 3PL, phân tích số đo và phát hiện vi phạm nhiệt độ.">
        <Button href="/batches">Xem danh sách lô</Button>
      </PageHeader>
      <div className="mt-6 space-y-6">
        <RoleGate
          roles={['QA_REVIEWER', 'ADMIN']}
          fallback={
            <Alert tone="warning" title="Không có quyền import dữ liệu">
              Theo phân định trách nhiệm chuẩn (SOP): Operator phụ trách khởi tạo lô, gán logger và bàn giao vận chuyển tại kho. Việc trích xuất và nạp (import) file log sau chuyến hàng để thẩm định chất lượng do QA Reviewer hoặc Quản trị viên thực hiện.
            </Alert>
          }
        >
          <ImportWorkbench />
        </RoleGate>
      </div>
    </>
  );
}

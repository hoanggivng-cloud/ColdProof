import { RoleGate } from '../../components/auth/RoleGate';
import { ImportWorkbench } from '../../components/imports/ImportWorkbench';
import { PageHeader } from '../../components/layout/PageHeader';
import { ShipmentImportContext } from '../../components/shipment/ShipmentImportContext';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';

export default function Page() {
  return (
    <>
      <PageHeader title="Nhập Dữ liệu" breadcrumb={[{ href: '/batches', label: 'Lô hàng' }, { label: 'Nhập dữ liệu' }]} description="Nhập file logger, xem số đo và cờ dữ liệu.">
        <Button href="/batches">Xem danh sách lô</Button>
      </PageHeader>
      <div className="mt-6 space-y-6">
        <RoleGate roles={['QA_REVIEWER', 'ADMIN']} fallback={<Alert tone="warning" title="Không có quyền import">Import dữ liệu hiện tại (MVP) cần vai trò QA Reviewer hoặc Admin để phân tích.</Alert>}>
          <ShipmentImportContext />
          <ImportWorkbench />
        </RoleGate>
      </div>
    </>
  );
}

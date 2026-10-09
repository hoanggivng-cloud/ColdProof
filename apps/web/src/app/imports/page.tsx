import { RoleGate } from '../../components/auth/RoleGate';
import { ImportWorkbench } from '../../components/imports/ImportWorkbench';
import { PageHeader } from '../../components/layout/PageHeader';
import { ShipmentImportContext } from '../../components/shipment/ShipmentImportContext';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
export default function Page() {
  return <><PageHeader title="Import" breadcrumb={[{ href: '/batches', label: 'Lô hàng' }, { label: 'Import' }]} description="Nhập file logger, xem số đo và cờ dữ liệu."><Button href="/batches">Xem danh sách lô</Button></PageHeader>
    <RoleGate roles={['OPERATOR', 'ADMIN']} fallback={<Alert tone="warning" title="Không có quyền import">Import dữ liệu cần vai trò Operator hoặc Admin.</Alert>}><ShipmentImportContext /><ImportWorkbench /></RoleGate></>;
}

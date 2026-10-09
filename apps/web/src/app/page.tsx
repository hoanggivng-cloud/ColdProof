import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { Button } from '../components/ui/Button';
import { ApiRecords } from '../components/ApiRecords';
import { WorkflowProgress } from '../components/shipment/ShipmentWorkflow';
export default function Home() {
  return <><PageHeader title="ColdProof" description="Theo dõi dữ liệu và quy trình bằng chứng chuỗi lạnh"><Button href="/batches/new" primary>Tạo Shipment</Button></PageHeader><WorkflowProgress current={-1} /><div className="grid"><Panel title="Vận hành Shipment"><p>Tạo lô, gán thiết bị và xem dữ liệu nhiệt độ.</p><div className="actions"><Button href="/batches">Xem danh sách lô</Button><Button href="/imports">Nhập dữ liệu</Button></div></Panel><Panel title="QA & hồ sơ"><p>Xem sự cố và bằng chứng để người kiểm tra đánh giá.</p><div className="actions"><Button href="/qa">Xem QA review</Button><Button href="/reports">Xem hồ sơ</Button></div></Panel></div><section className="panel"><h2>Kết nối API server</h2><ApiRecords path="health" columns={[["status", "Trạng thái"], ["readiness", "Sẵn sàng"]]} /></section></>;
}

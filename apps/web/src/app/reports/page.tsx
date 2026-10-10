import { ReportRegistry } from '../../components/reports/ReportRegistry';
import { PageHeader } from '../../components/layout/PageHeader';

export default function Page() { 
  return (
    <>
      <PageHeader title="Hồ sơ Bằng chứng" description="Quản lý và xuất báo cáo PDF cho các lô hàng." />
      <div className="panel p-6 mt-6">
        <ReportRegistry />
      </div>
    </>
  );
}

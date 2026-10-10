import { PageHeader } from '../../components/layout/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { ApiRecords } from '../../components/ApiRecords';

export default function Sources() { 
  return (
    <>
      <PageHeader title="Nguồn Dữ liệu" description="Đọc thông tin nguồn và xuất xứ dữ liệu" />
      <div className="mt-6">
        <Panel title="Danh sách nguồn">
          <ApiRecords path="sources" columns={[["id", "Nguồn"], ["dataset", "Dataset"], ["file_name", "File"], ["origin", "Xuất xứ"]]} />
        </Panel>
      </div>
    </>
  ); 
}

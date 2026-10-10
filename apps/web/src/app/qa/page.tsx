import { QAQueue } from '../../components/qa/QAQueue';
import { PageHeader } from '../../components/layout/PageHeader';

export default function Page() { 
  return (
    <>
      <PageHeader title="Phê duyệt Sự cố" description="Kiểm tra và phê duyệt các lô hàng có sự cố nhiệt độ." />
      <div className="panel p-6 mt-6">
        <QAQueue />
      </div>
    </>
  );
}

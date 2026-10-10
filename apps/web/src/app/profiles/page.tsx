import { ProfileRegistry } from '../../components/profiles/ProfileRegistry';
import { PageHeader } from '../../components/layout/PageHeader';

export default function Page() { 
  return (
    <>
      <PageHeader title="Hồ sơ Môi trường" description="Quản lý các hồ sơ nhiệt độ chuẩn (Profiles)." />
      <div className="panel p-6 mt-6">
        <ProfileRegistry />
      </div>
    </>
  );
}

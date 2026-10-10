import { RoleGate } from '../../../components/auth/RoleGate';
import { QAExceptionDetail } from '../../../components/qa/QAExceptionDetail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <RoleGate roles={['QA_REVIEWER', 'ADMIN']}><QAExceptionDetail key={id} id={id} /></RoleGate>; }

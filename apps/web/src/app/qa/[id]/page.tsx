import { QAExceptionDetail } from '../../../components/qa/QAExceptionDetail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <QAExceptionDetail key={id} id={id} />; }

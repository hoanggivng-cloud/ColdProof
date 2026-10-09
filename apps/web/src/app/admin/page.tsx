import { PageHeader } from '../../components/layout/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
export default function Admin() { return <><PageHeader title="Administration" description="Quản lý quyền truy cập và cấu hình hệ thống" /><Panel title="Quyền truy cập"><p>Chưa nối xác thực và quản lý quyền thật vào frontend.</p><div className="actions"><Button href="/login">Đăng nhập</Button><Button href="/register">Đăng ký</Button></div></Panel></>; }

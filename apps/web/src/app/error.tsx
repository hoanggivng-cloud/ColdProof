'use client';
import { Button } from '../components/ui/Button';
export default function ErrorPage({ reset }: { reset: () => void }) { return <section className="panel" role="alert"><h1>Không tải được giao diện</h1><p>Thử tải lại để tiếp tục.</p><Button onClick={reset}>Thử lại</Button></section>; }

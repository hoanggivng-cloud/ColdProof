import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
export const metadata: Metadata = { title: 'ColdProof | APEX', description: 'Cold-chain evidence workflow' };
const links = [['/', 'Overview'], ['/sources', 'Source registry'], ['/imports', 'Imports'], ['/batches', 'Batches'], ['/qa', 'QA review'], ['/reports', 'Reports'], ['/admin', 'Admin']];
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body><aside><Link className="brand" href="/">COLD<span>PROOF</span></Link><p className="subbrand">APEX</p><nav aria-label="Main navigation">{links.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav></aside><main>{children}</main></body></html>;
}

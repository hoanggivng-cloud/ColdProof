import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { SessionProvider } from '../components/auth/SessionProvider';
import { AppShell } from '../components/layout/AppShell';
import { ShipmentWorkflowProvider } from '../components/shipment/ShipmentWorkflow';
import './globals.css';

const sans = IBM_Plex_Sans({ subsets: ['latin', 'vietnamese'], weight: ['400', '500', '600'], variable: '--font-plex-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin', 'vietnamese'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' });

export const metadata: Metadata = { title: 'ColdProof', description: 'Hồ sơ nhiệt độ chuỗi lạnh dược' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi" className={`${sans.variable} ${mono.variable}`}><body><SessionProvider><ShipmentWorkflowProvider><AppShell>{children}</AppShell></ShipmentWorkflowProvider></SessionProvider></body></html>;
}

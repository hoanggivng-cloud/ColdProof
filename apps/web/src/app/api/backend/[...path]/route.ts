import { NextResponse, type NextRequest } from 'next/server';
import { TOKEN_COOKIE } from '../../../../lib/session';
const resources = new Set(['health', 'batches', 'sources', 'imports', 'exceptions', 'qa-reviews', 'reports', 'audit', 'users']);
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!resources.has(path[0]) || path.length > 3 || path.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return NextResponse.json({ message: 'Unknown resource' }, { status: 404 });
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/${path.map(encodeURIComponent).join('/')}`, { cache: 'no-store', signal: AbortSignal.timeout(8000), headers: token ? { authorization: `Bearer ${token}` } : undefined });
    if (!response.ok) return NextResponse.json({ message: 'API request failed' }, { status: response.status });
    const data: unknown = await response.json();
    return NextResponse.json(data);
  } catch { return NextResponse.json({ message: 'API unavailable' }, { status: 503 }); }
}

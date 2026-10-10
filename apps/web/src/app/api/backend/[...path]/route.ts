import { NextResponse, type NextRequest } from 'next/server';
import { TOKEN_COOKIE } from '../../../../lib/session';
const resources = new Set(['health', 'batches', 'sources', 'imports', 'exceptions', 'qa-reviews', 'reports', 'audit', 'users', 'auth']);
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!resources.has(path[0]) || path.length > 3 || path.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return NextResponse.json({ message: 'Unknown resource' }, { status: 404 });
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/${path.map(encodeURIComponent).join('/')}`, { cache: 'no-store', signal: AbortSignal.timeout(8000), headers: token ? { authorization: `Bearer ${token}` } : undefined });
    if (!response.ok) return NextResponse.json({ message: 'API request failed' }, { status: response.status });
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/pdf') || contentType.includes('application/octet-stream')) {
      const buffer = await response.arrayBuffer();
      const headers = new Headers();
      headers.set('content-type', contentType);
      const disposition = response.headers.get('content-disposition');
      if (disposition) headers.set('content-disposition', disposition);
      return new NextResponse(buffer, { status: 200, headers });
    }
    const data: unknown = await response.json();
    return NextResponse.json(data);
  } catch { return NextResponse.json({ message: 'API unavailable' }, { status: 503 }); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!resources.has(path[0]) || path.length > 3 || path.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) return NextResponse.json({ message: 'Unknown resource' }, { status: 404 });
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  try {
    const body = await request.text();
    const response = await fetch(`${base.replace(/\/$/, '')}/${path.map(encodeURIComponent).join('/')}`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body || undefined,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ message: 'API request failed' }));
      return NextResponse.json(err, { status: response.status });
    }
    const data: unknown = await response.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ message: 'API unavailable' }, { status: 503 });
  }
}

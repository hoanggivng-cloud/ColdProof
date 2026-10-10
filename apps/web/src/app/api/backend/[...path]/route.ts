import { NextResponse, type NextRequest } from 'next/server';
import { TOKEN_COOKIE } from '../../../../lib/session';

const resources = new Set(['health', 'batches', 'sources', 'imports', 'exceptions', 'qa-reviews', 'reports', 'audit', 'users']);

async function handleRequest(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!resources.has(path[0]) || path.length > 3 || path.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) {
    return NextResponse.json({ message: 'Unknown resource' }, { status: 404 });
  }

  const rawBase = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:3001/api';
  const base = rawBase.replace('localhost', '127.0.0.1');
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const headers: HeadersInit = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  
  const init: RequestInit = {
    method: request.method,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    headers,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const contentType = request.headers.get('content-type');
    if (contentType) headers['content-type'] = contentType;
    init.body = await request.text();
  }

  try {
    const search = request.nextUrl.search || '';
    const response = await fetch(`${base.replace(/\/$/, '')}/${path.map(encodeURIComponent).join('/')}${search}`, init);
    if (!response.ok) {
        // try parsing response text to return proper api error
        const text = await response.text();
        try {
            return NextResponse.json(JSON.parse(text), { status: response.status });
        } catch {
            return NextResponse.json({ message: 'API request failed' }, { status: response.status });
        }
    }
    const data: unknown = await response.json();
    return NextResponse.json(data);
  } catch { 
    return NextResponse.json({ message: 'API unavailable' }, { status: 503 }); 
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const PATCH = handleRequest;
export const DELETE = handleRequest;

import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  return proxy(request, params);
}
export async function POST(request, { params }) {
  return proxy(request, params);
}

async function proxy(request, { path }) {
  const target = process.env.SIGNET_RPC_URL;
  if (!target) {
    return NextResponse.json({ error: 'SIGNET_RPC_URL not set' }, { status: 400 });
  }
  const url = target.replace(/\/$/, '') + '/' + (Array.isArray(path) ? path.join('/') : '');
  const init = {
    method: request.method,
    headers: { 'content-type': 'application/json', 'x-proxy': 'offline-web' },
    body: request.method === 'GET' ? undefined : await request.text(),
  };
  try {
    const res = await fetch(url, init);
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json' } });
  } catch (e) {
    return NextResponse.json({ error: 'Proxy failed', detail: String(e) }, { status: 502 });
  }
}

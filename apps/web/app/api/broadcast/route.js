export async function POST(req) {
  try {
    const { hex, endpoint } = await req.json();
    if (!hex || typeof hex !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'hex required' }), { status: 400 });
    }
    const base = typeof endpoint === 'string' && endpoint.trim().length > 0
      ? endpoint.trim()
      : 'https://mempool.space/signet';
    const url = base.replace(/\/$/, '') + '/api/tx';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: hex.trim(),
      // next: { revalidate: 0 },
    });
    const text = await r.text();
    if (!r.ok) {
      return new Response(JSON.stringify({ ok: false, status: r.status, error: text }), { status: 502 });
    }
    return new Response(JSON.stringify({ ok: true, txid: text.trim() }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
}

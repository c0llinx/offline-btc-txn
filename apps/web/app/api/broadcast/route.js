export async function POST(req) {
  try {
    const { hex, endpoint } = await req.json();
    if (!hex || typeof hex !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'hex required' }), { status: 400 });
    }

    const candidates = [];
    if (typeof endpoint === 'string' && endpoint.trim().length > 0) {
      candidates.push(endpoint.trim());
    } else {
      candidates.push('https://mempool.space/testnet');
      candidates.push('https://blockstream.info/testnet');
    }

    const errors = [];
    const TIMEOUT_MS = 15000;

    for (const base of candidates) {
      const url = base.replace(/\/$/, '') + '/api/tx';
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: hex.trim(),
          signal: ctrl.signal,
        });
        clearTimeout(to);
        const text = await r.text();
        if (!r.ok) {
          errors.push({ base, status: r.status, error: text });
          continue;
        }
        return new Response(JSON.stringify({ ok: true, txid: text.trim(), endpoint: base }), { status: 200 });
      } catch (e) {
        clearTimeout(to);
        errors.push({ base, error: String(e?.message || e) });
      }
    }

    return new Response(JSON.stringify({ ok: false, error: 'All broadcast endpoints failed', details: errors }), { status: 502 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
}

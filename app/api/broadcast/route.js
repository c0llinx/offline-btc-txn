const NETWORK_BASE = {
  mainnet: 'https://mempool.space',
  testnet: 'https://mempool.space/testnet',
  testnet4: 'https://mempool.space/testnet4',
  signet: 'https://mempool.space/signet',
};

export async function POST(req) {
  try {
    const { hex, network } = await req.json();
    if (!hex || typeof hex !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'hex required' }), { status: 400 });
    }
    const netKey = String(network || 'testnet4').toLowerCase();
    const base = NETWORK_BASE[netKey] || NETWORK_BASE.testnet4;
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
    return new Response(JSON.stringify({ ok: true, txid: text.trim(), network: netKey }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
}

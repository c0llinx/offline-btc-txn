const NETWORK_BASE = {
  mainnet: "https://mempool.space",
  testnet: "https://mempool.space/testnet",
  testnet4: "https://mempool.space/testnet4",
  signet: "https://mempool.space/signet",
};

export async function GET(_request, { params }) {
  try {
    const network = String(params.network || "").toLowerCase();
    const address = String(params.address || "").trim();
    if (!NETWORK_BASE[network]) {
      return Response.json({ ok: false, error: `Unsupported network "${network}"` }, { status: 400 });
    }
    if (!address) {
      return Response.json({ ok: false, error: "Address required" }, { status: 400 });
    }
    const base = NETWORK_BASE[network].replace(/\/$/, "");
    const url = `${base}/api/address/${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "user-agent": "offline-btc-web/1.0" }, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return Response.json(
        { ok: false, error: text || `Balance query failed (${res.status})` },
        { status: res.status || 502 },
      );
    }
    const data = await res.json();
    const chain = (data?.chain_stats?.funded_txo_sum || 0) - (data?.chain_stats?.spent_txo_sum || 0);
    const mempool = (data?.mempool_stats?.funded_txo_sum || 0) - (data?.mempool_stats?.spent_txo_sum || 0);
    const balance = chain + mempool;
    return Response.json({ ok: true, balance });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

const NETWORK_BASE = {
  mainnet: "https://mempool.space",
  testnet: "https://mempool.space/testnet",
  testnet4: "https://mempool.space/testnet4",
  signet: "https://mempool.space/signet",
};
const TESTNET_FALLBACK = ["testnet4", "testnet"];

export async function GET(_request, { params }) {
  try {
    const network = String(params.network || "").toLowerCase();
    const address = String(params.address || "").trim();
    if (!address) {
      return Response.json({ ok: false, error: "Address required" }, { status: 400 });
    }
    const networksToQuery =
      network && NETWORK_BASE[network]
        ? [network, ...(network === "testnet4" ? ["testnet"] : network === "testnet" ? ["testnet4"] : [])]
        : TESTNET_FALLBACK;

    let balance = 0;
    let lastError = null;
    for (const key of networksToQuery) {
      const base = NETWORK_BASE[key];
      if (!base) continue;
      const url = `${base.replace(/\/$/, "")}/api/address/${encodeURIComponent(address)}`;
      try {
        const res = await fetch(url, { headers: { "user-agent": "offline-btc-web/1.0" }, cache: "no-store" });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Balance query failed (${res.status})`);
        }
        const data = await res.json();
        const chain = (data?.chain_stats?.funded_txo_sum || 0) - (data?.chain_stats?.spent_txo_sum || 0);
        const mempool = (data?.mempool_stats?.funded_txo_sum || 0) - (data?.mempool_stats?.spent_txo_sum || 0);
        balance = Math.max(balance, chain + mempool);
      } catch (error) {
        lastError = error;
      }
    }
    if (balance === 0 && lastError) {
      throw lastError;
    }
    return Response.json({ ok: true, balance });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

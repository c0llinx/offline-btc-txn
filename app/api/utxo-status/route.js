/**
 * UTXO status API route.
 * Checks if a specific UTXO is spent or unspent.
 */

const NETWORK_BASE = {
    mainnet: "https://mempool.space/api",
    testnet: "https://mempool.space/testnet/api",
    testnet4: "https://mempool.space/testnet4/api",
    signet: "https://mempool.space/signet/api",
};

export async function GET(request)
{
    const url = new URL(request.url);
    const txid = url.searchParams.get("txid");
    const vout = parseInt(url.searchParams.get("vout") || "0", 10);
    const network = (url.searchParams.get("network") || "testnet4").toLowerCase();

    if (!txid || !/^[0-9a-fA-F]{64}$/.test(txid))
    {
        return Response.json(
            { ok: false, error: "Valid 64-character txid required" },
            { status: 400 }
        );
    }

    const baseUrl = NETWORK_BASE[network] || NETWORK_BASE.testnet4;

    try
    {
        // First, try to get the transaction outspend info
        const outspendUrl = `${baseUrl}/tx/${txid}/outspends`;
        const outspendResp = await fetch(outspendUrl, {
            method: "GET",
            headers: { "User-Agent": "Offline-BTC-Web/1.0.0" },
            cache: "no-store",
        });

        if (!outspendResp.ok)
        {
            // Transaction might not exist yet
            if (outspendResp.status === 404)
            {
                return Response.json({
                    ok: true,
                    spent: false,
                    spentBy: null,
                    exists: false,
                    message: "Transaction not found",
                });
            }
            throw new Error(`API error: ${outspendResp.status}`);
        }

        const outspends = await outspendResp.json();

        if (!Array.isArray(outspends) || vout >= outspends.length)
        {
            return Response.json({
                ok: true,
                spent: false,
                spentBy: null,
                exists: true,
                message: "Output index out of range",
            });
        }

        const outputStatus = outspends[vout];
        const isSpent = outputStatus?.spent === true;
        const spentByTxid = outputStatus?.txid || null;

        return Response.json({
            ok: true,
            spent: isSpent,
            spentBy: spentByTxid,
            exists: true,
            network,
        });
    } catch (error)
    {
        return Response.json(
            { ok: false, error: error instanceof Error ? error.message : "Network error" },
            { status: 500 }
        );
    }
}

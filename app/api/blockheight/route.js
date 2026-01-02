/**
 * Block height API route.
 * Proxies mempool.space to fetch current block height.
 */

const ENDPOINTS = {
    mainnet: "https://mempool.space/api/blocks/tip/height",
    testnet4: "https://mempool.space/testnet4/api/blocks/tip/height",
    testnet: "https://mempool.space/testnet/api/blocks/tip/height",
    signet: "https://mempool.space/signet/api/blocks/tip/height",
};

export async function GET(request)
{
    const url = new URL(request.url);
    const network = (url.searchParams.get("network") || "testnet4").toLowerCase();

    const endpoint = ENDPOINTS[network] || ENDPOINTS.testnet4;

    try
    {
        const response = await fetch(endpoint, {
            method: "GET",
            headers: { Accept: "text/plain" },
            cache: "no-store",
        });

        if (!response.ok)
        {
            return Response.json(
                { ok: false, error: `Failed to fetch block height (${response.status})` },
                { status: response.status }
            );
        }

        const text = await response.text();
        const height = parseInt(text.trim(), 10);

        if (Number.isNaN(height))
        {
            return Response.json(
                { ok: false, error: "Invalid block height response" },
                { status: 500 }
            );
        }

        return Response.json({
            ok: true,
            height,
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

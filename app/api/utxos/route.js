import { UTXOService } from "@/lib/server/utxo-service";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const address = url.searchParams.get("address");
    const network = url.searchParams.get("network") || "testnet4";
    if (!address) {
      return new Response(JSON.stringify({ ok: false, error: "address query parameter required" }), { status: 400 });
    }
    const service = new UTXOService(network);
    const utxos = await service.getUTXOsForAddress(address);
    return new Response(JSON.stringify({ ok: true, utxos }), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), { status: 500 });
  }
}

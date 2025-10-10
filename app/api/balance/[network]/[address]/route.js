import { NextResponse } from "next/server";
import { UTXOService } from "@/lib/server/utxo-service.js";

function normalizeNetwork(networkParam) {
  const value = (networkParam || "").toLowerCase();
  if (value === "mainnet") return "mainnet";
  if (value === "testnet4" || value === "signet" || value === "testnet") return "testnet4";
  return "testnet4";
}

export async function GET(_request, { params }) {
  const { network, address } = params;
  if (!address) {
    return NextResponse.json({ error: "Address is required" }, { status: 400 });
  }

  try {
    const normalizedNetwork = normalizeNetwork(network);
    const utxoService = new UTXOService(normalizedNetwork);
    const utxos = await utxoService.getUTXOsForAddress(address);
    const balance = utxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
    return NextResponse.json({ balance, utxos });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch balance",
      },
      { status: 500 },
    );
  }
}

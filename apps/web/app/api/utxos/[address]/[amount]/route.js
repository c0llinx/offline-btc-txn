
import { UTXOService } from '@offline/server-api/src/services/UTXOService';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { address, amount } = params;

  if (!address) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  const utxoService = new UTXOService('testnet');

  try {
    const utxos = await utxoService.getUTXOsForAmount(address, parseInt(amount, 10) || 100000);
    return NextResponse.json(utxos);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

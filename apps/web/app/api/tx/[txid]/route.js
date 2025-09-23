
import { MempoolService } from '@offline/server-api/src/services/mempool.ts';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  const { txid } = params;

  if (!txid) {
    return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 });
  }

  const mempoolService = new MempoolService('testnet');

  try {
    const rawTx = await mempoolService.getRawTransaction(txid);
    return NextResponse.json({ rawTx });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

"use client";

import { useState } from 'react';

export const dynamic = 'force-dynamic';

const NETWORK_ENDPOINTS = {
  testnet4: 'https://mempool.space/testnet4',
  testnet: 'https://mempool.space/testnet',
  signet: 'https://mempool.space/signet',
  mainnet: 'https://mempool.space',
};
const NETWORK_OPTIONS = [
  { key: 'testnet4', label: 'Testnet4' },
  { key: 'testnet', label: 'Testnet (legacy)' },
  { key: 'signet', label: 'Signet' },
  { key: 'mainnet', label: 'Mainnet' },
];

export default function Watch() {
  const [network, setNetwork] = useState('testnet4');
  const endpoint = NETWORK_ENDPOINTS[network] || NETWORK_ENDPOINTS.testnet4;
  const [hex, setHex] = useState('');
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleBroadcast() {
    setStatus('broadcasting...');
    setResult(null);
    setError('');
    try {
      const r = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hex, endpoint, network }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || `Broadcast failed (status ${j.status || r.status})`);
      setResult(j);
      setStatus('broadcasted');
    } catch (e) {
      setError(String(e?.message || e));
      setStatus('error');
    }
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600 text-white">Broadcast</div>
      <h1 className="text-2xl font-semibold">Watch Mode</h1>
      <p className="text-zinc-500">Broadcast raw transactions without exposing wallet keys.</p>

      <section className="rounded-lg border p-4 space-y-3">
        <label className="space-y-1 block">
          <div className="text-sm text-zinc-500">Network</div>
          <select
            className="w-full rounded border px-3 py-2"
            value={network}
            onChange={(event) => setNetwork(event.target.value)}
          >
            {NETWORK_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 block">
          <div className="text-sm text-zinc-500">Node endpoint (POST /api/tx)</div>
          <input className="w-full rounded border px-3 py-2 bg-zinc-100 text-zinc-500" value={endpoint} readOnly />
        </label>
        <label className="space-y-1 block">
          <div className="text-sm text-zinc-500">Raw transaction hex</div>
          <textarea className="w-full rounded border px-3 py-2 font-mono min-h-[140px]" value={hex} onChange={e => setHex(e.target.value)} />
        </label>
        <div className="flex items-center gap-2">
          <button onClick={handleBroadcast} className="px-3 py-2 rounded bg-blue-600 text-white" disabled={!hex.trim()}>Broadcast</button>
          {status && <div className="text-sm text-zinc-500">Status: {status}</div>}
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        {result && (
          <div className="text-sm">
            <div className="text-zinc-500">Result</div>
            <div className="font-mono break-all">txid: {result.txid}</div>
          </div>
        )}
      </section>
    </main>
  );
}

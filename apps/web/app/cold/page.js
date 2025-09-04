'use client';
import { useEffect, useState } from 'react';

export default function Cold() {
  const [status, setStatus] = useState('checking...');
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-cold.js')
        .then(() => {
          return fetch('/api/ping')
            .then(r => {
              setStatus(r.status === 451 ? 'COLD enforced (blocked)' : 'Not blocked yet — reload to enforce');
            })
            .catch(() => setStatus('COLD enforced (blocked)'));
        })
        .catch(() => setStatus('SW registration failed'));
    } else {
      setStatus('Service Worker unsupported');
    }
  }, []);
  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600 text-white">COLD</div>
      <h1 className="text-2xl font-semibold">Cold Mode (Offline Signer)</h1>
      <p className="text-zinc-500">This mode enforces zero network access via a Service Worker.</p>
      <div className="rounded-xl border p-4">
        <p className="font-mono text-sm">Self‑check: {status}</p>
      </div>
      <div className="rounded-xl border p-4">
        <h2 className="font-semibold mb-2">Funding Flow (skeleton)</h2>
        <ol className="list-decimal pl-5 space-y-1 text-sm text-zinc-600">
          <li>Import UTXO Snapshot (UR)</li>
          <li>Build Taproot output (claim/refund leaves, burned internal key)</li>
          <li>Build & sign funding PSBT</li>
          <li>Export Signed TX as UR for broadcasting</li>
        </ol>
      </div>
    </main>
  );
}

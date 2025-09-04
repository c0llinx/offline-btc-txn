'use client';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="space-y-6">
      <h1 className="text-3xl font-bold">Offline Bitcoin Wallet — v0.4</h1>
      <p className="text-zinc-500">Select a mode to begin. Target: Signet.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link className="rounded-2xl p-6 border hover:shadow-md" href="/cold">Cold Mode</Link>
        <Link className="rounded-2xl p-6 border hover:shadow-md" href="/watch">Watch‑Only</Link>
        <Link className="rounded-2xl p-6 border hover:shadow-md" href="/receiver">Receiver</Link>
      </div>
    </main>
  );
}

'use client';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="space-y-6">
      <h1 className="text-3xl font-bold">Offline Bitcoin Wallet — v0.4</h1>
      <p className="text-zinc-500">Select a mode or tool. Supports Signet/Testnet/Mainnet.</p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Modes</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link className="rounded-2xl p-6 border hover:shadow-md" href="/cold">Cold Mode</Link>
          <Link className="rounded-2xl p-6 border hover:shadow-md" href="/watch">Watch‑Only</Link>
          <Link className="rounded-2xl p-6 border hover:shadow-md" href="/receiver">Receiver</Link>
          <Link className="rounded-2xl p-6 border hover:shadow-md" href="/signer">Signer</Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Tools</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link className="rounded-2xl p-6 border hover:shadow-md" href="/tools/address">Address Tool</Link>
          <Link className="rounded-2xl p-6 border hover:shadow-md" href="/tools/keyfinder">Key Finder</Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Docs</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link className="rounded-2xl p-6 border hover:shadow-md" href="/docs/buyer-merchant">Buyer–Merchant Workflow</Link>
          <Link className="rounded-2xl p-6 border hover:shadow-md" href="/about">About / Schemas</Link>
        </div>
      </section>
    </main>
  );
}

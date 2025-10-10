"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveWallet } from "@/lib/wallets";

function formatSats(value) {
  const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  return `${formatter.format(Math.trunc(value || 0))} sats`;
}

export default function ActiveWalletBadge() {
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    const refresh = () => setWallet(getActiveWallet());
    refresh();
    window.addEventListener("offline-wallets-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("offline-wallets-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!wallet) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span>No active wallet</span>
        <Link href="/wallets" className="underline text-blue-600">
          create one
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200">
        {wallet.network}
      </span>
      <div className="flex flex-col">
        <span className="font-medium text-zinc-900 dark:text-zinc-100 text-sm">{wallet.label}</span>
        <span className="font-mono text-[10px] text-zinc-500">
          {wallet.publicKeyHex.slice(0, 16)}…
        </span>
        <span className="text-[10px] text-zinc-500">{formatSats(wallet.balanceSats)}</span>
      </div>
      <Link href="/wallets" className="text-blue-600 hover:underline">
        manage
      </Link>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveWallet } from "@/lib/wallets";

function formatSats(value) {
  const formatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  return `${formatter.format(Math.trunc(value || 0))} sats`;
}

function shortKey(value = "") {
  if (!value) return "no key";
  return `${value.slice(0, 12)}...${value.slice(-6)}`;
}

export default function ActiveWalletBadge({ compact = false }) {
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
      <div className="flex items-center justify-between gap-3 text-xs text-[#8B949E]">
        <span>No active wallet</span>
        <Link href="/wallets" className="font-semibold text-[#F7931A] hover:text-[#E8850F]">
          Create
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 items-center gap-3 text-xs ${compact ? "" : "rounded-xl border border-[#30363D] bg-[#161B22] p-3"}`}>
      <span className="shrink-0 rounded border border-[#3FB950] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#3FB950]">
        {wallet.network || "network"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[#F0F6FC]">{wallet.label || "Wallet"}</div>
        <div className="truncate font-mono text-[11px] text-[#8B949E]">
          {shortKey(wallet.xOnlyHex || wallet.publicKeyHex)}
        </div>
        <div className="font-mono text-[11px] font-semibold text-[#F7931A]">
          {formatSats(wallet.balanceSats)}
        </div>
      </div>
      <Link href="/wallets" className="shrink-0 font-semibold text-[#58A6FF] hover:text-[#F7931A]">
        Manage
      </Link>
    </div>
  );
}

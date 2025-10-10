"use client";

import Link from "next/link";
import WalletManager from "@/components/WalletManager.jsx";

export default function WalletsPage() {
  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Back to modes
        </Link>
      </div>
      <WalletManager />
    </main>
  );
}

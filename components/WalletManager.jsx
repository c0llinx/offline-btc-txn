"use client";

import { useEffect, useMemo, useState } from "react";
import
  {
    generateWallet,
    walletFromWIF,
    loadWallets,
    saveWallets,
    getActiveWalletId,
    setActiveWalletId,
    deleteWallet,
    renameWallet,
    markWalletNote,
    recordWalletEvent,
    setWalletBalance,
  } from "@/lib/wallets";
import { loadTransactions, TXN_STATUS } from "@/lib/transactions";

import { copyToClipboard } from "@/lib/clipboard";

const networks = [
  { key: "testnet4", label: "Testnet4 (mempool.space)" },
  { key: "signet", label: "Signet" },
  { key: "testnet", label: "Legacy Testnet" },
  { key: "mainnet", label: "Mainnet" },
];

function formatSats(value)
{
  const formatter = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  });
  return `${formatter.format(Math.trunc(value || 0))} sats`;
}

function formatTimeAgo(value)
{
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleString();
}

export default function WalletManager()
{
  const [wallets, setWallets] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [networkKey, setNetworkKey] = useState("testnet4");
  const [toast, setToast] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const [revealedWalletIds, setRevealedWalletIds] = useState(() => new Set());

  function refreshFromStorage()
  {
    setWallets(loadWallets());
    setActiveId(getActiveWalletId());
  }

  useEffect(() =>
  {
    refreshFromStorage();
  }, []);

  useEffect(() =>
  {
    const handler = () => refreshFromStorage();
    window.addEventListener("offline-wallets-change", handler);
    window.addEventListener("storage", handler);
    return () =>
    {
      window.removeEventListener("offline-wallets-change", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const sortedWallets = useMemo(() =>
  {
    return [...wallets].sort((a, b) =>
    {
      const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [wallets]);

  function showToast(message, variant = "success")
  {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 2500);
  }

  function persist(updatedWallets, selectedId = activeId)
  {
    saveWallets(updatedWallets);
    if (selectedId)
    {
      setActiveWalletId(selectedId);
    }
    refreshFromStorage();
  }

  function handleGenerate()
  {
    try
    {
      const wallet = generateWallet(networkKey);
      wallet.label = `Wallet ${sortedWallets.length + 1}`;
      const updated = [...wallets, wallet];
      persist(updated, wallet.id);
      showToast("New wallet generated and saved.");
    } catch (error)
    {
      showToast(error.message || "Failed to generate wallet", "error");
    }
  }

  async function handleImport()
  {
    const wif = window.prompt("Paste the WIF (Wallet Import Format) key:");
    if (!wif) return;
    const label = window.prompt("Optional label for this wallet:", "");
    try
    {
      const wallet = walletFromWIF(wif, label || undefined);
      const existing = wallets.filter((w) => w.publicKeyHex === wallet.publicKeyHex);
      const updated = existing.length
        ? wallets.map((w) =>
          w.publicKeyHex === wallet.publicKeyHex
            ? {
              ...w,
              ...wallet,
              balanceSats: typeof w.balanceSats === "number" ? w.balanceSats : wallet.balanceSats,
              history: Array.isArray(w.history) ? w.history : wallet.history,
            }
            : w,
        )
        : [...wallets, wallet];
      persist(updated, wallet.id);
      showToast("Wallet imported.");
    } catch (error)
    {
      showToast(error.message || "Failed to import wallet", "error");
    }
  }

  function handleSelect(id)
  {
    setActiveWalletId(id);
    setActiveId(id);
    showToast("Wallet marked active.");
  }

  async function handleCopy(value, label)
  {
    try
    {
      await copyToClipboard(value);
      showToast(`${label} copied to clipboard.`);
    } catch
    {
      showToast(`Unable to copy ${label}`, "error");
    }
  }

  function handleDelete(id)
  {
    if (!window.confirm("Delete this wallet permanently?")) return;
    const updated = deleteWallet(id);
    setWallets(updated);
    setActiveId(getActiveWalletId());
    showToast("Wallet deleted.");
  }

  function handleRename(id, current)
  {
    const next = window.prompt("Rename wallet:", current || "");
    if (next === null) return;
    const updated = renameWallet(id, next.trim() || current);
    setWallets(updated);
    showToast("Wallet renamed.");
  }

  function handleNote(id, current)
  {
    const next = window.prompt("Wallet note (store seed location, device, etc.)", current || "");
    if (next === null) return;
    const updated = markWalletNote(id, next);
    setWallets(updated);
    showToast("Wallet note updated.");
  }

  function toggleWif(walletId)
  {
    setRevealedWalletIds((current) =>
    {
      const next = new Set(current);
      if (next.has(walletId))
      {
        next.delete(walletId);
      } else
      {
        next.add(walletId);
      }
      return next;
    });
  }

  function handleRecord(walletId, direction)
  {
    const amountStr = window.prompt(
      direction === "receive"
        ? "Amount received (sats):"
        : "Amount sent (sats):",
      "0",
    );
    if (amountStr === null) return;
    const amount = Math.abs(Math.trunc(Number(amountStr)));
    if (!amount)
    {
      showToast("Amount must be greater than zero", "error");
      return;
    }
    const description = window.prompt("Optional note for this entry", "");
    const updated = recordWalletEvent({
      walletId,
      type: direction,
      amountSats: amount,
      description: description || undefined,
      source: "manual",
    });
    if (!updated)
    {
      showToast("Failed to record entry", "error");
      return;
    }
    refreshFromStorage();
    showToast(direction === "receive" ? "Balance increased" : "Balance decreased");
  }

  function handleManualSet(walletId, currentBalance)
  {
    const next = window.prompt(
      "Set balance (sats):",
      String(Math.trunc(currentBalance || 0)),
    );
    if (next === null) return;
    const parsed = Math.trunc(Number(next));
    if (Number.isNaN(parsed))
    {
      showToast("Invalid amount", "error");
      return;
    }
    const result = setWalletBalance(walletId, parsed, "Manual set", "manual");
    if (!result)
    {
      showToast("Failed to update balance", "error");
      return;
    }
    refreshFromStorage();
    showToast("Balance updated");
  }

  async function handleRefresh(wallet)
  {
    if (!wallet) return;
    const addresses = (
      Array.isArray(wallet.taprootAddresses) && wallet.taprootAddresses.length > 0
        ? wallet.taprootAddresses
        : [wallet.p2tr]
    ).filter(Boolean);
    if (addresses.length === 0)
    {
      showToast("No address to refresh", "error");
      return;
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false)
    {
      showToast("Offline: cannot reach mempool", "error");
      return;
    }
    setRefreshingId(wallet.id);
    try
    {
      let total = 0;
      let pendingTotal = 0;
      for (const address of addresses)
      {
        const params = new URLSearchParams({
          address,
          network: (wallet.network || "testnet4").toLowerCase(),
        });
        const res = await fetch(`/api/utxos?${params.toString()}`, {
          headers: { "content-type": "application/json" },
          cache: "no-store",
        });
        if (!res.ok)
        {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || res.statusText || "Failed to load UTXOs");
        }
        const data = await res.json();
        const utxos = Array.isArray(data.utxos) ? data.utxos : [];
        const taprootUtxos = utxos.filter((utxo) =>
          String(utxo.scriptHex || "").toLowerCase().startsWith("5120"),
        );
        const confirmed = taprootUtxos
          .filter((utxo) => Number(utxo.confirmations || 0) > 0)
          .reduce((sum, utxo) => sum + Number(utxo.value || 0), 0);
        const pending = taprootUtxos
          .filter((utxo) => Number(utxo.confirmations || 0) <= 0)
          .reduce((sum, utxo) => sum + Number(utxo.value || 0), 0);
        total += confirmed;
        pendingTotal += pending;
      }

      // Subtract locked amounts from pending transactions
      const pendingTxns = loadTransactions().filter(
        (tx) =>
          tx.senderWalletId === wallet.id &&
          (tx.status === TXN_STATUS.PENDING || tx.status === TXN_STATUS.REFUNDABLE)
      );
      const lockedAmount = pendingTxns.reduce(
        (sum, tx) => sum + (Number(tx.amountSats) || 0),
        0
      );
      const adjustedTotal = Math.max(0, total - lockedAmount);
      const adjustedPending = Math.max(0, pendingTotal);

      setWalletBalance(
        wallet.id,
        adjustedTotal,
        lockedAmount > 0
          ? `Synced via Refresh (${formatSats(lockedAmount)} locked in pending transactions)`
          : `Synced via Refresh (${addresses.join(", ")})`,
        "sync",
        { pendingSats: adjustedPending },
      );
      refreshFromStorage();
      showToast("Balance refreshed");
    } catch (error)
    {
      showToast(error instanceof Error ? error.message : "Refresh failed", "error");
    } finally
    {
      setRefreshingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs uppercase tracking-widest">
          Wallets
        </div>
        <h1 className="text-3xl font-semibold">Wallets</h1>
        <p className="text-zinc-500">
          Generate or import local Taproot wallets, set the active wallet, and refresh balances.
        </p>
      </header>

      <section className="rounded-xl border bg-white dark:bg-zinc-900 p-4 space-y-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[220px_auto_auto] items-end">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Network</div>
            <select
              className="w-full rounded border px-3 py-2 bg-white dark:bg-zinc-900"
              value={networkKey}
              onChange={(event) => setNetworkKey(event.target.value)}
            >
              {networks.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500"
            onClick={handleGenerate}
          >
            Generate Wallet
          </button>
          <button
            className="px-3 py-2 rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            onClick={handleImport}
          >
            Import WIF
          </button>
        </div>
        <div className="text-xs text-zinc-500">
          Data stays on this device. Export intentionally by copying WIF or public keys.
        </div>
      </section>

      {sortedWallets.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-zinc-500 text-center">
          No wallets saved yet. Generate or import one to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {sortedWallets.map((wallet) =>
          {
            const isActive = wallet.id === activeId;
            const wifVisible = revealedWalletIds.has(wallet.id);
            return (
              <article
                key={wallet.id}
                className={`rounded-xl border p-4 bg-white dark:bg-zinc-900 shadow-sm ${isActive ? "border-blue-500" : "border-zinc-200 dark:border-zinc-800"
                  }`}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold">{wallet.label || "Unnamed Wallet"}</h2>
                      {isActive && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-600 text-white">Active</span>
                      )}
                    </div>
                    <div className="text-sm text-zinc-500">
                      {wallet.network} · Updated {formatTimeAgo(wallet.updatedAt)}
                      {wallet.note ? ` · ${wallet.note}` : ""}
                    </div>
                    {wallet.lastRefreshedAt && (
                      <div className="text-xs text-zinc-500">
                        Last sync {formatTimeAgo(wallet.lastRefreshedAt)}
                      </div>
                    )}
                    <div className="text-sm text-zinc-600 mt-1">
                      Balance: <span className="font-mono text-base">{formatSats(wallet.balanceSats)}</span>
                      {typeof wallet.availableTaprootSats === "number" && wallet.availableTaprootSats !== wallet.balanceSats && (
                        <span className="ml-2 text-xs text-zinc-500">
                          Confirmed Taproot: {formatSats(wallet.availableTaprootSats)}
                        </span>
                      )}
                      {typeof wallet.pendingDelta === "number" && wallet.pendingDelta > 0 && (
                        <span className="ml-2 text-xs text-amber-600">
                          Pending: {formatSats(wallet.pendingDelta)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!isActive && (
                      <button
                        className="px-3 py-1.5 rounded border hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        onClick={() => handleSelect(wallet.id)}
                      >
                        Set Active
                      </button>
                    )}
                    <button
                      className="px-3 py-1.5 rounded border hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => handleRefresh(wallet)}
                      disabled={refreshingId === wallet.id}
                    >
                      {refreshingId === wallet.id ? "Refreshing…" : "Refresh"}
                    </button>
                    <button
                      className="px-3 py-1.5 rounded border hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => handleRename(wallet.id, wallet.label)}
                    >
                      Rename
                    </button>
                    <button
                      className="px-3 py-1.5 rounded border hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => handleNote(wallet.id, wallet.note)}
                    >
                      Note
                    </button>
                    <button
                      className="px-3 py-1.5 rounded border hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => handleRecord(wallet.id, "receive")}
                    >
                      Record Receive
                    </button>
                    <button
                      className="px-3 py-1.5 rounded border hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => handleRecord(wallet.id, "send")}
                    >
                      Record Send
                    </button>
                    <button
                      className="px-3 py-1.5 rounded border hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      onClick={() => handleManualSet(wallet.id, wallet.balanceSats)}
                    >
                      Set Balance
                    </button>
                    <button
                      className="px-3 py-1.5 rounded border border-red-400 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                      onClick={() => handleDelete(wallet.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <dl className="grid md:grid-cols-2 gap-4 mt-4 text-sm">
                  <div>
                    <dt className="text-zinc-500">WIF</dt>
                    <dd className="font-mono break-all text-xs bg-zinc-100 dark:bg-zinc-800 rounded p-2 mt-1">
                      {wifVisible ? wallet.wif : "Hidden until revealed"}
                    </dd>
                    <div className="mt-2 flex gap-3 text-xs">
                      <button
                        className="text-amber-600 hover:underline"
                        onClick={() => toggleWif(wallet.id)}
                      >
                        {wifVisible ? "Hide WIF" : "Reveal WIF"}
                      </button>
                      {wifVisible && (
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => handleCopy(wallet.wif, "WIF")}
                        >
                          Copy WIF
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Public Key (compressed)</dt>
                    <dd className="font-mono break-all text-xs bg-zinc-100 dark:bg-zinc-800 rounded p-2 mt-1">
                      {wallet.publicKeyHex}
                    </dd>
                    <button
                      className="mt-2 text-xs text-blue-600 hover:underline"
                      onClick={() => handleCopy(wallet.publicKeyHex, "public key")}
                    >
                      Copy Public Key
                    </button>
                  </div>
                  <div>
                    <dt className="text-zinc-500">x-only Public Key</dt>
                    <dd className="font-mono break-all text-xs bg-zinc-100 dark:bg-zinc-800 rounded p-2 mt-1">
                      {wallet.xOnlyHex}
                    </dd>
                    <button
                      className="mt-2 text-xs text-blue-600 hover:underline"
                      onClick={() => handleCopy(wallet.xOnlyHex, "x-only public key")}
                    >
                      Copy x-only
                    </button>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Addresses</dt>
                    <dd className="space-y-1">
                      <div>
                        <div className="text-xs text-zinc-500">Taproot addresses</div>
                        <div className="space-y-1">
                          {(Array.isArray(wallet.taprootAddresses) && wallet.taprootAddresses.length > 0
                            ? wallet.taprootAddresses
                            : [wallet.p2tr || "—"]
                          ).map((addr) => (
                            <div
                              key={addr}
                              className="font-mono break-all text-xs bg-zinc-100 dark:bg-zinc-800 rounded p-2"
                            >
                              {addr || "—"}
                            </div>
                          ))}
                        </div>
                      </div>
                    </dd>
                    <div className="flex gap-2 text-xs mt-2">
                      {Array.isArray(wallet.taprootAddresses) && wallet.taprootAddresses.length > 0 ? (
                        wallet.taprootAddresses.map((addr) => (
                          <button
                            key={addr}
                            className="text-blue-600 hover:underline"
                            onClick={() => handleCopy(addr, "Taproot address")}
                          >
                            Copy {addr.slice(0, 6)}…
                          </button>
                        ))
                      ) : wallet.p2tr ? (
                        <button
                          className="text-blue-600 hover:underline"
                          onClick={() => handleCopy(wallet.p2tr, "Taproot address")}
                        >
                          Copy Taproot
                        </button>
                      ) : null}
                    </div>
                  </div>
                </dl>

                {Array.isArray(wallet.history) && wallet.history.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-zinc-600 mb-2">Recent activity</h3>
                    <ul className="space-y-1 text-xs text-zinc-500">
                      {wallet.history.slice(0, 5).map((entry) => (
                        <li key={entry.id} className="flex items-center justify-between">
                          <span className="font-mono">
                            {entry.type === "receive" ? "+" : entry.type === "send" ? "-" : "±"}
                            {formatSats(entry.amountSats)}
                          </span>
                          <span className="truncate flex-1 ml-2">
                            {entry.description || "Recorded"}
                          </span>
                          <span className="ml-2 whitespace-nowrap">{formatTimeAgo(entry.timestamp)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded-md shadow-lg text-sm ${toast.variant === "error"
              ? "bg-red-600 text-white"
              : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

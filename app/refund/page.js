"use client";

import { useMemo, useState, useEffect, useCallback, Suspense } from "react";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { schnorr as nobleSchnorr } from "@noble/curves/secp256k1";
import
{
  loadTransactions,
  updateTransaction,
  deleteTransaction,
  TXN_STATUS,
} from "@/lib/transactions";
import { loadWallets } from "@/lib/wallets";

bitcoin.initEccLib(ecc);

const POLL_INTERVAL_MS = 30000; // 30 seconds

const STATUS_COLORS = {
  [TXN_STATUS.PENDING]: "bg-yellow-100 text-yellow-800",
  [TXN_STATUS.CLAIMED]: "bg-blue-100 text-blue-800",
  [TXN_STATUS.REFUNDABLE]: "bg-amber-100 text-amber-800",
  [TXN_STATUS.REFUNDED]: "bg-green-100 text-green-800",
};

const STATUS_LABELS = {
  [TXN_STATUS.PENDING]: "Pending",
  [TXN_STATUS.CLAIMED]: "Claimed",
  [TXN_STATUS.REFUNDABLE]: "Refundable",
  [TXN_STATUS.REFUNDED]: "Refunded",
};

function RefundContent()
{
  const [transactions, setTransactions] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [currentHeight, setCurrentHeight] = useState(null);
  const [networkKey, setNetworkKey] = useState("testnet4");
  const [autoRefund, setAutoRefund] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [lastPollTime, setLastPollTime] = useState(null);

  const network = useMemo(() =>
  {
    if (networkKey === "mainnet") return bitcoin.networks.bitcoin;
    return bitcoin.networks.testnet;
  }, [networkKey]);

  // Load transactions and wallets
  const refresh = useCallback(() =>
  {
    setTransactions(loadTransactions());
    setWallets(loadWallets());
  }, []);

  useEffect(() =>
  {
    refresh();
    window.addEventListener("offline-txn-change", refresh);
    window.addEventListener("offline-wallets-change", refresh);
    return () =>
    {
      window.removeEventListener("offline-txn-change", refresh);
      window.removeEventListener("offline-wallets-change", refresh);
    };
  }, [refresh]);

  // Fetch current block height
  const fetchBlockHeight = useCallback(async () =>
  {
    try
    {
      const resp = await fetch(`/api/blockheight?network=${networkKey}`);
      const data = await resp.json();
      if (data.ok && typeof data.height === "number")
      {
        setCurrentHeight(data.height);
        setLastPollTime(Date.now());
        return data.height;
      }
    } catch (e)
    {
      console.warn("Failed to fetch block height:", e);
    }
    return null;
  }, [networkKey]);

  // Poll block height
  useEffect(() =>
  {
    fetchBlockHeight();
    const interval = setInterval(fetchBlockHeight, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchBlockHeight]);

  // Check UTXO status (spent or unspent)
  const checkUtxoStatus = useCallback(async (txid, vout, txNetwork) =>
  {
    try
    {
      const params = new URLSearchParams({
        txid,
        vout: String(vout),
        network: txNetwork || networkKey,
      });
      const resp = await fetch(`/api/utxo-status?${params.toString()}`);
      const data = await resp.json();
      if (data.ok)
      {
        return { spent: data.spent === true, spentBy: data.spentBy || null };
      }
    } catch (e)
    {
      console.warn("UTXO check failed:", e);
    }
    return { spent: false, spentBy: null };
  }, [networkKey]);

  // Update transaction statuses based on block height and UTXO status
  const updateStatuses = useCallback(async (height) =>
  {
    if (!height) return;
    const txns = loadTransactions();
    let hasChanges = false;

    for (const tx of txns)
    {
      if (tx.status === TXN_STATUS.PENDING || tx.status === TXN_STATUS.REFUNDABLE)
      {
        // Check if UTXO was spent (claimed)
        if (tx.fundTxid)
        {
          const { spent, spentBy } = await checkUtxoStatus(tx.fundTxid, tx.vout, tx.network);
          if (spent)
          {
            // Check if spent by refund or claim
            if (spentBy && tx.refundTxid && spentBy === tx.refundTxid)
            {
              updateTransaction(tx.id, { status: TXN_STATUS.REFUNDED });
            } else
            {
              updateTransaction(tx.id, { status: TXN_STATUS.CLAIMED, claimTxid: spentBy });
            }
            hasChanges = true;
            continue;
          }
        }

        // Check if expiry reached
        if (tx.status === TXN_STATUS.PENDING && tx.expiryHeight <= height)
        {
          updateTransaction(tx.id, { status: TXN_STATUS.REFUNDABLE });
          hasChanges = true;
        }
      }
    }

    if (hasChanges)
    {
      setTransactions(loadTransactions());
    }
  }, [checkUtxoStatus]);

  // Run status updates when height changes
  useEffect(() =>
  {
    if (currentHeight)
    {
      updateStatuses(currentHeight);
    }
  }, [currentHeight, updateStatuses]);

  // Build refund PSBT
  const buildRefundPsbt = useCallback((tx) =>
  {
    if (!tx.fundTxid) throw new Error("Missing funding txid");
    if (!tx.fundingScriptHex) throw new Error("Missing funding script");
    if (!tx.refundLeafScriptHex) throw new Error("Missing refund leaf script");
    if (!tx.refundControlBlockHex) throw new Error("Missing refund control block");

    const txNetwork = tx.network === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    const psbt = new bitcoin.Psbt({ network: txNetwork });

    const leafScript = {
      leafVersion: 0xc0,
      script: Buffer.from(tx.refundLeafScriptHex, "hex"),
      controlBlock: Buffer.from(tx.refundControlBlockHex, "hex"),
    };

    psbt.addInput({
      hash: tx.fundTxid,
      index: tx.vout,
      sequence: 0xfffffffe, // Enable RBF, required for CLTV
      witnessUtxo: {
        script: Buffer.from(tx.fundingScriptHex, "hex"),
        value: tx.amountSats,
      },
      tapLeafScript: [leafScript],
    });

    // Find sender wallet for change address
    const wallet = wallets.find((w) => w.id === tx.senderWalletId);
    const changeAddress = wallet?.p2tr;
    if (!changeAddress) throw new Error("Sender wallet not found");

    // Estimate fee (single P2TR input, single P2TR output)
    const feeRate = 2; // sat/vB
    const estimatedVsize = 110; // approximate for 1-in-1-out taproot
    const fee = Math.ceil(estimatedVsize * feeRate);
    const outputValue = tx.amountSats - fee;

    if (outputValue <= 546) throw new Error("Insufficient funds after fee");

    psbt.addOutput({ address: changeAddress, value: outputValue });
    psbt.setLocktime(tx.expiryHeight);

    return { psbt, changeAddress, outputValue };
  }, [wallets]);

  // Sign and broadcast refund
  const handleRefund = useCallback(async (tx) =>
  {
    setError("");
    setSuccessMsg("");
    setProcessingId(tx.id);

    try
    {
      // Build PSBT
      const { psbt, changeAddress, outputValue } = buildRefundPsbt(tx);

      // Get signer key
      const wallet = wallets.find((w) => w.id === tx.senderWalletId);
      if (!wallet?.wif) throw new Error("Wallet private key not found");

      const ECPair = ECPairFactory(ecc);
      const keyPair = ECPair.fromWIF(wallet.wif, network);
      const seckey = Buffer.from(keyPair.privateKey);
      const pub33 = Buffer.from(ecc.pointFromScalar(seckey, true));

      const signer = {
        publicKey: pub33,
        signSchnorr: (hash) => Buffer.from(nobleSchnorr.sign(hash, seckey)),
      };

      // Sign
      psbt.signInput(0, signer);

      const tss = psbt.data.inputs[0].tapScriptSig;
      if (!tss || tss.length === 0) throw new Error("Failed to produce tapScriptSig");
      const sig = tss[0].signature;

      // Build witness
      const leafScript = Buffer.from(tx.refundLeafScriptHex, "hex");
      const controlBlock = Buffer.from(tx.refundControlBlockHex, "hex");
      const witness = [Buffer.from(sig), leafScript, controlBlock];
      const finalScriptWitness = witnessStackToScriptWitness(witness);

      psbt.updateInput(0, { finalScriptWitness });

      const finalTx = psbt.extractTransaction();
      const rawHex = finalTx.toHex();
      const refundTxid = finalTx.getId();

      // Broadcast
      const broadcastResp = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          hex: rawHex,
          network: tx.network || networkKey,
        }),
      });
      const broadcastData = await broadcastResp.json();

      if (broadcastData.ok)
      {
        updateTransaction(tx.id, {
          status: TXN_STATUS.REFUNDED,
          refundTxid: broadcastData.txid || refundTxid,
        });
        setSuccessMsg(`Refund broadcast successfully! TXID: ${broadcastData.txid || refundTxid}`);
        setTransactions(loadTransactions());
      } else
      {
        const errText = broadcastData.error || "Broadcast failed";
        if (errText.toLowerCase().includes("non-final") || errText.toLowerCase().includes("locktime"))
        {
          throw new Error("Locktime not reached yet. Wait for block height to exceed expiry.");
        }
        throw new Error(errText);
      }
    } catch (e)
    {
      setError(e instanceof Error ? e.message : String(e));
    } finally
    {
      setProcessingId(null);
    }
  }, [buildRefundPsbt, wallets, network, networkKey]);

  // Auto-refund logic
  useEffect(() =>
  {
    if (!autoRefund || !currentHeight) return;

    const refundable = transactions.filter(
      (tx) => tx.status === TXN_STATUS.REFUNDABLE && !processingId
    );

    if (refundable.length > 0)
    {
      handleRefund(refundable[0]);
    }
  }, [autoRefund, currentHeight, transactions, processingId, handleRefund]);

  // Delete transaction
  const handleDelete = (id) =>
  {
    deleteTransaction(id);
    setTransactions(loadTransactions());
  };

  // Filter by network
  const filteredTxns = transactions.filter(
    (tx) => !tx.network || tx.network === networkKey
  );

  // Sort by status priority (refundable first, then pending, then others)
  const sortedTxns = [...filteredTxns].sort((a, b) =>
  {
    const priority = {
      [TXN_STATUS.REFUNDABLE]: 0,
      [TXN_STATUS.PENDING]: 1,
      [TXN_STATUS.CLAIMED]: 2,
      [TXN_STATUS.REFUNDED]: 3,
    };
    return (priority[a.status] ?? 4) - (priority[b.status] ?? 4);
  });

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-600 text-white">
        REFUND
      </div>
      <h1 className="text-2xl font-semibold">Refund Tracker</h1>
      <p className="text-zinc-500">
        Monitor initiated transactions and trigger refunds when the expiry height is reached and funds haven't been claimed.
      </p>

      {/* Status Bar */}
      <section className="rounded-lg border p-4 bg-zinc-50 space-y-2">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="space-y-1">
            <div className="text-sm text-zinc-500">Current Block Height</div>
            <div className="text-2xl font-mono font-bold">
              {currentHeight !== null ? currentHeight.toLocaleString() : "—"}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-zinc-500">Network</div>
            <select
              className="rounded border px-3 py-2"
              value={networkKey}
              onChange={(e) => setNetworkKey(e.target.value)}
            >
              <option value="testnet4">testnet4</option>
              <option value="signet">signet</option>
              <option value="testnet">testnet</option>
              <option value="mainnet">mainnet</option>
            </select>
          </div>
          <div className="space-y-1">
            <div className="text-sm text-zinc-500">Auto-Refund</div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoRefund}
                onChange={(e) => setAutoRefund(e.target.checked)}
                className="w-5 h-5"
              />
              <span className="text-sm">{autoRefund ? "Enabled" : "Disabled"}</span>
            </label>
          </div>
          <button
            onClick={fetchBlockHeight}
            className="px-3 py-2 rounded bg-zinc-200 hover:bg-zinc-300 text-sm"
          >
            Refresh
          </button>
        </div>
        {lastPollTime && (
          <div className="text-xs text-zinc-400">
            Last updated: {new Date(lastPollTime).toLocaleTimeString()}
          </div>
        )}
      </section>

      {/* Messages */}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-green-700">
          {successMsg}
        </div>
      )}

      {/* Transaction List */}
      <section className="rounded-lg border overflow-hidden">
        <div className="bg-zinc-100 px-4 py-2 font-medium text-sm border-b">
          Tracked Transactions ({filteredTxns.length})
        </div>
        {sortedTxns.length === 0 ? (
          <div className="p-8 text-center text-zinc-500">
            No transactions tracked yet. Create a claim bundle on the Cold page to start tracking.
          </div>
        ) : (
          <div className="divide-y">
            {sortedTxns.map((tx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                currentHeight={currentHeight}
                onRefund={() => handleRefund(tx)}
                onDelete={() => handleDelete(tx.id)}
                processing={processingId === tx.id}
                wallets={wallets}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function TransactionRow({ tx, currentHeight, onRefund, onDelete, processing, wallets })
{
  const wallet = wallets.find((w) => w.id === tx.senderWalletId);
  const blocksRemaining = tx.expiryHeight - (currentHeight || 0);
  const progress = currentHeight
    ? Math.min(100, Math.max(0, ((currentHeight - (tx.expiryHeight - 6)) / 6) * 100))
    : 0;
  const canRefund = tx.status === TXN_STATUS.REFUNDABLE;
  const isActive = tx.status === TXN_STATUS.PENDING || tx.status === TXN_STATUS.REFUNDABLE;

  return (
    <div className={`p-4 space-y-3 ${!isActive ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap gap-3 items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[tx.status] || "bg-gray-100"}`}
            >
              {STATUS_LABELS[tx.status] || tx.status}
            </span>
            <span className="text-sm font-medium">{tx.amountSats?.toLocaleString()} sats</span>
          </div>
          <div className="text-xs text-zinc-500">
            Wallet: {wallet?.label || tx.senderWalletId}
          </div>
          {tx.message && (
            <div className="text-xs text-zinc-500">
              Message: "{tx.message}"
            </div>
          )}
        </div>
        <div className="text-right space-y-1">
          <div className="text-sm">
            Expiry: <span className="font-mono">{tx.expiryHeight?.toLocaleString()}</span>
          </div>
          {isActive && currentHeight && (
            <div className="text-xs text-zinc-500">
              {blocksRemaining > 0
                ? `${blocksRemaining} blocks remaining`
                : "Expiry reached"}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar for pending transactions */}
      {tx.status === TXN_STATUS.PENDING && currentHeight && blocksRemaining > 0 && (
        <div className="space-y-1">
          <div className="h-2 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${Math.max(5, 100 - (blocksRemaining / 10) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Funding txid */}
      {tx.fundTxid && (
        <div className="text-xs font-mono text-zinc-400 truncate">
          TX: {tx.fundTxid}
        </div>
      )}

      {/* Refund/Claim txid */}
      {tx.refundTxid && (
        <div className="text-xs text-green-600">
          Refund TX: <span className="font-mono">{tx.refundTxid}</span>
        </div>
      )}
      {tx.claimTxid && (
        <div className="text-xs text-blue-600">
          Claim TX: <span className="font-mono">{tx.claimTxid}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {canRefund && (
          <button
            onClick={onRefund}
            disabled={processing}
            className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white text-sm disabled:opacity-50"
          >
            {processing ? "Processing..." : "Refund Now"}
          </button>
        )}
        <button
          onClick={onDelete}
          className="px-3 py-1.5 rounded border border-red-300 text-red-600 hover:bg-red-50 text-sm"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// Helper: Convert witness stack to script witness format
function witnessStackToScriptWitness(witness)
{
  function varint(n)
  {
    if (n < 0xfd) return Buffer.from([n]);
    if (n <= 0xffff) return Buffer.from([0xfd, n & 0xff, (n >> 8) & 0xff]);
    if (n <= 0xffffffff)
      return Buffer.from([
        0xfe,
        n & 0xff,
        (n >> 8) & 0xff,
        (n >> 16) & 0xff,
        (n >> 24) & 0xff,
      ]);
    const hi = Math.floor(n / 2 ** 32) >>> 0;
    const lo = n >>> 0;
    return Buffer.from([
      0xff,
      lo & 0xff,
      (lo >> 8) & 0xff,
      (lo >> 16) & 0xff,
      (lo >> 24) & 0xff,
      hi & 0xff,
      (hi >> 8) & 0xff,
      (hi >> 16) & 0xff,
      (hi >> 24) & 0xff,
    ]);
  }

  const parts = [varint(witness.length)];
  for (const w of witness)
  {
    const b = Buffer.isBuffer(w) ? w : Buffer.from(w);
    parts.push(varint(b.length));
    parts.push(b);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts)
  {
    out.set(p, off);
    off += p.length;
  }
  return Buffer.from(out);
}

export default function Refund()
{
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RefundContent />
    </Suspense>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Buffer } from "buffer";
import
{
  NETWORKS,
  buildClaimRefundTaproot,
  buildFundingPsbt,
  encodeUR,
} from "@/lib/offline-core";
import { encode as cborEncode } from "cbor-x";
import QRCode from "qrcode";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { schnorr as nobleSchnorr, secp256k1 } from "@noble/curves/secp256k1";
import { ECPairFactory } from "ecpair";
import { getActiveWallet, loadWallets, recordWalletEvent } from "@/lib/wallets";
import { saveTransaction } from "@/lib/transactions";
import { tapTweakHash, tweakKey } from "bitcoinjs-lib/src/payments/bip341";
import { copyToClipboard } from "@/lib/clipboard";

bitcoin.initEccLib(ecc);

const BROADCAST_ENDPOINT_DEFAULTS = {
  mainnet: "https://mempool.space",
  testnet4: "https://mempool.space/testnet4",
  signet: "https://mempool.space/signet",
  testnet: "https://mempool.space/testnet",
};

export default function Cold()
{
  const [status, setStatus] = useState("checking...");
  const [networkKey, setNetworkKey] = useState("testnet4");
  const [expiry, setExpiry] = useState(500000);
  const [message, setMessage] = useState("hello offline bitcoin");
  const [amountSat, setAmountSat] = useState(0);
  const [claimBundleUR, setClaimBundleUR] = useState("");
  const [claimQR, setClaimQR] = useState("");
  const [receiverURL, setReceiverURL] = useState("");
  const [genError, setGenError] = useState("");
  const [wallets, setWallets] = useState([]);
  const [activeWallet, setActiveWallet] = useState(null);
  const [fundingWalletId, setFundingWalletId] = useState("");
  const [fundingRaw, setFundingRaw] = useState("");
  const [broadcastEndpoint, setBroadcastEndpoint] = useState("");
  const [manualUtxos, setManualUtxos] = useState([]);
  const [currentHeight, setCurrentHeight] = useState(null);

  const network = useMemo(
    () => NETWORKS[networkKey] || NETWORKS.testnet4,
    [networkKey],
  );

  useEffect(() =>
  {
    const init = async () =>
    {
      if (!("serviceWorker" in navigator))
      {
        setStatus("Service Worker unsupported");
        return;
      }
      try
      {
        const reg = await navigator.serviceWorker.getRegistration("/cold/");
        if (!reg)
        {
          setStatus("Cold OFF");
        } else
        {
          try
          {
            const resp = await fetch("/cold/sw-probe");
            setStatus(
              resp.status === 451
                ? "COLD enforced (blocked)"
                : "Cold ON (not blocking api)",
            );
          } catch
          {
            setStatus("COLD enforced (blocked)");
          }
        }
      } catch
      {
        setStatus("Cold status unknown");
      }
    };
    init();
  }, []);

  useEffect(() =>
  {
    const syncWallets = () =>
    {
      const list = loadWallets();
      setWallets(list);
      setActiveWallet(getActiveWallet() || list[0] || null);
    };
    syncWallets();
    window.addEventListener("offline-wallets-change", syncWallets);
    window.addEventListener("storage", syncWallets);
    return () =>
    {
      window.removeEventListener("offline-wallets-change", syncWallets);
      window.removeEventListener("storage", syncWallets);
    };
  }, []);

  const fundingWallet = useMemo(() =>
  {
    if (!wallets.length) return null;
    if (fundingWalletId)
    {
      return wallets.find((wallet) => wallet.id === fundingWalletId) || wallets[0];
    }
    if (activeWallet) return activeWallet;
    return wallets[0];
  }, [wallets, fundingWalletId, activeWallet]);

  useEffect(() =>
  {
    if (!wallets.length) return;
    const defaultFunding = fundingWalletId || activeWallet?.id || wallets[0]?.id || "";
    setFundingWalletId((prev) => prev || defaultFunding);
  }, [wallets, activeWallet?.id, fundingWalletId]);

  useEffect(() =>
  {
    const walletNet = (fundingWallet?.network || "testnet4").toLowerCase();
    const normalized = normalizeNetworkKey(walletNet);
    setNetworkKey(normalized);
  }, [fundingWallet]);



  useEffect(() =>
  {
    let mounted = true;
    async function fetchHeight()
    {
      try
      {
        const res = await fetch(`/api/blockheight?network=${networkKey}`);
        const data = await res.json();
        if (mounted && data.ok)
        {
          setCurrentHeight(data.height);
        }
      } catch (e)
      {
        console.warn("Failed to fetch block height:", e);
      }
    }
    fetchHeight();
    const interval = setInterval(fetchHeight, 30000);
    return () =>
    {
      mounted = false;
      clearInterval(interval);
    };
  }, [networkKey]);



  useEffect(() =>
  {
    if (typeof window === "undefined") return;
    try
    {
      const url = new URL(window.location.href);
      const fundHexParam = url.searchParams.get("fundtx") || url.searchParams.get("fund_tx");
      const endpointParam = url.searchParams.get("endpoint") || url.searchParams.get("broadcast");
      if (fundHexParam) setFundingRaw(fundHexParam.trim());
      if (endpointParam)
      {
        const sanitized = endpointParam.trim();
        const normalizedEndpoint = sanitized.replace(/\/$/, "");
        const defaultEndpoint = defaultEndpointForNetwork(networkKey);
        setBroadcastEndpoint(
          Object.values(BROADCAST_ENDPOINT_DEFAULTS).includes(normalizedEndpoint)
            ? normalizedEndpoint
            : defaultEndpoint,
        );
      }
    } catch
    {
      // ignore malformed URLs
    }
  }, []);

  function updateManualUtxo(index, field, value)
  {
    setManualUtxos((prev) =>
      prev.map((entry, idx) =>
        idx === index
          ? { ...entry, [field]: field === "txid" ? value.trim() : value }
          : entry,
      ),
    );
  }

  function addManualUtxo()
  {
    setManualUtxos((prev) => [...prev, { txid: "", vout: "", value: "" }]);
  }

  function removeManualUtxo(index)
  {
    setManualUtxos((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handleGenerate()
  {
    try
    {
      setGenError("");
      setClaimBundleUR("");
      setClaimQR("");
      if (!fundingWallet) throw new Error("Select a funding wallet first");
      const fundingXOnly = (fundingWallet.xOnlyHex || "").trim();
      const fundingWif = (fundingWallet.wif || "").trim();
      const fundingNetwork = (fundingWallet.network || "testnet4").toLowerCase();
      if (!fundingWallet.p2tr)
      {
        throw new Error("Funding wallet must have a Taproot address");
      }
      if (!fundingXOnly || !fundingWif) throw new Error("Funding wallet missing Taproot key material");
      const satAmount = Math.max(0, Math.trunc(Number(amountSat) || 0));
      if (satAmount <= 0)
      {
        throw new Error("Commitment amount must be greater than zero");
      }
      const walletBalance = Number(fundingWallet.balanceSats ?? Number.NaN);
      if (Number.isFinite(walletBalance) && satAmount > walletBalance)
      {
        throw new Error("Commitment amount exceeds wallet balance");
      }
      const R = null;
      const S = hexToU8(fundingXOnly);
      const h = await sha256(new TextEncoder().encode(message || ""));
      if (S.length !== 32) throw new Error("S x-only must be 32 bytes");
      if (h.length !== 32) throw new Error("h must be 32 bytes");
      const {
        address: taprootAddress,
        leaves,
        internalPubkey,
        scriptTree,
        output,
        requiresSignature,
      } = buildClaimRefundTaproot({
        R_xonly: R,
        S_xonly: S,
        h32: h,
        H_exp: Number(expiry) || 0,
        network,
      });
      const redeem = { output: leaves.claim, redeemVersion: 0xc0 };
      const p2trRedeem = bitcoin.payments.p2tr({
        internalPubkey,
        scriptTree,
        redeem,
        network,
      });
      const witness = p2trRedeem.witness || [];
      const control = witness.length
        ? witness[witness.length - 1]
        : new Uint8Array([]);
      let trimmedFundingHex = (fundingRaw || "").trim();
      const trimmedEndpoint = (broadcastEndpoint || "").trim() || defaultEndpointForNetwork(networkKey);
      if (!trimmedFundingHex)
      {
        try
        {
          const autoFunding = await autoBuildFundingTransaction({
            wallet: fundingWallet,
            amountSat: satAmount,
            fundingScript: output,
            networkKey,
            network,
            manualUtxos,
          });
          trimmedFundingHex = autoFunding.rawHex;
          setFundingRaw(autoFunding.rawHex);
        } catch (error)
        {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to build funding transaction automatically";
          throw new Error(
            `${message}. Paste the pre-built funding transaction hex (fundtx) to continue.`,
          );
        }
      }
      let fundTxBytes = null;
      let fundTxidBytes = null;
      let voutIndex = 0;
      let outputValue = satAmount;
      if (trimmedFundingHex)
      {
        if (!/^[0-9a-fA-F]+$/.test(trimmedFundingHex) || trimmedFundingHex.length % 2 !== 0)
        {
          throw new Error("Funding transaction hex must be even-length hex characters");
        }
        let tx;
        try
        {
          tx = bitcoin.Transaction.fromHex(trimmedFundingHex);
        } catch (error)
        {
          throw new Error("Funding transaction hex is not a valid bitcoin transaction");
        }
        const scriptBuf = Buffer.from(output);
        const matchIndex = tx.outs.findIndex((out) => out.script.equals(scriptBuf));
        if (matchIndex < 0)
        {
          throw new Error("Funding transaction does not contain the claim output");
        }
        voutIndex = matchIndex >>> 0;
        outputValue = Number(tx.outs[matchIndex]?.value ?? 0) >>> 0;
        if (!(outputValue > 0))
        {
          throw new Error("Funding transaction output value is invalid");
        }
        const txidHex = tx.getId();
        fundTxBytes = hexToU8(trimmedFundingHex);
        fundTxidBytes = hexToU8(txidHex);
      }
      const bundlesMeta = {
        amount_sat: satAmount,
        memo: message || null,
      };
      if (trimmedEndpoint) bundlesMeta.broadcast_endpoint = trimmedEndpoint;
      bundlesMeta.network = networkKey;
      const bundle = {
        ver: 1,
        h_alg: "sha256",
        h,
        R_pub: requiresSignature ? R : null,
        script: leaves.claim,
        leaf_ver: 0xc0,
        control,
        internal_pubkey: internalPubkey,
        address: taprootAddress,
        send_value_sat: satAmount,
        expires_at: Number(expiry) || 0,
        fund_txid: fundTxidBytes,
        vout: voutIndex,
        value: outputValue,
        funding_script: output,
        fund_tx: fundTxBytes,
        broadcast_endpoint: trimmedEndpoint || null,
        network: networkKey,
        requires_signature: requiresSignature,
        meta: bundlesMeta,
      };
      const cbor = cborEncode(bundle);
      const urEncoder = encodeUR("claim-bundle", cbor);
      const part = urEncoder.nextPart();
      setClaimBundleUR(part);

      if (typeof window !== "undefined")
      {
        const url = new URL("/receiver", window.location.origin);
        url.searchParams.set("claim", part || "");
        const receiverLink = url.toString();
        setReceiverURL(receiverLink);
        const qrPayload = part || receiverLink;
        const dataUrl = await QRCode.toDataURL(qrPayload, {
          errorCorrectionLevel: "M",
          margin: 2,
          scale: 8,
          maskPattern: 3,
        });
        setClaimQR(dataUrl);
      }

      // Broadcast the funding transaction to lock funds on-chain
      if (trimmedFundingHex)
      {
        const broadcastResp = await fetch("/api/broadcast", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            hex: trimmedFundingHex,
            network: networkKey,
          }),
        });
        const broadcastData = await broadcastResp.json();

        if (!broadcastData.ok)
        {
          // Check if it's already broadcast (not an error)
          const errorMsg = String(broadcastData.error || "").toLowerCase();
          const isAlreadyBroadcast =
            errorMsg.includes("already in") ||
            errorMsg.includes("already known") ||
            errorMsg.includes("exists");

          if (!isAlreadyBroadcast)
          {
            throw new Error(`Failed to broadcast funding transaction: ${broadcastData.error || "Unknown error"}. Funds were NOT locked.`);
          }
        }
      }

      // Save transaction to tracker for refund monitoring
      const refundRedeem = { output: leaves.refund, redeemVersion: 0xc0 };
      const p2trRefund = bitcoin.payments.p2tr({
        internalPubkey,
        scriptTree,
        redeem: refundRedeem,
        network,
      });
      const refundWitness = p2trRefund.witness || [];
      const refundControl = refundWitness.length
        ? refundWitness[refundWitness.length - 1]
        : new Uint8Array([]);

      try
      {
        const fundTxidHex = fundTxidBytes
          ? Buffer.from(fundTxidBytes).toString("hex")
          : null;
        saveTransaction({
          fundTxid: fundTxidHex,
          vout: voutIndex,
          expiryHeight: Number(expiry) || 0,
          amountSats: outputValue,
          message: message || "",
          senderWalletId: fundingWallet.id,
          senderWif: fundingWif,
          senderXOnlyHex: fundingXOnly,
          taprootAddress,
          fundingScriptHex: Buffer.from(output).toString("hex"),
          internalPubkeyHex: Buffer.from(internalPubkey).toString("hex"),
          refundLeafScriptHex: Buffer.from(leaves.refund).toString("hex"),
          refundControlBlockHex: Buffer.from(refundControl).toString("hex"),
          network: networkKey,
          preimageText: message || "",
        });

        // Lock the funds from the wallet balance
        recordWalletEvent({
          walletId: fundingWallet.id,
          type: "send",
          amountSats: outputValue,
          description: `Locked in claim bundle for offline payment`,
          txid: fundTxidHex || "",
          source: "workflow",
        });
      } catch (saveErr)
      {
        console.warn("Failed to save transaction to tracker:", saveErr);
      }
    } catch (error)
    {
      setGenError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600 text-white">
        COLD
      </div>
      <h1 className="text-2xl font-semibold">Cold Mode (Offline Signer)</h1>
      <p className="text-zinc-500">
        Active wallet keys are applied automatically. Only the message, expiry height, and commitment amount need to be provided here.
      </p>

      <div className="rounded-xl border p-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-sm">Self-check: {status}</p>
        </div>
      </div>

      <section className="rounded-xl border p-4 space-y-4">
        <h2 className="font-semibold">Offline Funding Setup</h2>
        <p className="text-xs text-zinc-500">
          This cold generator prepares a third-party Taproot commitment using only the selected funding wallet. Share the resulting
          claim bundle with your counterparty, who will add their wallet details when redeeming on the receiver device.
        </p>
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border bg-zinc-50 p-3">
            <h3 className="font-medium text-sm">Funding wallet (offline)</h3>
            <p className="text-xs text-zinc-500">
              Provides sats for the claim bundle and retains the refund path. Must hold spendable Taproot UTXOs.
            </p>
            <label className="block space-y-1">
              <div className="text-sm text-zinc-500">Select funding wallet</div>
              <select
                className="w-full rounded border px-3 py-2"
                value={fundingWallet?.id || fundingWalletId}
                onChange={(event) => setFundingWalletId(event.target.value)}
              >
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.label} ({wallet.network})
                  </option>
                ))}
              </select>
              <div className="text-xs text-zinc-500">
                Network: <span className="font-mono">{networkKey}</span> · Taproot address:{" "}
                <span className="font-mono">{fundingWallet?.p2tr || "—"}</span>
              </div>
            </label>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Expiry height (H_exp)</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={expiry}
              min={0}
              step={1}
              onWheel={(event) => event.currentTarget.blur()}
              onKeyDown={(event) =>
              {
                if (["-", "e", "E", "+"].includes(event.key)) event.preventDefault();
              }}
              onChange={(event) => setExpiry(Number(event.target.value) || 0)}
            />
            {currentHeight !== null && (
              <div className="text-xs text-zinc-500 mt-1">
                Current block height: <span className="font-mono text-zinc-700">{currentHeight.toLocaleString()}</span>
              </div>
            )}
          </label>


          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Commitment amount (sats)</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={amountSat}
              min={0}
              step={1}
              onWheel={(event) => event.currentTarget.blur()}
              onKeyDown={(event) =>
              {
                if (["-", "e", "E", "+"].includes(event.key)) event.preventDefault();
              }}
              onChange={(event) => setAmountSat(Number(event.target.value) || 0)}
            />
            {typeof fundingWallet?.balanceSats === "number" && (
              <div className="text-xs text-zinc-500">
                Available: <span className="font-mono">{fundingWallet.balanceSats}</span> sats
              </div>
            )}
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">Commitment message</div>
            <textarea
              className="w-full rounded border px-3 py-2"
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Manual funding UTXOs (optional)</h3>
            <button
              type="button"
              onClick={addManualUtxo}
              className="px-3 py-1.5 rounded border text-xs hover:bg-zinc-100"
            >
              + Add UTXO
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Use this when the device cannot reach mempool.space. Paste confirmed Taproot outputs for the funding wallet
            (txid, output index, and value in sats) from mempool.space or your node. Leave blank to rely on automatic discovery.
          </p>
          {manualUtxos.length > 0 && (
            <div className="space-y-3">
              {manualUtxos.map((utxo, index) => (
                <div
                  key={`manual-utxo-${index}`}
                  className="grid gap-2 md:grid-cols-[minmax(220px,2fr)_minmax(80px,1fr)_minmax(160px,1fr)_auto] items-end"
                >
                  <label className="space-y-1">
                    <div className="text-xs text-zinc-500">Funding txid</div>
                    <input
                      className="w-full rounded border px-3 py-2 font-mono text-xs"
                      placeholder="64-character hex"
                      value={utxo.txid}
                      onChange={(event) => updateManualUtxo(index, "txid", event.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-zinc-500">vout</div>
                    <input
                      className="w-full rounded border px-3 py-2"
                      type="number"
                      min={0}
                      value={utxo.vout}
                      onChange={(event) => updateManualUtxo(index, "vout", event.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-zinc-500">Value (sats)</div>
                    <input
                      className="w-full rounded border px-3 py-2"
                      type="number"
                      min={0}
                      value={utxo.value}
                      onChange={(event) => updateManualUtxo(index, "value", event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeManualUtxo(index)}
                    className="px-2 py-2 rounded border text-xs text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              ))}
              <div className="text-xs text-zinc-500">
                The Taproot spending script is derived automatically from the funding wallet’s key material.
              </div>
            </div>
          )}
        </div>

        <button
          className="px-3 py-2 rounded bg-blue-600 text-white"
          onClick={handleGenerate}
          disabled={!fundingWallet}
        >
          Create Claim Bundle
        </button>
        {!!genError && <div className="text-sm text-red-600">{genError}</div>}
        <div className="text-xs text-zinc-500">
          Funding wallet: <span className="font-semibold">{fundingWallet?.label || "—"}</span>
        </div>
        {fundingWallet ? (
          <div className="text-xs text-zinc-500">
            Default active wallet <span className="font-semibold">{activeWallet?.label || "—"}</span>
            <span className="font-mono"> {networkKey}</span>
          </div>
        ) : (
          <div className="text-xs text-red-500">
            Select or create a wallet first on the Wallets page.
          </div>
        )}
      </section>

      {
        claimBundleUR && (
          <section className="rounded-xl border p-4 space-y-3">
            <h2 className="font-semibold">Claim Bundle UR</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <textarea
                  className="w-full rounded border px-3 py-2 font-mono"
                  rows={6}
                  value={claimBundleUR}
                  readOnly
                />
                <button
                  type="button"
                  className="px-3 py-2 rounded bg-zinc-800 text-white"
                  onClick={() => copyToClipboard(claimBundleUR)}
                >
                  Copy Claim Bundle
                </button>
                {receiverURL && (
                  <div className="space-y-1">
                    <code className="text-xs break-all text-zinc-500">{receiverURL}</code>
                    <button
                      type="button"
                      className="px-3 py-2 rounded bg-zinc-200 text-zinc-900"
                      onClick={() => copyToClipboard(receiverURL)}
                    >
                      Copy URL
                    </button>
                  </div>
                )}
              </div>
              {claimQR && (
                <div className="flex flex-col items-center gap-2">
                  <img
                    src={claimQR}
                    alt="Claim bundle QR"
                    width={320}
                    height={320}
                    className="border rounded bg-white"
                    style={{ imageRendering: "pixelated" }}
                    draggable={false}
                  />
                  <button
                    type="button"
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() =>
                    {
                      const win = window.open();
                      if (win)
                      {
                        win.document.write(`<img src="${claimQR}" style="image-rendering:pixelated" />`);
                      }
                    }}
                  >
                    Open QR in new tab
                  </button>
                </div>
              )}
            </div>
          </section>
        )
      }

      <section className="rounded-xl border p-4 space-y-2 text-xs text-zinc-500">
        <div>
          Funding Taproot address:<br />
          <span className="font-mono break-all">{fundingWallet?.p2tr || "—"}</span>
        </div>
        <div className="text-zinc-400">
          Private keys remain stored with each wallet. Export or transfer them only if you intentionally replicate this setup on
          another device.
        </div>
      </section>
    </main >
  );
}

function hexToU8(hex)
{
  const clean = hex.trim().replace(/^0x/i, "");
  if (clean.length % 2) throw new Error("hex length must be even");
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++)
  {
    arr[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  }
  return arr;
}

async function sha256(bytes)
{
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(buf);
}

function defaultEndpointForNetwork(networkKey)
{
  const key = String(networkKey || "").toLowerCase();
  return BROADCAST_ENDPOINT_DEFAULTS[key] || BROADCAST_ENDPOINT_DEFAULTS.testnet4;
}

function normalizeNetworkKey(networkKey)
{
  const key = String(networkKey || "").toLowerCase();
  if (key === "mainnet") return "mainnet";
  if (key === "testnet4") return "testnet4";
  if (key === "testnet") return "testnet";
  if (key === "signet") return "signet";
  return "testnet4";
}

async function autoBuildFundingTransaction({
  wallet,
  amountSat,
  fundingScript,
  networkKey,
  network,
  feeRateSatVb = 2,
  manualUtxos = [],
})
{
  if (!wallet) throw new Error("Active wallet is required to build funding transaction");

  const { inputs, changeAddress, hasTaprootInputs } = await gatherWalletFundingInputs({
    wallet,
    networkKey,
    manualUtxos,
  });
  if (!Array.isArray(inputs) || inputs.length === 0)
  {
    throw new Error("No spendable Taproot UTXOs found for this wallet. Fund it (or paste the funding transaction manually) before creating the claim bundle.");
  }
  if (!changeAddress)
  {
    throw new Error("Could not determine a change address for the active wallet.");
  }
  if (!hasTaprootInputs)
  {
    throw new Error("No Taproot UTXOs available to fund the claim. Fund the wallet's P2TR address and retry.");
  }

  const formattedUtxos = inputs.map((utxo) =>
  {
    const base = {
      txid: utxo.txid,
      vout: utxo.vout,
      witnessUtxo: {
        script: Buffer.from(utxo.scriptHex, "hex"),
        value: Number(utxo.value),
      },
    };
    if (utxo.tapInternalKeyHex)
    {
      return {
        ...base,
        tapInternalKey: Buffer.from(utxo.tapInternalKeyHex, "hex"),
      };
    }
    return base;
  });
  const totalInputValue = formattedUtxos.reduce(
    (sum, utxo) => sum + Number(utxo.witnessUtxo?.value || 0),
    0,
  );
  if (!(totalInputValue > 0))
  {
    throw new Error("No spendable Taproot UTXOs found for this wallet. Fund it (or paste the funding transaction manually) before creating the claim bundle.");
  }
  if (totalInputValue < amountSat)
  {
    throw new Error(
      `Insufficient Taproot funds: need at least ${amountSat} sats, have ${totalInputValue} sats. Fund the wallet or lower the commitment.`,
    );
  }

  const psbt = buildFundingPsbt({
    utxos: formattedUtxos,
    sendOutputScript: Buffer.from(fundingScript),
    sendValueSat: amountSat,
    changeAddress,
    feeRateSatVb,
    network,
  });

  const { signer: taprootSigner, outputKey } = deriveTaprootSigner({
    wallet,
    network,
  });
  if (hasTaprootInputs)
  {
    for (const utxo of formattedUtxos)
    {
      const scriptKey = getOutputKeyFromScript(utxo?.witnessUtxo?.script);
      if (scriptKey && !scriptKey.equals(outputKey))
      {
        throw new Error("Wallet P2TR key mismatch. Ensure the funding UTXOs belong to the selected wallet.");
      }
    }
  }
  try
  {
    psbt.signAllInputs(taprootSigner);
  } catch (error)
  {
    throw new Error(
      error instanceof Error
        ? `Failed to sign funding transaction inputs: ${error.message}`
        : "Failed to sign funding transaction inputs",
    );
  }
  psbt.finalizeAllInputs();

  const tx = psbt.extractTransaction();
  const rawHex = tx.toHex();
  const txid = tx.getId();
  const claimScriptHex = Buffer.from(fundingScript).toString("hex");
  let claimVout = tx.outs.findIndex((out) => Buffer.from(out.script).toString("hex") === claimScriptHex);
  if (claimVout < 0) claimVout = 0;
  const claimValue = Number(tx.outs[claimVout]?.value ?? amountSat);

  return {
    rawHex,
    txid,
    vout: claimVout >>> 0,
    value: claimValue >>> 0,
  };
}

async function fetchWalletUtxos(address, networkKey)
{
  const params = new URLSearchParams({
    address,
    network: networkKey || "testnet4",
  });
  const response = await fetch(`/api/utxos?${params.toString()}`, {
    method: "GET",
    headers: {
      "content-type": "application/json",
    },
  });
  let payload;
  try
  {
    payload = await response.json();
  } catch
  {
    throw new Error("Failed to decode UTXO lookup response");
  }
  if (!payload?.ok)
  {
    throw new Error(payload?.error || `UTXO lookup failed (status ${response.status})`);
  }
  return payload.utxos || [];
}

async function gatherWalletFundingInputs({ wallet, networkKey, manualUtxos = [] })
{
  const candidates = [];
  const tapAddresses = Array.isArray(wallet.taprootAddresses)
    ? wallet.taprootAddresses
    : [wallet.p2tr];
  for (const addr of tapAddresses)
  {
    const trimmed = (addr || "").trim();
    if (trimmed) candidates.push({ address: trimmed, type: "p2tr" });
  }
  if (candidates.length === 0)
  {
    throw new Error("Active wallet does not have a Taproot (P2TR) address available.");
  }

  const collected = [];
  let changeAddress = (tapAddresses[0] || "").trim();
  let hasTaproot = false;
  const fetchErrors = [];

  for (const candidate of candidates)
  {
    try
    {
      const utxos = await fetchWalletUtxos(candidate.address, networkKey);
      if (Array.isArray(utxos) && utxos.length > 0)
      {
        changeAddress = candidate.address;
        const formatted = utxos.map((utxo) =>
        {
          const scriptHex = String(utxo.scriptHex || "").toLowerCase();
          const isTaprootScript = scriptHex.startsWith("5120");
          if (!isTaprootScript)
          {
            return null;
          }
          if (Number(utxo.confirmations || 0) <= 0)
          {
            return null;
          }
          const base = {
            ...utxo,
            type: candidate.type,
            tapInternalKeyHex: null,
          };
          if (candidate.type === "p2tr")
          {
            const tapKey = (wallet.xOnlyHex || "").trim();
            if (!tapKey)
            {
              throw new Error("Active wallet is missing the x-only key required to spend P2TR UTXOs.");
            }
            hasTaproot = true;
            return { ...base, tapInternalKeyHex: tapKey };
          }
          return base;
        });
        collected.push(...formatted.filter(Boolean));
      }
    } catch (error)
    {
      console.warn("UTXO fetch failed for", candidate.address, error);
      fetchErrors.push({ address: candidate.address, message: error instanceof Error ? error.message : String(error) });
    }
  }

  if (!collected.length && fetchErrors.length)
  {
    throw new Error(
      `Unable to locate confirmed Taproot UTXOs for ${wallet.label || "wallet"}. Last error: ${fetchErrors[fetchErrors.length - 1].message}`,
    );
  }

  const manualList = Array.isArray(manualUtxos) ? manualUtxos : [];
  if (manualList.length)
  {
    const taprootScriptHex = deriveWalletTaprootScriptHex(wallet, networkKey);
    const tapKey = (wallet.xOnlyHex || "").trim();
    for (const entry of manualList)
    {
      const txid = String(entry.txid || "").trim();
      const vout = Number(entry.vout);
      const value = Number(entry.value);
      if (!/^[0-9a-fA-F]{64}$/.test(txid) || !Number.isInteger(vout) || vout < 0 || !Number.isFinite(value) || value <= 0)
      {
        continue;
      }
      const manualUtxo = {
        txid,
        vout,
        value,
        scriptHex: taprootScriptHex,
        address: wallet.p2tr,
        confirmations: 1,
        type: "p2tr",
        tapInternalKeyHex: tapKey,
      };
      collected.push(manualUtxo);
      hasTaproot = true;
      changeAddress = wallet.p2tr || changeAddress;
    }
  }

  if (!collected.length)
  {
    return { inputs: collected, changeAddress, hasTaprootInputs: hasTaproot };
  }

  const unique = new Map();
  for (const utxo of collected)
  {
    const key = `${utxo.txid}:${utxo.vout}`;
    if (!unique.has(key))
    {
      unique.set(key, utxo);
    }
  }

  return { inputs: Array.from(unique.values()), changeAddress, hasTaprootInputs: hasTaproot };
}

function deriveWalletTaprootScriptHex(wallet, networkKey)
{
  const xOnly = String(wallet?.xOnlyHex || "").trim();
  if (xOnly.length !== 64)
  {
    throw new Error("Funding wallet missing x-only Taproot key");
  }
  const network = normalizeNetworkKey(networkKey) === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const payment = bitcoin.payments.p2tr({ internalPubkey: Buffer.from(xOnly, "hex"), network });
  if (!payment.output)
  {
    throw new Error("Unable to derive Taproot output script for wallet");
  }
  return Buffer.from(payment.output).toString("hex");
}

function deriveTaprootSigner({ wallet, network })
{
  const wif = (wallet.wif || "").trim();
  if (!wif) throw new Error("Active wallet is missing the WIF needed to sign the funding transaction");
  const internalHex = (wallet.xOnlyHex || "").trim();
  if (!internalHex || internalHex.length !== 64)
  {
    throw new Error("Active wallet is missing the x-only public key required for Taproot signing");
  }
  const internalKey = Buffer.from(internalHex, "hex");
  const ECPair = ECPairFactory(ecc);
  const baseKey = ECPair.fromWIF(wif, network);
  if (!baseKey?.privateKey)
  {
    throw new Error("Unable to derive private key from wallet WIF for funding transaction");
  }

  const n = secp256k1.CURVE.n;
  let privateInt = bufferToBigInt(Buffer.from(baseKey.privateKey));

  // BIP-340: If the public key has odd y, negate the private key first
  const pubKey = Buffer.from(ecc.pointFromScalar(baseKey.privateKey, true));
  const pubKeyYIsOdd = (pubKey[0] === 0x03);
  if (pubKeyYIsOdd)
  {
    privateInt = (n - privateInt) % n;
  }

  // Add the tweak
  const tweak = tapTweakHash(internalKey);
  const tweakInt = bufferToBigInt(Buffer.from(tweak));
  let tweakedInt = (privateInt + tweakInt) % n;

  // Check output key parity
  const { parity, x: outputKey } = tweakKey(internalKey);
  if (parity === 1)
  {
    tweakedInt = (n - tweakedInt) % n;
  }
  if (tweakedInt === 0n) throw new Error("Invalid Taproot key tweak result");

  const tweakedBytes = bigIntToBuffer(tweakedInt);
  const prefix = parity ? 0x03 : 0x02;
  const pubkey33 = Buffer.concat([Buffer.from([prefix]), Buffer.from(outputKey)]);
  const signer = {
    publicKey: pubkey33,
    signSchnorr: (hash) => Buffer.from(nobleSchnorr.sign(hash, tweakedBytes)),
  };
  return { signer, outputKey: Buffer.from(outputKey) };
}

function getOutputKeyFromScript(script)
{
  if (!script || script.length !== 34) return null;
  if (script[0] !== 0x51 || script[1] !== 0x20) return null;
  return Buffer.from(script.slice(2));
}

function bufferToBigInt(buffer)
{
  const hex = Buffer.from(buffer).toString("hex") || "0";
  return BigInt(`0x${hex}`);
}

function bigIntToBuffer(value)
{
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return Buffer.from(hex.padStart(64, "0"), "hex");
}

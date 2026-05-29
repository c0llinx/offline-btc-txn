"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { Buffer } from "buffer";
import { decodeUR } from "@/lib/offline-core";
import { parseClaimBundle } from "@/lib/offline-interop";
import { loadWallets, getActiveWallet, recordWalletEvent, setWalletBalance } from "@/lib/wallets";
import { copyToClipboard } from "@/lib/clipboard";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { schnorr as nobleSchnorr } from "@noble/curves/secp256k1";

const CameraScanner = dynamic(() => import("@/components/CameraScanner"), {
  ssr: false,
  loading: () => <div className="text-xs text-zinc-500">Loading camera...</div>,
});

bitcoin.initEccLib(ecc);

const BROADCAST_ENDPOINT_DEFAULTS = {
  mainnet: "https://mempool.space",
  testnet4: "https://mempool.space/testnet4",
  testnet: "https://mempool.space/testnet",
  signet: "https://mempool.space/signet",
};

const CUSTOM_DEST_OPTION = "__custom__";

function ReceiverInner()
{
  const [claimInput, setClaimInput] = useState("");
  const [claimErr, setClaimErr] = useState("");
  const [claimData, setClaimData] = useState(null);
  const [wallets, setWallets] = useState([]);
  const [activeWallet, setActiveWalletState] = useState(null);
  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [destinationAddress, setDestinationAddress] = useState("");
  const [destAmount, setDestAmount] = useState(0);
  const [preimageInput, setPreimageInput] = useState("");
  const [fundTxId, setFundTxId] = useState("");
  const [fundVout, setFundVout] = useState(0);
  const [prevoutValue, setPrevoutValue] = useState(0);
  const [prevoutScriptHex, setPrevoutScriptHex] = useState("");
  const [bundleMemo, setBundleMemo] = useState("");
  const [feeRate, setFeeRate] = useState(2);
  const [psbtBase64, setPsbtBase64] = useState("");
  const [signedHex, setSignedHex] = useState("");
  const [resultMsg, setResultMsg] = useState("");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [building, setBuilding] = useState(false);
  const [destinationSource, setDestinationSource] = useState(CUSTOM_DEST_OPTION);
  const [allowAutoDestination, setAllowAutoDestination] = useState(true);
  const [currentHeight, setCurrentHeight] = useState(null);

  // Check if the claim bundle has expired based on current block height
  const isExpired = useMemo(() =>
  {
    if (!claimData || currentHeight === null) return false;
    const expiryHeight = Number(claimData.expires_at ?? 0);
    return expiryHeight > 0 && currentHeight >= expiryHeight;
  }, [claimData, currentHeight]);

  useEffect(() =>
  {
    const sync = () =>
    {
      const list = loadWallets();
      setWallets(list);
      setActiveWalletState(getActiveWallet() || list[0] || null);
    };
    sync();
    window.addEventListener("offline-wallets-change", sync);
    window.addEventListener("storage", sync);
    return () =>
    {
      window.removeEventListener("offline-wallets-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const selectedWallet = useMemo(() =>
  {
    if (!wallets.length) return null;
    if (selectedWalletId)
    {
      return wallets.find((wallet) => wallet.id === selectedWalletId) || null;
    }
    if (activeWallet) return activeWallet;
    return wallets[0] || null;
  }, [wallets, selectedWalletId, activeWallet]);

  // Fetch current block height and poll periodically
  useEffect(() =>
  {
    let mounted = true;
    const networkKey = normalizeNetworkKey(claimData?.network || selectedWallet?.network || "testnet4");

    async function fetchHeight()
    {
      try
      {
        const res = await fetch(`/api/blockheight?network=${networkKey}`);
        const data = await res.json();
        if (mounted && data.ok && typeof data.height === "number")
        {
          setCurrentHeight(data.height);
        }
      } catch (e)
      {
        console.warn("Failed to fetch block height:", e);
      }
    }

    fetchHeight();
    const interval = setInterval(fetchHeight, 30000); // Poll every 30 seconds

    return () =>
    {
      mounted = false;
      clearInterval(interval);
    };
  }, [claimData?.network, selectedWallet?.network]);

  const walletAddresses = useMemo(() =>
  {
    if (!selectedWallet) return [];
    const rawList = [
      selectedWallet.p2tr,
      ...(Array.isArray(selectedWallet.taprootAddresses) ? selectedWallet.taprootAddresses : []),
    ];
    const unique = [];
    for (const entry of rawList)
    {
      const trimmed = typeof entry === "string" ? entry.trim() : "";
      if (trimmed && isTaprootAddress(trimmed) && !unique.includes(trimmed))
      {
        unique.push(trimmed);
      }
    }
    return unique;
  }, [selectedWallet]);

  const walletAddressesKey = useMemo(() => walletAddresses.join("|"), [walletAddresses]);

  useEffect(() =>
  {
    if (!wallets.length) return;
    const receiverHint = (claimData?.receiver_wallet_id || "").trim();
    if (receiverHint)
    {
      const hinted = wallets.find((wallet) => wallet.id === receiverHint);
      if (hinted)
      {
        setSelectedWalletId(hinted.id);
        return;
      }
    }
    const claimKey = (claimData?.claim_pubkey_hex || "").trim().toLowerCase();
    if (claimKey)
    {
      const match = wallets.find(
        (wallet) => String(wallet.xOnlyHex || "").trim().toLowerCase() === claimKey,
      );
      if (match)
      {
        setSelectedWalletId(match.id);
        return;
      }
    }
    const fallbackId = activeWallet?.id || wallets[0]?.id || "";
    setSelectedWalletId((prev) => prev || fallbackId);
  }, [wallets, activeWallet, claimData?.claim_pubkey_hex]);

  useEffect(() =>
  {
    setAllowAutoDestination(true);
  }, [selectedWallet?.id]);

  useEffect(() =>
  {
    if (!selectedWallet)
    {
      if (destinationSource !== CUSTOM_DEST_OPTION) setDestinationSource(CUSTOM_DEST_OPTION);
      return;
    }
    if (!walletAddresses.length)
    {
      if (destinationSource !== CUSTOM_DEST_OPTION) setDestinationSource(CUSTOM_DEST_OPTION);
      return;
    }
    if (!allowAutoDestination) return;
    if (destinationSource === CUSTOM_DEST_OPTION)
    {
      if (!destinationAddress)
      {
        const fallback = walletAddresses[0];
        setDestinationSource(fallback);
        setDestinationAddress(fallback);
      }
      return;
    }
    if (!walletAddresses.includes(destinationSource))
    {
      const fallback = walletAddresses[0];
      setDestinationSource(fallback);
      setDestinationAddress(fallback);
    }
  }, [
    selectedWallet?.id,
    walletAddressesKey,
    destinationSource,
    destinationAddress,
    walletAddresses,
    allowAutoDestination,
  ]);

  useEffect(() =>
  {
    if (!claimData) return;
    const amount = Number(claimData.send_value_sat || 0);
    if (amount > 0) setDestAmount(amount);
  }, [claimData]);

  useEffect(() =>
  {
    if (!selectedWallet) return;
    if (!claimData?.requires_signature) return;
    if (!allowAutoDestination) return;
    const firstAddress = walletAddresses[0];
    if (!firstAddress) return;
    setDestinationAddress((prev) => prev || firstAddress);
    setDestinationSource((prev) =>
    {
      if (prev === CUSTOM_DEST_OPTION || !walletAddresses.includes(prev))
      {
        return firstAddress;
      }
      return prev;
    });
  }, [
    selectedWallet?.id,
    walletAddressesKey,
    claimData?.requires_signature,
    walletAddresses,
    allowAutoDestination,
  ]);

  async function handleDecodeBundle()
  {
    setClaimErr("");
    setClaimData(null);
    setBroadcastMsg("");
    try
    {
      const lines = (claimInput || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (lines.length === 0) throw new Error("Paste one or more UR lines");
      const decoded = await decodeUR(lines);
      const type = String(decoded?.type || "").toLowerCase();
      if (type !== "claim-bundle")
      {
        throw new Error(`Expected UR type 'claim-bundle', got '${decoded?.type || "unknown"}'`);
      }
      const parsed = parseClaimBundle(toUint8Array(decoded.cbor));
      const fundTxHex = bufferToHex(parsed.fund_txid);
      let fundingScriptHex = bufferToHex(parsed.funding_script || parsed.script);
      const memo = parsed.meta?.memo || "";
      const fundTxRawHex = bufferToHex(parsed.fund_tx || parsed.funding_tx || null);
      const rawNetworkKey = String(parsed.network || parsed.meta?.network || "").toLowerCase();
      const normalizedNetwork = normalizeNetworkKey(rawNetworkKey);
      const endpointFromBundle = String(parsed.broadcast_endpoint || parsed.meta?.broadcast_endpoint || "").trim();
      let voutIndex = Number(parsed.vout ?? 0) >>> 0;
      let prevValue = Number(parsed.value ?? parsed.send_value_sat ?? 0) >>> 0;
      let finalTxidHex = fundTxHex;
      const claimPubKeyHex = bufferToHex(parsed.R_pub || parsed.receiver_pub || parsed.claim_pubkey);
      const requiresSignature = Boolean(
        (typeof parsed.requires_signature === "boolean" && parsed.requires_signature) ||
        (typeof parsed.requires_signature === "number" && parsed.requires_signature !== 0) ||
        parsed.meta?.requires_signature || claimPubKeyHex,
      );
      if (fundTxRawHex)
      {
        let tx;
        try
        {
          tx = bitcoin.Transaction.fromHex(fundTxRawHex);
        } catch (err)
        {
          throw new Error("Claim bundle funding transaction is invalid");
        }
        finalTxidHex = tx.getId();
        if (fundingScriptHex)
        {
          const scriptBuf = Buffer.from(fundingScriptHex, "hex");
          const matchIdx = tx.outs.findIndex((out) => out.script.equals(scriptBuf));
          if (matchIdx >= 0)
          {
            voutIndex = matchIdx >>> 0;
            prevValue = Number(tx.outs[matchIdx]?.value ?? prevValue) >>> 0;
          }
        } else if (tx.outs[voutIndex])
        {
          fundingScriptHex = Buffer.from(tx.outs[voutIndex].script).toString("hex");
          prevValue = Number(tx.outs[voutIndex]?.value ?? prevValue) >>> 0;
        }
        if (!(prevValue > 0))
        {
          const fallbackOut = tx.outs[voutIndex];
          prevValue = Number(fallbackOut?.value ?? 0) >>> 0;
        }
        const endpoint = endpointFromBundle || defaultBroadcastEndpoint(normalizedNetwork);
        try
        {
          const broadcastResult = await broadcastRawTransaction(
            fundTxRawHex,
            endpoint,
            finalTxidHex,
            normalizedNetwork,
          );
          finalTxidHex = broadcastResult.txid || finalTxidHex;
          setBroadcastMsg(
            broadcastResult.alreadyKnown
              ? `Funding transaction already known (${finalTxidHex}).`
              : `Funding transaction broadcasted (${finalTxidHex}).`,
          );
        } catch (broadcastError)
        {
          const message = broadcastError instanceof Error ? broadcastError.message : String(broadcastError);
          setClaimErr(message);
          setBroadcastMsg("");
        }
      }
      const claimDetails = {
        ...parsed,
        vout: voutIndex >>> 0,
        value: prevValue >>> 0,
        fund_tx_hex: fundTxRawHex,
        fund_txid_hex: finalTxidHex,
        funding_script_hex: fundingScriptHex,
        memo,
        claim_pubkey_hex: claimPubKeyHex,
        broadcast_endpoint: endpointFromBundle || defaultBroadcastEndpoint(normalizedNetwork),
        network: normalizedNetwork,
        requires_signature: requiresSignature,
      };
      setClaimData(claimDetails);
      setFundTxId(finalTxidHex || "");
      setFundVout(voutIndex >>> 0);
      setPrevoutValue(prevValue >>> 0);
      setPrevoutScriptHex(fundingScriptHex);
      setBundleMemo(memo);
      setResultMsg("");
      setSignedHex("");
      setPsbtBase64("");
      if (requiresSignature && walletAddresses.length)
      {
        const fallbackAddress = destinationAddress && walletAddresses.includes(destinationAddress)
          ? destinationAddress
          : walletAddresses[0];
        setAllowAutoDestination(true);
        setDestinationSource(fallbackAddress);
        setDestinationAddress(fallbackAddress);
      } else
      {
        setAllowAutoDestination(false);
        setDestinationSource(CUSTOM_DEST_OPTION);
        setDestinationAddress((prev) =>
        {
          const existing = prev?.trim();
          return existing || "";
        });
      }
      if (!finalTxidHex && !fundTxRawHex)
      {
        setBroadcastMsg("Funding transaction not embedded. Enter the txid and output info once it is broadcast.");
      }
    } catch (error)
    {
      setClaimErr(error instanceof Error ? error.message : String(error));
    }
  }

  async function buildAndSign()
  {
    setClaimErr("");
    setResultMsg("");
    setSignedHex("");
    setPsbtBase64("");
    if (building) return;
    let broadcastAttempted = false;
    try
    {
      setBuilding(true);
      if (!claimData) throw new Error("Decode a claim bundle first");
      if (!selectedWallet) throw new Error("Select a wallet to sign with");
      const claimNetworkKey = normalizeNetworkKey(claimData.network || selectedWallet.network || "testnet4");
      const claimPubKeyHex = String(claimData.claim_pubkey_hex || "").trim().toLowerCase();
      const requiresSignature = Boolean(claimData.requires_signature);
      const txid = (fundTxId || claimData.fund_txid_hex || "").trim();
      if (!/^[0-9a-fA-F]{64}$/.test(txid))
      {
        throw new Error(
          "Funding txid required. Paste the broadcast transaction id (64 hex) into the Funding txid field before signing.",
        );
      }
      const vout = Number(
        (Number.isFinite(fundVout) ? fundVout : null) ?? claimData.vout ?? 0,
      ) >>> 0;
      const prevValue = Number(
        (Number.isFinite(prevoutValue) ? prevoutValue : null) ??
        claimData.value ??
        claimData.send_value_sat ??
        0,
      ) >>> 0;
      if (!(prevValue > 0)) throw new Error("Funding output value invalid");
      const payoutAddress = (destinationAddress || "").trim();
      if (!payoutAddress) throw new Error("Destination address required");
      if (!isTaprootAddress(payoutAddress))
      {
        throw new Error("Destination must be a Taproot (bc1p/tb1p) address");
      }
      const feeRateSatVb = Math.max(1, Math.trunc(Number(feeRate) || 1));
      let adjustmentNote = "";
      let payoutValue = Math.max(0, Math.trunc(Number(destAmount) || 0));
      if (!(payoutValue > 0)) throw new Error("Payout amount must be > 0");
      const secretBytes = getPreimageBytes(preimageInput);
      if (secretBytes.length === 0) throw new Error("Preimage required");

      const scriptHex = (
        prevoutScriptHex ||
        claimData.funding_script_hex ||
        ""
      ).trim();
      if (!scriptHex) throw new Error("Claim bundle missing funding script");
      const script = Buffer.from(scriptHex, "hex");
      const networkParams = claimNetworkKey === "mainnet"
        ? bitcoin.networks.bitcoin
        : bitcoin.networks.testnet;
      const psbt = new bitcoin.Psbt({ network: networkParams });
      const leafScript = {
        leafVersion: (claimData.leaf_ver ?? 0xc0) >>> 0,
        script: Buffer.from(claimData.script),
        controlBlock: Buffer.from(claimData.control || claimData.controlBlock || []),
      };
      psbt.addInput({
        hash: txid,
        index: vout,
        witnessUtxo: { script, value: prevValue },
        tapLeafScript: [leafScript],
      });

      const fee = Math.ceil(estimateVsize(1) * feeRateSatVb);
      if (prevValue < payoutValue + fee)
      {
        const adjusted = prevValue - fee;
        if (!(adjusted > 0))
        {
          throw new Error("Prevout value is insufficient for payout plus fee");
        }
        payoutValue = adjusted;
        setDestAmount(adjusted);
        adjustmentNote = `Payout adjusted to ${adjusted} sats to cover fees (~${fee} sats).`;
      }

      psbt.addOutput({ address: payoutAddress, value: payoutValue });

      let finalWitness;
      if (requiresSignature)
      {
        const signerKey = resolveClaimSigningKey({
          selectedWallet,
          claimPubKeyHex,
          network: networkParams,
        });
        const signer = {
          publicKey: Buffer.from(ecc.pointFromScalar(signerKey, true)),
          signSchnorr: (hash) => Buffer.from(nobleSchnorr.sign(hash, signerKey)),
        };

        psbt.signInput(0, signer);
        const tapSig = psbt.data.inputs[0].tapScriptSig?.[0]?.signature;
        if (!tapSig) throw new Error("Failed to produce Taproot signature");
        finalWitness = witnessStackToScriptWitness([
          Buffer.from(tapSig),
          Buffer.from(secretBytes),
          Buffer.from(claimData.script),
          Buffer.from(claimData.control || claimData.controlBlock || []),
        ]);
      } else
      {
        finalWitness = witnessStackToScriptWitness([
          Buffer.from(secretBytes),
          Buffer.from(claimData.script),
          Buffer.from(claimData.control || claimData.controlBlock || []),
        ]);
      }
      psbt.updateInput(0, { finalScriptWitness: finalWitness });

      const finalTx = psbt.extractTransaction();
      const rawHex = finalTx.toHex();
      const psbtB64 = psbt.toBase64();
      const claimTxid = finalTx.getId();
      setSignedHex(rawHex);
      setPsbtBase64(psbtB64);
      const normalizedTarget = payoutAddress.toLowerCase();
      const paysTarget = finalTx.outs.some((out) =>
      {
        try
        {
          const derived = bitcoin.address.fromOutputScript(out.script, networkParams);
          return String(derived || "").toLowerCase() === normalizedTarget;
        } catch
        {
          return false;
        }
      });
      if (!paysTarget)
      {
        throw new Error("Claim transaction build failed: destination address missing from outputs");
      }

      const broadcastEndpoint = defaultBroadcastEndpoint(claimNetworkKey);
      broadcastAttempted = true;
      const broadcastResult = await broadcastRawTransaction(
        rawHex,
        broadcastEndpoint,
        claimTxid,
        claimNetworkKey,
      );
      const broadcastTxid = broadcastResult.txid || claimTxid;
      const broadcastSummary = broadcastResult.alreadyKnown
        ? `Claim transaction already known (${broadcastTxid}).`
        : `Claim transaction broadcasted (${broadcastTxid}).`;
      setBroadcastMsg(broadcastSummary);
      const messageParts = [];
      if (adjustmentNote) messageParts.push(adjustmentNote);
      messageParts.push(broadcastSummary);
      messageParts.push("Pending balances display until the spend confirms on-chain.");
      setResultMsg(messageParts.join(" "));

      const creditWallet = findWalletByAddress(wallets, payoutAddress) || selectedWallet;
      if (creditWallet?.id)
      {
        recordWalletEvent({
          walletId: creditWallet.id,
          type: "receive",
          amountSats: payoutValue,
          description: `Claimed funds via ${broadcastTxid}`,
          relatedAddress: payoutAddress,
          source: "workflow",
        });
        await syncTaprootBalance(creditWallet, payoutAddress);
      }
      const nextWallets = loadWallets();
      setWallets(nextWallets);
      setActiveWalletState(getActiveWallet() || nextWallets[0] || null);
    } catch (error)
    {
      const message = error instanceof Error ? error.message : String(error);
      setClaimErr(message);
      if (broadcastAttempted)
      {
        setResultMsg(`Claim transaction prepared but broadcast failed: ${message}`);
      } else
      {
        setResultMsg("");
      }
      setBroadcastMsg("");
    } finally
    {
      setBuilding(false);
    }
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-600 text-white">
        Receive
      </div>
      <h1 className="text-2xl font-semibold">Receive Payment</h1>
      <p className="text-zinc-500">
        Scan or paste a claim bundle from the sender, verify the details, then claim funds to your wallet.
      </p>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Claim Bundle</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <textarea
            className="w-full rounded border px-3 py-2 font-mono min-h-[140px]"
            value={claimInput}
            onChange={(event) => setClaimInput(event.target.value)}
            placeholder="ur:claim-bundle/..."
          />
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">Scan claim bundle QR:</p>
            <CameraScanner onResult={(text) => setClaimInput(text)} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDecodeBundle}
            className="px-3 py-2 rounded bg-emerald-600 text-white"
          >
            Parse Bundle
          </button>
          {!!broadcastMsg && !claimErr && (
            <div className="text-sm text-emerald-600">{broadcastMsg}</div>
          )}
          {!!claimErr && <div className="text-sm text-red-600">{claimErr}</div>}
        </div>
        {claimData && (
          <div className="text-xs text-zinc-500 space-y-1">
            <div>Taproot output: <span className="font-mono break-all">{claimData.address || "unknown"}</span></div>
            <div>Amount committed: {claimData.send_value_sat ?? 0} sats</div>
            {!!claimData.claim_pubkey_hex && (
              <div>Claim pubkey (x-only): <span className="font-mono break-all">{claimData.claim_pubkey_hex}</span></div>
            )}
            <div>Signature required: {claimData.requires_signature ? "yes" : "no"}</div>
            {!!claimData.network && (
              <div>Network: <span className="font-mono break-all">{claimData.network}</span></div>
            )}
            {!!claimData.broadcast_endpoint && (
              <div>
                Broadcast endpoint: <span className="font-mono break-all">{claimData.broadcast_endpoint}</span>
              </div>
            )}
            <div>Expires after block: {claimData.expires_at ?? 0}</div>
            <div>Funding txid: <span className="font-mono break-all">{claimData.fund_txid_hex || "(missing)"}</span></div>
            <div>Funding vout: {claimData.vout ?? 0}</div>
            <div>Memo: {bundleMemo || "(none)"}</div>
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Claim Configuration</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Wallet</div>
            <select
              className="w-full rounded border px-3 py-2"
              value={selectedWallet?.id || selectedWalletId}
              onChange={(event) => setSelectedWalletId(event.target.value)}
            >
              {wallets.map((wallet) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.label} ({wallet.network})
                </option>
              ))}
            </select>
            <div className="text-xs text-zinc-500">
              Wallet selection is auto-filled on decode when keys match the bundle.
            </div>
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Preimage / secret</div>
            <input
              className="w-full rounded border px-3 py-2 font-mono"
              value={preimageInput}
              onChange={(event) =>
              {
                setPreimageInput(event.target.value);
                setClaimErr("");
              }}
              placeholder="Exact secret text or hex"
            />
          </label>
          <div className="space-y-2">
            <label className="space-y-1 block">
              <div className="text-sm text-zinc-500">Destination address</div>
              <select
                className="w-full rounded border px-3 py-2"
                value={destinationSource}
                onChange={(event) =>
                {
                  const value = event.target.value;
                  setClaimErr("");
                  if (value === CUSTOM_DEST_OPTION)
                  {
                    setDestinationSource(CUSTOM_DEST_OPTION);
                    setAllowAutoDestination(false);
                    return;
                  }
                  setAllowAutoDestination(true);
                  setDestinationSource(value);
                  setDestinationAddress(value);
                }}
              >
                {walletAddresses.map((addr) => (
                  <option key={addr} value={addr}>
                    {formatAddressLabel(addr)}
                  </option>
                ))}
                <option value={CUSTOM_DEST_OPTION}>Custom address…</option>
              </select>
            </label>
            <input
              className="w-full rounded border px-3 py-2"
              value={destinationAddress}
              onChange={(event) =>
              {
                if (destinationSource !== CUSTOM_DEST_OPTION) return;
                setAllowAutoDestination(false);
                setDestinationAddress(event.target.value);
                setClaimErr("");
              }}
              placeholder="tb1..."
              readOnly={destinationSource !== CUSTOM_DEST_OPTION}
            />
            {destinationSource !== CUSTOM_DEST_OPTION ? (
              <div className="text-xs text-zinc-500">Using wallet address selected above. Choose “Custom address…” to paste an external one.</div>
            ) : (
              <div className="text-xs text-zinc-500">Paste any valid Taproot address.</div>
            )}
          </div>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Destination amount (sats)</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={destAmount}
              min={0}
              step={1}
              onWheel={(event) => event.currentTarget.blur()}
              onKeyDown={(event) =>
              {
                if (["-", "e", "E", "+"].includes(event.key)) event.preventDefault();
              }}
              onChange={(event) =>
              {
                setDestAmount(Number(event.target.value) || 0);
                setClaimErr("");
              }}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">Funding txid (64 hex)</div>
            <input
              className="w-full rounded border px-3 py-2 font-mono"
              value={fundTxId}
              onChange={(event) =>
              {
                setFundTxId(event.target.value.trim());
                setClaimErr("");
              }}
              placeholder="64 hex characters"
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Funding vout index</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={fundVout}
              min={0}
              onChange={(event) =>
              {
                setFundVout(Number(event.target.value) || 0);
                setClaimErr("");
              }}
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Funding value (sats)</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={prevoutValue}
              min={0}
              onWheel={(event) => event.currentTarget.blur()}
              onChange={(event) =>
              {
                setPrevoutValue(Number(event.target.value) || 0);
                setClaimErr("");
              }}
            />
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">Funding script (hex)</div>
            <textarea
              className="w-full rounded border px-3 py-2 font-mono"
              rows={2}
              value={prevoutScriptHex}
              onChange={(event) =>
              {
                setPrevoutScriptHex(event.target.value.trim());
                setClaimErr("");
              }}
              placeholder="5120..."
            />
          </label>
          <div className="md:col-span-2 text-xs text-zinc-500">
            Enter the funding details after the sender provides the transaction id and output information.
          </div>
        </div>
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Fees & Signing</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Fee rate (sat/vB)</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={feeRate}
              min={1}
              onWheel={(event) => event.currentTarget.blur()}
              onKeyDown={(event) =>
              {
                if (["-", "e", "E", "+"].includes(event.key)) event.preventDefault();
              }}
              onChange={(event) =>
              {
                setFeeRate(Number(event.target.value) || 1);
                setClaimErr("");
              }}
            />
          </label>
        </div>
        {/* Expiry Warning */}
        {isExpired && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-700 space-y-1">
            <div className="font-medium">⚠️ This claim bundle has expired</div>
            <div className="text-sm">
              Current block height ({currentHeight?.toLocaleString()}) has reached or exceeded the expiry height ({claimData?.expires_at?.toLocaleString()}).
              Only the sender can now reclaim these funds via the refund path.
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={buildAndSign}
            className={`px-3 py-2 rounded text-white ${isExpired ? "bg-zinc-400 cursor-not-allowed" : "bg-emerald-600"}`}
            disabled={building || isExpired}
            title={isExpired ? "Cannot claim after expiry" : undefined}
          >
            {building ? "Claiming..." : isExpired ? "Expired - Cannot Claim" : "Claim Funds"}
          </button>
          {!!resultMsg && <div className="text-sm text-emerald-600">{resultMsg}</div>}
        </div>
        {currentHeight !== null && claimData?.expires_at && !isExpired && (
          <div className="text-xs text-zinc-500">
            Current block: {currentHeight.toLocaleString()} · Expires at block: {claimData.expires_at.toLocaleString()} ·
            {claimData.expires_at - currentHeight} blocks remaining
          </div>
        )}
        {psbtBase64 && (
          <div className="text-xs text-zinc-500">
            PSBT (base64):
            <textarea
              className="w-full rounded border px-3 py-2 font-mono mt-2"
              rows={3}
              readOnly
              value={psbtBase64}
            />
          </div>
        )}
        {signedHex && (
          <div className="space-y-2">
            <div className="text-sm text-zinc-500">Signed transaction (hex)</div>
            <textarea
              className="w-full rounded border px-3 py-2 font-mono min-h-[120px]"
              readOnly
              value={signedHex}
            />
            <button
              className="px-3 py-2 rounded border"
              onClick={() => copyToClipboard(signedHex)}
            >
              Copy hex
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default function ReceiverPage()
{
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ReceiverInner />
    </Suspense>
  );
}

async function broadcastRawTransaction(rawHex, endpoint, fallbackTxid, networkKey)
{
  const normalizedNetwork = normalizeNetworkKey(networkKey);
  const payload = {
    hex: rawHex,
    endpoint: endpoint || defaultBroadcastEndpoint(normalizedNetwork),
    network: normalizedNetwork,
  };
  const resp = await fetch("/api/broadcast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let json;
  try
  {
    json = await resp.json();
  } catch
  {
    throw new Error("Broadcast failed: invalid response from endpoint");
  }
  if (json?.ok && json?.txid)
  {
    return { txid: json.txid, alreadyKnown: false };
  }
  const errorText = String(json?.error || `Broadcast failed (status ${json?.status || resp.status})`);
  if (looksLikeAlreadyBroadcast(errorText))
  {
    return { txid: fallbackTxid, alreadyKnown: true };
  }
  throw new Error(errorText);
}

function looksLikeAlreadyBroadcast(message)
{
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("already in the mempool") ||
    lower.includes("already known") ||
    lower.includes("transaction already exists") ||
    lower.includes("already in mempool")
  );
}

async function syncTaprootBalance(wallet, preferredAddress)
{
  try
  {
    if (!wallet?.id) return;
    const networkKey = normalizeNetworkKey(wallet?.network || "testnet4");
    const addressList = Array.isArray(wallet?.taprootAddresses)
      ? wallet.taprootAddresses
      : [];
    const uniqueAddresses = Array.from(
      new Set(
        [wallet.p2tr, preferredAddress, ...addressList]
          .map((addr) => (typeof addr === "string" ? addr.trim() : ""))
          .filter((addr) => addr && /^(bc1p|tb1p|bcrt1p)/i.test(addr)),
      ),
    );
    if (uniqueAddresses.length === 0) return;
    let totalConfirmed = 0;
    let totalPending = 0;
    const queried = [];
    for (const address of uniqueAddresses)
    {
      try
      {
        const params = new URLSearchParams({
          address,
          network: networkKey,
        });
        const res = await fetch(`/api/utxos?${params.toString()}`, {
          headers: { "content-type": "application/json" },
          cache: "no-store",
        });
        if (!res.ok) continue;
        const data = await res.json().catch(() => null);
        if (!data?.utxos) continue;
        const confirmed = data.utxos
          .filter((utxo) => String(utxo.scriptHex || "").toLowerCase().startsWith("5120"))
          .filter((utxo) => Number(utxo.confirmations || 0) > 0)
          .reduce((sum, utxo) => sum + Number(utxo.value || 0), 0);
        const pending = data.utxos
          .filter((utxo) => String(utxo.scriptHex || "").toLowerCase().startsWith("5120"))
          .filter((utxo) => Number(utxo.confirmations || 0) <= 0)
          .reduce((sum, utxo) => sum + Number(utxo.value || 0), 0);
        totalConfirmed += confirmed;
        totalPending += pending;
        queried.push(address);
      } catch (error)
      {
        console.warn("taproot balance sub-sync failed", address, error);
      }
    }
    if (!queried.length) return;
    setWalletBalance(
      wallet.id,
      totalConfirmed,
      `Synced via Refresh (${queried.join(", ")})`,
      "sync",
      { pendingSats: totalPending },
    );
  } catch (error)
  {
    console.warn("auto taproot balance sync failed", error);
  }
}

function normalizeNetworkKey(networkKey)
{
  const key = String(networkKey || "").toLowerCase();
  if (key === "mainnet") return "mainnet";
  if (key === "testnet") return "testnet";
  if (key === "signet") return "signet";
  if (key === "testnet4") return "testnet4";
  return "testnet4";
}

function defaultBroadcastEndpoint(networkKey)
{
  const key = normalizeNetworkKey(networkKey);
  return BROADCAST_ENDPOINT_DEFAULTS[key] || BROADCAST_ENDPOINT_DEFAULTS.testnet4;
}

function findWalletByAddress(walletsList, address)
{
  if (!Array.isArray(walletsList) || !address) return null;
  const target = address.trim().toLowerCase();
  if (!target) return null;
  for (const wallet of walletsList)
  {
    if (!wallet) continue;
    const known = [
      wallet.p2tr,
      ...(Array.isArray(wallet.taprootAddresses) ? wallet.taprootAddresses : []),
    ]
      .map((addr) => (typeof addr === "string" ? addr.trim().toLowerCase() : ""))
      .filter(Boolean);
    if (known.includes(target))
    {
      return wallet;
    }
  }
  return null;
}

function formatAddressLabel(address = "")
{
  const trimmed = address.trim();
  if (trimmed.length <= 18) return trimmed;
  return `${trimmed.slice(0, 10)}…${trimmed.slice(-6)}`;
}

function toUint8Array(x)
{
  if (x instanceof Uint8Array) return x;
  if (Array.isArray(x)) return Uint8Array.from(x);
  if (x && typeof x === "object")
  {
    if (x.type === "Buffer" && Array.isArray(x.data)) return Uint8Array.from(x.data);
    if (x.buffer instanceof ArrayBuffer && typeof x.byteLength === "number")
    {
      return new Uint8Array(x.buffer, x.byteOffset || 0, x.byteLength);
    }
  }
  return new Uint8Array();
}

function parseMaybeHex(value)
{
  if (!value) return null;
  const clean = value.trim().replace(/^0x/i, "");
  if (clean.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(clean))
  {
    return Buffer.from(clean, "hex");
  }
  return null;
}

function bufferToHex(value)
{
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (Array.isArray(value)) return Buffer.from(value).toString("hex");
  if (value.buffer instanceof ArrayBuffer) return Buffer.from(value).toString("hex");
  return "";
}

function getPreimageBytes(input)
{
  const hex = parseMaybeHex(input);
  if (hex) return hex;
  return Buffer.from(input || "", "utf8");
}

function getPrivateKeyFromWallet(wallet, network)
{
  const ECPair = ECPairFactory(ecc);
  const wif = (wallet.wif || "").trim();
  if (!wif) throw new Error("Wallet missing WIF");
  const kp = ECPair.fromWIF(wif, network);
  if (!kp?.privateKey) throw new Error("Failed to derive wallet private key");
  return Buffer.from(kp.privateKey);
}

function resolveClaimSigningKey({ selectedWallet, claimPubKeyHex, network })
{
  const normalizedClaimPub = (claimPubKeyHex || "").trim().toLowerCase();
  const walletKey = getPrivateKeyFromWallet(selectedWallet, network);
  const walletXOnly = toXOnlyHex(walletKey);
  if (!normalizedClaimPub || walletXOnly === normalizedClaimPub)
  {
    return walletKey;
  }
  throw new Error(
    `Loaded wallet does not control this claim. Expected x-only ${normalizedClaimPub}, but active wallet has ${walletXOnly}. Switch to/import the correct wallet or regenerate the claim bundle.`,
  );
}

function toXOnlyHex(privateKeyBuffer)
{
  if (!privateKeyBuffer) return "";
  const publicKey = ecc.pointFromScalar(privateKeyBuffer, true);
  if (!publicKey) return "";
  return Buffer.from(publicKey.slice(1, 33)).toString("hex").toLowerCase();
}

function isTaprootAddress(address = "")
{
  const lowered = address.trim().toLowerCase();
  return lowered.startsWith("bc1p") || lowered.startsWith("tb1p") || lowered.startsWith("bcrt1p");
}

function estimateVsize(outputCount = 1)
{
  return 140 + outputCount * 43;
}

function varint(n)
{
  if (n < 0xfd) return Buffer.from([n]);
  if (n <= 0xffff) return Buffer.from([0xfd, n & 0xff, (n >> 8) & 0xff]);
  if (n <= 0xffffffff)
  {
    return Buffer.from([
      0xfe,
      n & 0xff,
      (n >> 8) & 0xff,
      (n >> 16) & 0xff,
      (n >> 24) & 0xff,
    ]);
  }
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

function witnessStackToScriptWitness(witness)
{
  const parts = [varint(witness.length)];
  for (const item of witness)
  {
    const buf = Buffer.isBuffer(item) ? item : Buffer.from(item);
    parts.push(varint(buf.length));
    parts.push(buf);
  }
  const total = parts.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of parts)
  {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return Buffer.from(out);
}

"use client";

import { useMemo, useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { schnorr as nobleSchnorr } from "@noble/curves/secp256k1";
import { decodeUR } from "@/lib/offline-core";

function RefundContent() {
  const searchParams = useSearchParams();

  const [networkKey, setNetworkKey] = useState("testnet4");
  const [psbtInput, setPsbtInput] = useState("");
  const [importErr, setImportErr] = useState("");
  const [psbtInfo, setPsbtInfo] = useState(null);
  const [psbtBuf, setPsbtBuf] = useState(null);
  const [inputIndex, setInputIndex] = useState(0);
  const [preimageInput, setPreimageInput] = useState("");
  const [signerPrivInput, setSignerPrivInput] = useState("");
  const [signErr, setSignErr] = useState("");
  const [signedHex, setSignedHex] = useState("");
  const [feeRate, setFeeRate] = useState(2);
  const [feeInfo, setFeeInfo] = useState(null);
  const [expiryHeight, setExpiryHeight] = useState(null);
  const [currentHeight, setCurrentHeight] = useState(null);
  const [heightCheckErr, setHeightCheckErr] = useState("");

  const network = useMemo(() => {
    if (networkKey === "mainnet") return bitcoin.networks.bitcoin;
    return bitcoin.networks.testnet;
  }, [networkKey]);

  const handleImportPsbt = useCallback(async () => {
    setImportErr("");
    setPsbtInfo(null);
    setPsbtBuf(null);
    setExpiryHeight(null);
    setCurrentHeight(null);
    setHeightCheckErr("");
    try {
      const text = (psbtInput || "").trim();
      if (!text) throw new Error("Paste a PSBT (base64) or UR parts");
      let buf;
      if (/^ur:/.test(text) || text.includes("ur:")) {
        const lines = text
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        const out = await decodeUR(lines);
        const bytes = toU8(out.cbor);
        buf = Buffer.from(bytes);
      } else {
        // try base64
        try {
          const tmp = bitcoin.Psbt.fromBase64(text, { network });
          buf = tmp.toBuffer();
        } catch (e) {
          throw new Error("Invalid PSBT: expected base64 or a UR");
        }
      }
      const psbt = bitcoin.Psbt.fromBuffer(buf, { network });
      console.log(`psbt input is ${psbt.data.inputs[0]}`);
      if (!psbt.data.inputs[0].tapLeafScript) {
        setImportErr("PSBT is missing tapLeafScript");
      }
      console.log(JSON.stringify(psbt.data.inputs, null, 2));

      // Extract locktime (expiry height)
      const locktime = psbt.locktime || psbt.data.globalMap?.unsignedTx?.tx?.locktime || 0;
      if (locktime > 0) {
        setExpiryHeight(locktime);

        // Fetch current block height
        try {
          const endpoint = networkKey === "mainnet"
            ? "https://mempool.space"
            : `https://mempool.space/${networkKey}`;
          const response = await fetch(`${endpoint}/api/blocks/tip/height`);
          if (response.ok) {
            const height = await response.text();
            setCurrentHeight(Number(height));
          }
        } catch (err) {
          setHeightCheckErr("Unable to fetch current block height. Proceed with caution.");
        }
      }

      setPsbtBuf(buf);
      setPsbtInfo({
        inputs: psbt.inputCount,
        outputs:
          psbt.txOutputs?.length ||
          psbt.data.globalMap.unsignedTx.tx.outs?.length ||
          0,
      });
    } catch (e) {
      setImportErr(String(e?.message || e));
    }
  }, [psbtInput, network, networkKey]);

  useEffect(() => {
    const psbtFromQuery = searchParams.get("psbt");
    if (psbtFromQuery) {
      setPsbtInput(psbtFromQuery);
      handleImportPsbt();
    }
  }, [searchParams, handleImportPsbt]);

  function toU8(x) {
    if (x instanceof Uint8Array) return x;
    if (x && typeof x === "object") {
      if (x.type === "Buffer" && Array.isArray(x.data))
        return Uint8Array.from(x.data);
      if (x.buffer instanceof ArrayBuffer && typeof x.byteLength === "number") {
        const offset = x.byteOffset || 0;
        const length = x.byteLength;
        return new Uint8Array(x.buffer, offset, length);
      }
      if (Array.isArray(x)) return Uint8Array.from(x);
    }
    try {
      return new Uint8Array(x);
    } catch {}
    throw new Error("Unsupported byte source");
  }

  function parseMaybeHex(input) {
    const s = (input || "").trim();
    const hex = s.replace(/^0x/i, "");
    if (hex.length > 0 && /^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      return Buffer.from(hex, "hex");
    }
    return null;
  }

  function varint(n) {
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

  function witnessStackToScriptWitness(witness) {
    const parts = [varint(witness.length)];
    for (const w of witness) {
      const b = Buffer.isBuffer(w) ? w : Buffer.from(w);
      parts.push(varint(b.length));
      parts.push(b);
    }
    // Concat via typed arrays to avoid Buffer.concat polyfill issues
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return Buffer.from(out);
  }

  function estimateVsize(outputCount = 1) {
    // Taproot script-path spend estimate
    // Base: ~110 bytes + witness data (~150 bytes for script path) + outputs
    return 140 + outputCount * 43;
  }

  async function handleSign() {
    setSignErr("");
    setSignedHex("");
    setFeeInfo(null);
    try {
      if (!psbtBuf) throw new Error("Import a PSBT first");

      // Validate timelock
      if (expiryHeight && currentHeight) {
        if (currentHeight < expiryHeight) {
          const blocksRemaining = expiryHeight - currentHeight;
          throw new Error(
            `Timelock not yet reached. Current height: ${currentHeight}, Expiry: ${expiryHeight}. ` +
            `Wait ${blocksRemaining} more block${blocksRemaining !== 1 ? 's' : ''} (~${Math.ceil(blocksRemaining * 10)} minutes).`
          );
        }
      }

      const psbt = bitcoin.Psbt.fromBuffer(psbtBuf, { network });
      const idx = Number(inputIndex) >>> 0;
      if (idx >= psbt.inputCount) throw new Error("Input index out of range");
      const inp = psbt.data.inputs[idx];
      if (!inp.tapLeafScript || inp.tapLeafScript.length === 0)
        throw new Error("PSBT missing tapLeafScript for input");

      // Calculate fee and adjust output
      const feeRateSatVb = Math.max(1, Math.trunc(Number(feeRate) || 1));
      const estimatedFee = Math.ceil(estimateVsize(1) * feeRateSatVb);

      const inputValue = inp.witnessUtxo?.value || 0;
      if (!inputValue) throw new Error("PSBT input missing value");

      const adjustedOutputValue = inputValue - estimatedFee;
      if (adjustedOutputValue <= 546) {
        throw new Error(`Fee too high. Input: ${inputValue} sats, Fee: ${estimatedFee} sats. Output would be below dust limit (546 sats).`);
      }

      // Update the output value to account for fees
      if (psbt.txOutputs && psbt.txOutputs.length > 0) {
        const originalValue = psbt.txOutputs[0].value;
        psbt.updateOutput(0, { value: adjustedOutputValue });
        setFeeInfo({
          original: originalValue,
          adjusted: adjustedOutputValue,
          fee: estimatedFee,
          feeRate: feeRateSatVb,
        });
      }
      // Prepare private key for R
      // Preimage: accept hex (any length) or text (UTF-8)
      let xBytes = parseMaybeHex(preimageInput);
      if (!xBytes) xBytes = Buffer.from(preimageInput, "utf8");
      if (xBytes.length === 0)
        throw new Error("Preimage x required (hex or text)");

      // R private key: accept 32-byte hex or WIF
      let seckey;
      const hexPriv = parseMaybeHex(signerPrivInput);
      if (hexPriv) {
        if (hexPriv.length !== 32)
          throw new Error("Hex private key must be 32 bytes (64 hex chars)");
        seckey = Buffer.from(hexPriv);
      } else {
        try {
          const ECPair = ECPairFactory(ecc);
          const kp = ECPair.fromWIF(signerPrivInput.trim(), network);
          if (!kp?.privateKey) throw new Error("Invalid WIF");
          seckey = Buffer.from(kp.privateKey);
        } catch (e) {
          throw new Error("R private key must be WIF or 32-byte hex");
        }
      }
      const pub33 = Buffer.from(ecc.pointFromScalar(seckey, true));
      if (!pub33) throw new Error("Invalid R private key");

      // Create a minimal signer that bitcoinjs can use for Schnorr
      const signer = {
        publicKey: pub33,
        signSchnorr: (hash) => {
          const sig = nobleSchnorr.sign(hash, seckey);
          return Buffer.from(sig);
        },
      };

      // Ask bitcoinjs to compute the taproot script-path sighash and produce tapScriptSig
      psbt.signInput(idx, signer);

      const tss = psbt.data.inputs[idx].tapScriptSig;
      if (!tss || tss.length === 0)
        throw new Error("Failed to produce tapScriptSig");
      const sig = tss[0].signature; // 64 bytes (DEFAULT sighash)

      const leaf = inp.tapLeafScript[0];
      const script = Buffer.from(leaf.script);
      const control = Buffer.from(leaf.controlBlock || leaf.control);
      if (!control || control.length === 0)
        throw new Error("Missing control block in PSBT input");

      // Our script expects [sigR, x, script, control]
      const witness = [Buffer.from(sig), Buffer.from(xBytes), script, control];
      const finalScriptWitness = witnessStackToScriptWitness(witness);

      psbt.updateInput(idx, { finalScriptWitness });

      const tx = psbt.extractTransaction();
      const hexOut = tx.toHex();
      setSignedHex(hexOut);
    } catch (e) {
      setSignErr(String(e?.message || e));
    }
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-600 text-white">
        REFUND
      </div>
      <h1 className="text-2xl font-semibold">Refund Finalization (Offline)</h1>
      <p className="text-zinc-500">
        Import the refund PSBT, provide the original preimage and your funding wallet key to produce the final refund transaction.
      </p>

      <section className="rounded-lg border p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Network</div>
            <select
              className="w-full rounded border px-3 py-2"
              value={networkKey}
              onChange={(e) => setNetworkKey(e.target.value)}
            >
              <option value="testnet4">testnet4</option>
              <option value="signet">signet</option>
              <option value="testnet">testnet</option>
              <option value="mainnet">mainnet</option>
            </select>
          </label>
        </div>
        <div className="text-sm text-zinc-500">
          Paste PSBT (base64) or UR parts below
        </div>
        <textarea
          className="w-full rounded border px-3 py-2 font-mono min-h-[120px]"
          value={psbtInput}
          onChange={(e) => setPsbtInput(e.target.value)}
          placeholder="cHNidP8BA... or ur:crypto-psbt/..."
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleImportPsbt}
            className="px-3 py-2 rounded bg-blue-600 text-white"
          >
            Decode PSBT
          </button>
          {!!importErr && (
            <div className="text-sm text-red-600">{importErr}</div>
          )}
        </div>
        {psbtInfo && (
          <div className="space-y-2">
            <div className="text-sm text-zinc-600">
              Inputs: {psbtInfo.inputs} · Outputs: {psbtInfo.outputs}
            </div>
            {expiryHeight && (
              <div className="rounded border p-3 space-y-1">
                <div className="text-sm font-medium">Timelock Status</div>
                <div className="text-sm text-zinc-600">
                  Expiry Height: <span className="font-mono">{expiryHeight}</span>
                </div>
                {currentHeight && (
                  <>
                    <div className="text-sm text-zinc-600">
                      Current Height: <span className="font-mono">{currentHeight}</span>
                    </div>
                    {currentHeight >= expiryHeight ? (
                      <div className="text-sm text-green-600 font-medium">
                        ✓ Timelock reached - ready to sign
                      </div>
                    ) : (
                      <div className="text-sm text-amber-600 font-medium">
                        ⚠ Timelock NOT reached - wait {expiryHeight - currentHeight} more blocks
                        (~{Math.ceil((expiryHeight - currentHeight) * 10)} minutes)
                      </div>
                    )}
                  </>
                )}
                {heightCheckErr && (
                  <div className="text-sm text-amber-600">{heightCheckErr}</div>
                )}
              </div>
            )}
          </div>
        )}
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
              step={1}
              onChange={(e) => setFeeRate(Number(e.target.value) || 1)}
              onWheel={(e) => e.currentTarget.blur()}
              onKeyDown={(e) => {
                if (["-", "e", "E", "+"].includes(e.key)) e.preventDefault();
              }}
            />
            <div className="text-xs text-zinc-500">
              Estimated fee: ~{Math.ceil(estimateVsize(1) * feeRate)} sats
            </div>
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Input index</div>
            <input
              type="number"
              className="w-full rounded border px-3 py-2"
              value={inputIndex}
              onChange={(e) => setInputIndex(Number(e.target.value) || 0)}
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">
              Preimage x (hex or text)
            </div>
            <input
              className="w-full rounded border px-3 py-2 font-mono"
              value={preimageInput}
              onChange={(e) => setPreimageInput(e.target.value)}
              placeholder="hex (even length) or free text"
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">
              Funding private key (WIF or 32-byte hex)
            </div>
            <input
              className="w-full rounded border px-3 py-2 font-mono"
              value={signerPrivInput}
              onChange={(e) => setSignerPrivInput(e.target.value)}
              placeholder="WIF (c.../L.../K...) or 64 hex chars"
            />
            <div className="text-xs text-zinc-500">
              Both WIF and raw 32-byte hex are supported.
            </div>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSign}
            className="px-3 py-2 rounded bg-emerald-600 text-white"
          >
            Sign Refund
          </button>
          {!!signErr && <div className="text-sm text-red-600">{signErr}</div>}
        </div>
        {!!feeInfo && (
          <div className="rounded bg-blue-50 border border-blue-200 p-3 text-sm">
            <div className="font-medium text-blue-900 mb-1">Fee Adjustment</div>
            <div className="text-blue-800 space-y-1">
              <div>Original output: {feeInfo.original} sats</div>
              <div>Adjusted output: {feeInfo.adjusted} sats</div>
              <div>Fee: {feeInfo.fee} sats ({feeInfo.feeRate} sat/vB)</div>
            </div>
          </div>
        )}
        {!!signedHex && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">Signed transaction (hex)</div>
            <textarea
              className="w-full rounded border px-3 py-2 font-mono min-h-[100px]"
              readOnly
              value={signedHex}
            />
            <div className="text-xs text-zinc-500">
              Broadcast this on {networkKey} using your broadcaster. On this project, use the Watch page's broadcast or your node.
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default function Refund() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <RefundContent />
    </Suspense>
  );
}

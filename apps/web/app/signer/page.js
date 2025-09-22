"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useSearchParams } from 'next/navigation';
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { schnorr as nobleSchnorr } from "@noble/curves/secp256k1";
import { decodeUR } from "@offline/core";

export default function Signer() {
  const searchParams = useSearchParams();

  const [networkKey, setNetworkKey] = useState("signet");
  const [psbtInput, setPsbtInput] = useState("");
  const [importErr, setImportErr] = useState("");
  const [psbtInfo, setPsbtInfo] = useState(null);
  const [psbtBuf, setPsbtBuf] = useState(null);
  const [inputIndex, setInputIndex] = useState(0);
  const [preimageInput, setPreimageInput] = useState("");
  const [rPrivInput, setRPrivInput] = useState("");
  const [signErr, setSignErr] = useState("");
  const [signedHex, setSignedHex] = useState("");

  const network = useMemo(() => {
    if (networkKey === "mainnet") return bitcoin.networks.bitcoin;
    return bitcoin.networks.testnet; // use testnet params for signet & testnet
  }, [networkKey]);

  const handleImportPsbt = useCallback(async () => {
    setImportErr("");
    setPsbtInfo(null);
    setPsbtBuf(null);
    try {
      const text = (psbtInput || "").trim();
      if (!text) throw new Error("Paste a PSBT (base64) or UR parts");
      let buf;
      if (/^ur:/.test(text) || text.includes("ur:")) {
        const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
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
      if (!psbt.data.inputs[0].tapLeafScript) {
        setImportErr("PSBT is missing tapLeafScript");
      }
      console.log(JSON.stringify(psbt.data.inputs, null, 2));
      setPsbtBuf(buf);
      setPsbtInfo({ inputs: psbt.inputCount, outputs: psbt.txOutputs?.length || psbt.data.globalMap.unsignedTx.tx.outs?.length || 0 });
    } catch (e) {
      setImportErr(String(e?.message || e));
    }
  }, [psbtInput, network]);

  useEffect(() => {
    const psbtFromQuery = searchParams.get('psbt');
    if (psbtFromQuery) {
      setPsbtInput(psbtFromQuery);
      handleImportPsbt();
    }
  }, [searchParams, handleImportPsbt]);



  function toU8(x) {
    if (x instanceof Uint8Array) return x;
    if (x && typeof x === "object") {
      if (x.type === "Buffer" && Array.isArray(x.data)) return Uint8Array.from(x.data);
      if (x.buffer instanceof ArrayBuffer && typeof x.byteLength === "number") {
        const offset = x.byteOffset || 0;
        const length = x.byteLength;
        return new Uint8Array(x.buffer, offset, length);
      }
      if (Array.isArray(x)) return Uint8Array.from(x);
    }
    try { return new Uint8Array(x); } catch {}
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
    if (n <= 0xffffffff) return Buffer.from([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
    const hi = Math.floor(n / 2 ** 32) >>> 0;
    const lo = (n >>> 0);
    return Buffer.from([0xff,
      lo & 0xff, (lo >> 8) & 0xff, (lo >> 16) & 0xff, (lo >> 24) & 0xff,
      hi & 0xff, (hi >> 8) & 0xff, (hi >> 16) & 0xff, (hi >> 24) & 0xff,
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
    for (const p of parts) { out.set(p, off); off += p.length; }
    return Buffer.from(out);
  }

  async function handleSign() {
    setSignErr("");
    setSignedHex("");
    try {
      if (!psbtBuf) throw new Error("Import a PSBT first");
      const psbt = bitcoin.Psbt.fromBuffer(psbtBuf, { network });
      const idx = Number(inputIndex) >>> 0;
      if (idx >= psbt.inputCount) throw new Error("Input index out of range");
      const inp = psbt.data.inputs[idx];
      if (!inp.tapLeafScript || inp.tapLeafScript.length === 0) throw new Error("PSBT missing tapLeafScript for input");
      // Prepare private key for R
      // Preimage: accept hex (any length) or text (UTF-8)
      let xBytes = parseMaybeHex(preimageInput);
      if (!xBytes) xBytes = Buffer.from(preimageInput, "utf8");
      if (xBytes.length === 0) throw new Error("Preimage x required (hex or text)");

      // R private key: accept 32-byte hex or WIF
      let seckey;
      const hexPriv = parseMaybeHex(rPrivInput);
      if (hexPriv) {
        if (hexPriv.length !== 32) throw new Error("Hex private key must be 32 bytes (64 hex chars)");
        seckey = Buffer.from(hexPriv);
      } else {
        try {
          const ECPair = ECPairFactory(ecc);
          const kp = ECPair.fromWIF(rPrivInput.trim(), network);
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
      if (!tss || tss.length === 0) throw new Error("Failed to produce tapScriptSig");
      const sig = tss[0].signature; // 64 bytes (DEFAULT sighash)

      const leaf = inp.tapLeafScript[0];
      const script = Buffer.from(leaf.script);
      const control = Buffer.from(leaf.controlBlock || leaf.control);
      if (!control || control.length === 0) throw new Error("Missing control block in PSBT input");

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
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600 text-white">SIGNER</div>
      <h1 className="text-2xl font-semibold">Claim Finalization (Offline Signer)</h1>
      <p className="text-zinc-500">Import the Claim PSBT, provide the preimage x and the R private key to produce a fully signed transaction.</p>

      <section className="rounded-lg border p-4 space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Network</div>
            <select className="w-full rounded border px-3 py-2" value={networkKey} onChange={e=>setNetworkKey(e.target.value)}>
              <option value="signet">signet</option>
              <option value="testnet">testnet</option>
              <option value="mainnet">mainnet</option>
            </select>
          </label>
        </div>
        <div className="text-sm text-zinc-500">Paste PSBT (base64) or UR parts below</div>
        <textarea className="w-full rounded border px-3 py-2 font-mono min-h-[120px]" value={psbtInput} onChange={e=>setPsbtInput(e.target.value)} placeholder="cHNidP8BA... or ur:crypto-psbt/..." />
        <div className="flex items-center gap-2">
          <button onClick={handleImportPsbt} className="px-3 py-2 rounded bg-blue-600 text-white">Decode PSBT</button>
          {!!importErr && <div className="text-sm text-red-600">{importErr}</div>}
        </div>
        {psbtInfo && (
          <div className="text-sm text-zinc-600">Inputs: {psbtInfo.inputs} · Outputs: {psbtInfo.outputs}</div>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Sign Claim</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Input index</div>
            <input type="number" className="w-full rounded border px-3 py-2" value={inputIndex} onChange={e=>setInputIndex(Number(e.target.value)||0)} />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Preimage x (hex or text)</div>
            <input className="w-full rounded border px-3 py-2 font-mono" value={preimageInput} onChange={e=>setPreimageInput(e.target.value)} placeholder="hex (even length) or free text" />
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">R Private Key (WIF or 32-byte hex)</div>
            <input className="w-full rounded border px-3 py-2 font-mono" value={rPrivInput} onChange={e=>setRPrivInput(e.target.value)} placeholder="WIF (c.../L.../K...) or 64 hex chars" />
            <div className="text-xs text-zinc-500">Both WIF and raw 32-byte hex are supported.</div>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSign} className="px-3 py-2 rounded bg-emerald-600 text-white">Sign Claim</button>
          {!!signErr && <div className="text-sm text-red-600">{signErr}</div>}
        </div>
        {!!signedHex && (
          <div className="text-sm space-y-1">
            <div className="text-zinc-500">Signed transaction (hex)</div>
            <textarea className="w-full rounded border px-3 py-2 font-mono min-h-[100px]" readOnly value={signedHex} />
            <div className="text-xs text-zinc-500">Broadcast this on signet/testnet using your broadcaster. On this project, use the Watch page's broadcast or your node.</div>
          </div>
        )}
      </section>
    </main>
  );
}

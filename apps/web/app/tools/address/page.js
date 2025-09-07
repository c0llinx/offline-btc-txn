"use client";

import { useMemo, useState } from "react";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";

export default function AddressTool() {
  useMemo(() => { try { bitcoin.initEccLib(ecc); } catch {} }, []);

  const [networkKey, setNetworkKey] = useState("signet");
  const [privInput, setPrivInput] = useState("");
  const [err, setErr] = useState("");
  const [p2wpkh, setP2wpkh] = useState(null);
  const [p2tr, setP2tr] = useState(null);

  const network = useMemo(() => {
    if (networkKey === "mainnet") return bitcoin.networks.bitcoin;
    return bitcoin.networks.testnet; // signet/testnet share params
  }, [networkKey]);

  function parseMaybeHex(input) {
    const s = (input || "").trim();
    const hex = s.replace(/^0x/i, "");
    if (hex.length > 0 && /^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
      return Buffer.from(hex, "hex");
    }
    return null;
  }

  function derive() {
    setErr("");
    setP2wpkh(null);
    setP2tr(null);
    try {
      const ECPair = ECPairFactory(ecc);
      let seckey;
      const hex = parseMaybeHex(privInput);
      if (hex) {
        if (hex.length !== 32) throw new Error("Hex private key must be 32 bytes (64 hex chars)");
        seckey = Buffer.from(hex);
      } else {
        const kp = ECPair.fromWIF(privInput.trim(), network);
        if (!kp?.privateKey) throw new Error("Invalid WIF");
        seckey = Buffer.from(kp.privateKey);
      }
      // Public key
      const pub33 = Buffer.from(ecc.pointFromScalar(seckey, true));
      if (!pub33) throw new Error("Invalid private key");

      // P2WPKH (tb1q...)
      const wpkh = bitcoin.payments.p2wpkh({ pubkey: pub33, network });
      // P2TR single-key (tb1p...) using x-only
      const xonly = pub33.slice(1, 33);
      const tr = bitcoin.payments.p2tr({ internalPubkey: xonly, network });

      setP2wpkh({ address: wpkh.address || "", scriptHex: (wpkh.output||Buffer.alloc(0)).toString("hex") });
      setP2tr({ address: tr.address || "", scriptHex: (tr.output||Buffer.alloc(0)).toString("hex") });
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600 text-white">TOOLS</div>
      <h1 className="text-2xl font-semibold">Address Tool</h1>
      <p className="text-zinc-500">Derive a normal wallet address from a private key (WIF or 32-byte hex). Use the P2WPKH tb1q... as a simple destination address.</p>

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
          <div />
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">Private key (WIF or 32-byte hex)</div>
            <input className="w-full rounded border px-3 py-2 font-mono" value={privInput} onChange={e=>setPrivInput(e.target.value)} placeholder="WIF (c.../K.../L...) or 64 hex chars" />
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={derive} className="px-3 py-2 rounded bg-blue-600 text-white">Derive Addresses</button>
          {!!err && <div className="text-sm text-red-600">{err}</div>}
        </div>

        {(p2wpkh || p2tr) && (
          <div className="grid md:grid-cols-2 gap-3 mt-2 text-sm">
            {p2wpkh && (
              <div className="rounded border p-2">
                <div className="text-zinc-500">P2WPKH (bech32)</div>
                <div className="font-mono break-all">{p2wpkh.address || '—'}</div>
                <div className="text-xs text-zinc-500 mt-1">script (hex): <span className="font-mono break-all">{p2wpkh.scriptHex}</span></div>
                <div className="text-xs text-zinc-500">Use this tb1q... as a simple destination address.</div>
              </div>
            )}
            {p2tr && (
              <div className="rounded border p-2">
                <div className="text-zinc-500">P2TR single-key (bech32m)</div>
                <div className="font-mono break-all">{p2tr.address || '—'}</div>
                <div className="text-xs text-zinc-500 mt-1">script (hex): <span className="font-mono break-all">{p2tr.scriptHex}</span></div>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="text-xs text-zinc-500">Privacy note: deriving a destination from the same private key as R links your claim key and payout. For signet/testing this is fine. For production, use a fresh wallet receiving address.</div>
    </main>
  );
}

"use client";

import { useMemo, useState } from "react";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";
import { ECPairFactory } from "ecpair";
import { Buffer } from "buffer";

// A client-side Key Finder for BIP86 Taproot (and optional BIP84 P2WPKH)
// Given a BIP39 mnemonic + address, it scans derivation paths to find the
// matching child key and reveals: derivation path, internal pubkey (x-only),
// compressed pubkey, and WIF. Works for mainnet/testnet/signet (signet shares testnet params).

export default function KeyFinder() {
  useMemo(() => {
    try { bitcoin.initEccLib(ecc); } catch {}
    try { if (!globalThis.Buffer) globalThis.Buffer = Buffer; } catch {}
  }, []);

  const [networkKey, setNetworkKey] = useState("testnet");
  const [scriptType, setScriptType] = useState("p2tr"); // "p2tr" | "p2wpkh"
  const [addressInput, setAddressInput] = useState("");
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [passphraseInput, setPassphraseInput] = useState("");
  const [account, setAccount] = useState(0);
  const [maxIndex, setMaxIndex] = useState(50);
  const [scanChange, setScanChange] = useState(false);

  const [err, setErr] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);

  const network = useMemo(() => {
    if (networkKey === "mainnet") return bitcoin.networks.bitcoin;
    return bitcoin.networks.testnet; // signet + testnet share params
  }, [networkKey]);

  const ECPair = useMemo(() => ECPairFactory(ecc), []);

  // ---- Helpers: encoding & crypto ----
  const enc = new TextEncoder();

  async function pbkdf2_sha512(passwordBytes, saltBytes, iterations = 2048, length = 64) {
    // Browser-native PBKDF2 (BIP39 seed derivation)
    const key = await crypto.subtle.importKey(
      "raw",
      passwordBytes,
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-512", salt: saltBytes, iterations },
      key,
      length * 8
    );
    return Buffer.from(new Uint8Array(bits));
  }

  async function hmac_sha512(keyBytes, dataBytes) {
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", cryptoKey, dataBytes);
    return Buffer.from(new Uint8Array(mac));
  }

  const SECP256K1_N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
  const ZERO32 = Buffer.alloc(32, 0);

  function ser32(i) {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(i >>> 0, 0);
    return b;
  }
  function toBig(buf) { return BigInt("0x" + Buffer.from(buf).toString("hex")); }
  function toBuf32(x) {
    let h = x.toString(16);
    if (h.length % 2) h = "0" + h;
    let b = Buffer.from(h, "hex");
    if (b.length < 32) b = Buffer.concat([Buffer.alloc(32 - b.length, 0), b]);
    return b;
  }

  async function mnemonicToSeed(mnemonic, passphrase) {
    const m = enc.encode(mnemonic.normalize("NFKD"));
    const s = enc.encode(("mnemonic" + (passphrase || "")).normalize("NFKD"));
    return await pbkdf2_sha512(m, s, 2048, 64);
  }

  async function masterFromSeed(seed) {
    const I = await hmac_sha512(enc.encode("Bitcoin seed"), seed);
    const IL = I.subarray(0, 32);
    const IR = I.subarray(32);
    const k = toBig(IL);
    if (k === 0n || k >= SECP256K1_N) throw new Error("Invalid master key");
    return { key: IL, chain: IR };
  }

  async function CKDpriv(node, index) {
    const { key, chain } = node;
    let data;
    if (index >= 0x80000000) {
      data = Buffer.concat([Buffer.from([0]), key, ser32(index)]);
    } else {
      const pub = Buffer.from(ecc.pointFromScalar(key, true));
      data = Buffer.concat([pub, ser32(index)]);
    }
    const I = await hmac_sha512(chain, data);
    const IL = I.subarray(0, 32);
    const IR = I.subarray(32);
    const il = toBig(IL);
    if (il >= SECP256K1_N) throw new Error("Invalid child (IL>=n)");
    const k = (il + toBig(key)) % SECP256K1_N;
    if (k === 0n) throw new Error("Invalid child (k=0)");
    return { key: toBuf32(k), chain: IR };
  }

  function parsePath(path) {
    if (!/^m(\/\d+'?)*$/.test(path)) throw new Error("Bad derivation path");
    return path
      .split("/")
      .slice(1)
      .map((p) => {
        const hard = /'$/.test(p);
        const n = parseInt(hard ? p.slice(0, -1) : p, 10);
        if (!Number.isFinite(n)) throw new Error("Bad index in path");
        return hard ? (n + 0x80000000) : n;
      });
  }

  async function derivePath(node, path) {
    let cur = node;
    for (const idx of parsePath(path)) {
      cur = await CKDpriv(cur, idx);
    }
    return cur;
  }

  function isValidAddress(addr) {
    return typeof addr === "string" && addr.trim().length > 0 && /^tb1|^bc1/.test(addr) || /^bcrt1/.test(addr);
  }

  // Normalize mnemonic: accept words separated by spaces or newlines, and
  // tolerate copied numbering like "1. word". Lowercases and collapses spaces.
  function normalizeMnemonic(input) {
    const lines = String(input || "")
      .split(/\r?\n+/)
      .map(s => s.trim().toLowerCase().replace(/^\d+[).\-\s]*\s*/,'').replace(/\s+/g,' ').trim())
      .filter(Boolean);
    const joined = lines.join(' ');
    return joined.replace(/\s+/g,' ').trim();
  }

  // Live metrics for the mnemonic input
  const normalizedWords = useMemo(() => normalizeMnemonic(mnemonicInput), [mnemonicInput]);
  const wordCount = useMemo(() => (normalizedWords ? normalizedWords.split(/\s+/).filter(Boolean).length : 0), [normalizedWords]);
  const validWordLen = useMemo(() => [12, 15, 18, 21, 24].includes(wordCount), [wordCount]);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setMnemonicInput(text);
    } catch (e) {
      setErr("Clipboard read failed. Paste manually.");
    }
  }

  async function handleFind() {
    try {
      setErr("");
      setResult(null);
      setStatus("Scanning…");

      const address = (addressInput || "").trim();
      if (!isValidAddress(address)) throw new Error("Enter a valid bech32(bech32m) address");
      const words = normalizeMnemonic(mnemonicInput);
      if (!words) throw new Error("Paste your BIP39 seed words");

      const seed = await mnemonicToSeed(words, (passphraseInput || ""));
      let node = await masterFromSeed(seed);

      const coinType = networkKey === "mainnet" ? 0 : 1; // testnet/signet = 1'
      // We search account'/branch/index across typical ranges
      const branches = scanChange ? [0, 1] : [0];
      const purpose = scriptType === "p2tr" ? 86 : 84;

      const acct = account >>> 0;
      let found = null;
      let foundPath = "";

      for (const branch of branches) {
        for (let i = 0; i <= (maxIndex >>> 0); i++) {
          const path = `m/${purpose}'/${coinType}'/${acct}'/${branch}/${i}`;
          const child = await derivePath(node, path);
          const priv = child.key;
          const pub33 = Buffer.from(ecc.pointFromScalar(priv, true));

          let addr;
          if (scriptType === "p2tr") {
            const xonly = pub33.slice(1, 33);
            const tr = bitcoin.payments.p2tr({ internalPubkey: xonly, network });
            addr = tr.address || "";
          } else {
            const wpkh = bitcoin.payments.p2wpkh({ pubkey: pub33, network });
            addr = wpkh.address || "";
          }
          if (addr === address) {
            found = { priv, pub33 };
            foundPath = path;
            break;
          }
        }
        if (found) break;
      }

      if (!found) throw new Error("Address not found within the scanned range. Increase Max Index or enable Change chain.");

      const { priv, pub33 } = found;
      const xonly = pub33.slice(1, 33);
      const wif = ECPair.fromPrivateKey(priv, { network, compressed: true }).toWIF();
      const addrCheck = scriptType === "p2tr"
        ? bitcoin.payments.p2tr({ internalPubkey: xonly, network }).address
        : bitcoin.payments.p2wpkh({ pubkey: pub33, network }).address;

      setResult({
        path: foundPath,
        wif,
        pub33: pub33.toString("hex"),
        xonly: xonly.toString("hex"),
        address: addrCheck || "",
      });
      setStatus("Match found");
    } catch (e) {
      setErr(String(e?.message || e));
      setStatus("");
    }
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600 text-white">TOOLS</div>
      <h1 className="text-2xl font-semibold">Key Finder (BIP86/BIP84)</h1>
      <p className="text-zinc-500">Given your seed words and a destination address, this tool scans standard paths to find the exact child key and shows its WIF and public keys. For Signet/Testnet use the Testnet network. Keep this page offline while using it.</p>

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
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Script Type</div>
            <select className="w-full rounded border px-3 py-2" value={scriptType} onChange={e=>setScriptType(e.target.value)}>
              <option value="p2tr">Taproot (BIP86)</option>
              <option value="p2wpkh">P2WPKH (BIP84)</option>
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="text-sm text-zinc-500">Address (tb1p… / tb1q… / bc1…)</div>
            <input className="w-full rounded border px-3 py-2 font-mono" value={addressInput} onChange={e=>setAddressInput(e.target.value)} placeholder="Paste the exact bech32/bech32m address" />
          </label>
          <label className="space-y-1 md:col-span-2">
            <div className="flex items-center justify-between text-sm text-zinc-500">
              <div>BIP39 Seed Words (12/24)</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={pasteFromClipboard} className="px-2 py-1 rounded border text-xs">Paste from clipboard</button>
                <button type="button" onClick={()=>setMnemonicInput("")} className="px-2 py-1 rounded border text-xs">Clear</button>
              </div>
            </div>
            <textarea className="w-full rounded border px-3 py-2 font-mono min-h-[80px]" value={mnemonicInput} onChange={e=>setMnemonicInput(e.target.value)} placeholder="fat leopard …" />
            <div className="text-xs text-zinc-500">Enter words exactly in order (1→N). You can paste with spaces or newlines; leading numbers like "1." are ignored.</div>
            <div className="text-xs text-zinc-500">Words: {wordCount} {validWordLen ? '(valid BIP39 length)' : '(expected 12/15/18/21/24)'} </div>
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">BIP39 Passphrase (optional)</div>
            <input className="w-full rounded border px-3 py-2" value={passphraseInput} onChange={e=>setPassphraseInput(e.target.value)} placeholder="leave empty if none" />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Account (default 0)</div>
            <input type="number" className="w-full rounded border px-3 py-2" value={account} onChange={e=>setAccount(Number(e.target.value)||0)} />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Max Index (scan)</div>
            <input type="number" className="w-full rounded border px-3 py-2" value={maxIndex} onChange={e=>setMaxIndex(Number(e.target.value)||0)} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={scanChange} onChange={e=>setScanChange(e.target.checked)} />
            <span className="text-sm text-zinc-600">Scan change chain (…/1/i) as well</span>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleFind} className="px-3 py-2 rounded bg-emerald-600 text-white">Find Keys</button>
          {!!status && <div className="text-sm text-zinc-600">{status}</div>}
          {!!err && <div className="text-sm text-red-600">{err}</div>}
        </div>

        {result && (
          <div className="mt-3 grid md:grid-cols-2 gap-3 text-sm">
            <div className="rounded border p-2 space-y-1">
              <div className="text-zinc-500">Derivation Path</div>
              <div className="font-mono break-all">{result.path}</div>
              <div className="text-zinc-500 mt-2">Address</div>
              <div className="font-mono break-all">{result.address}</div>
            </div>
            <div className="rounded border p-2 space-y-1">
              <div className="text-zinc-500">WIF (compressed, {networkKey})</div>
              <div className="font-mono break-all">{result.wif}</div>
              <div className="text-zinc-500 mt-2">Internal PubKey (x-only)</div>
              <div className="font-mono break-all">{result.xonly}</div>
              <div className="text-zinc-500 mt-2">Compressed PubKey (33 bytes)</div>
              <div className="font-mono break-all">{result.pub33}</div>
            </div>
          </div>
        )}

        <div className="text-xs text-zinc-500 mt-3">
          Security tip: Keep this tool offline when using real seed words. For Signet/Testnet experiments it’s fine. This tool never transmits data; it runs entirely in your browser.
        </div>
      </section>
    </main>
  );
}

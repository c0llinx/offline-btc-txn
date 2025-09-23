"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { encode as cborEncode, decode as cborDecode } from "cbor-x";
import { encodeUR, decodeUR } from "@offline/core";
import { parseClaimBundle } from "@offline/interop";
import * as bitcoin from "bitcoinjs-lib";
import * as ecc from "@bitcoinerlab/secp256k1";

export default function Receiver() {
  useMemo(() => {
    try {
      bitcoin.initEccLib(ecc);
    } catch {}
  }, []);
  const [message, setMessage] = useState("hello offline bitcoin");
  const [fragmentLen, setFragmentLen] = useState(60);
  const [parts, setParts] = useState([]);
  const [decoded, setDecoded] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [debug, setDebug] = useState(null);

  // Claim bundle import
  const [claimInput, setClaimInput] = useState("");
  const [claimParts, setClaimParts] = useState([]);
  const [claimParsed, setClaimParsed] = useState(null);
  const [claimErr, setClaimErr] = useState("");

  // Claim Tx builder state
  const [fundTxId, setFundTxId] = useState("");
  const [fundVout, setFundVout] = useState(0);
  const [prevoutScriptHex, setPrevoutScriptHex] = useState("");
  const [prevoutValue, setPrevoutValue] = useState(0);
  const [destAddress, setDestAddress] = useState("");
  const [destValue, setDestValue] = useState(0);
  const [feeRate, setFeeRate] = useState(2);
  const [claimPsbtB64, setClaimPsbtB64] = useState("");
  const [claimPsbtUR, setClaimPsbtUR] = useState("");
  const [claimBuildErr, setClaimBuildErr] = useState("");
  const [guidedOpen, setGuidedOpen] = useState(true);
  const [changeAddress, setChangeAddress] = useState("");
  const [estVsize, setEstVsize] = useState(151);
  const [estFee, setEstFee] = useState(302);
  const [estNote, setEstNote] = useState("");

  const [isFormFilled, setIsFormFilled] = useState(false);

  const searchParams = useSearchParams();

  useEffect(() => {
    const claimFromUrl = searchParams.get("claim");
    if (claimFromUrl) {
      setClaimInput(claimFromUrl);
      handleClaimDecode(claimFromUrl);
    }
  }, [searchParams]);

  function handleSelectUtxo(utxo) {
    setFundTxId(decodedTxid);
    setFundVout(utxo.i);
    setPrevoutValue(utxo.value);
    setPrevoutScriptHex(utxo.scriptHex);
    setIsFormFilled(true);
  }

  // Decode funding tx helper (no auto-fill)
  const [helperNet, setHelperNet] = useState("testnet");
  const [txHex, setTxHex] = useState("");
  const [targetAddr, setTargetAddr] = useState("");
  const [txDecodeErr, setTxDecodeErr] = useState("");
  const [decodedOuts, setDecodedOuts] = useState([]);
  const [decodedTxid, setDecodedTxid] = useState("");

  const partCount = useMemo(() => parts.length, [parts]);

  const encoderRef = useRef(null);

  // Ensure message bytes are wrapped as a CBOR byte string (major type 2)
  function wrapCborByteString(bytes) {
    const len = bytes.length >>> 0;
    let header;
    if (len <= 23) {
      header = new Uint8Array([0x40 | len]);
    } else if (len <= 0xff) {
      header = new Uint8Array([0x58, len]);
    } else if (len <= 0xffff) {
      header = new Uint8Array([0x59, (len >> 8) & 0xff, len & 0xff]);
    } else if (len <= 0xffffffff) {
      header = new Uint8Array([
        0x5a,
        (len >>> 24) & 0xff,
        (len >>> 16) & 0xff,
        (len >>> 8) & 0xff,
        len & 0xff,
      ]);
    } else {
      // Very large payloads unlikely in this smoke test; support 64-bit length just in case
      const hi = Math.floor(len / 2 ** 32);
      const lo = len >>> 0;
      header = new Uint8Array([
        0x5b,
        (hi >>> 24) & 0xff,
        (hi >>> 16) & 0xff,
        (hi >>> 8) & 0xff,
        hi & 0xff,
        (lo >>> 24) & 0xff,
        (lo >>> 16) & 0xff,
        (lo >>> 8) & 0xff,
        lo & 0xff,
      ]);
    }
    const out = new Uint8Array(header.length + len);
    out.set(header, 0);
    out.set(bytes, header.length);
    return out;
  }

  function estimateVsize(outCount) {
    // Approximate: 1-in taproot script-path + 1-out ~151 vB; each extra output ~31 vB
    return 151 + Math.max(0, outCount - 1) * 31;
  }

  function handleEstimate() {
    try {
      const outCount = (changeAddress || "").trim() ? 2 : 1;
      const v = estimateVsize(outCount);
      const f = Math.ceil(v * (Number(feeRate) || 1));
      setEstVsize(v);
      setEstFee(f);
      setEstNote(
        `vsize≈${v} vB · fee≈${f} sats (@${Number(feeRate) || 1} sat/vB)`,
      );
      // If no change is provided, auto-fill destination to prevout - estFee
      if (!(changeAddress || "").trim()) {
        const pv = Number(prevoutValue) || 0;
        if (pv > 0) setDestValue(Math.max(0, pv - f));
      }
    } catch (e) {
      // ignore
    }
  }

  function hexToU8(hex) {
    const h = (hex || "").trim().replace(/^0x/i, "");
    if (h.length % 2) throw new Error("hex length must be even");
    const arr = new Uint8Array(h.length / 2);
    for (let i = 0; i < arr.length; i++)
      arr[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
    return arr;
  }

  function networkForKey(k) {
    if (k === "mainnet") return bitcoin.networks.bitcoin;
    return bitcoin.networks.testnet; // use testnet params for both testnet and signet
  }

  function addressFromScript(outputScript, network) {
    try {
      const p = bitcoin.payments.p2tr({ output: outputScript, network });
      if (p?.address) return p.address;
    } catch {}
    try {
      const p = bitcoin.payments.p2wpkh({ output: outputScript, network });
      if (p?.address) return p.address;
    } catch {}
    try {
      const p = bitcoin.payments.p2wsh({ output: outputScript, network });
      if (p?.address) return p.address;
    } catch {}
    try {
      const p = bitcoin.payments.p2pkh({ output: outputScript, network });
      if (p?.address) return p.address;
    } catch {}
    try {
      const p = bitcoin.payments.p2sh({ output: outputScript, network });
      if (p?.address) return p.address;
    } catch {}
    return null;
  }

  function handleDecodeTx(hex) {
    try {
      setTxDecodeErr("");
      setDecodedOuts([]);
      setDecodedTxid("");
      const txHex = (hex || "").trim();
      if (!txHex) return;
      const net = networkForKey(helperNet);
      const tx = bitcoin.Transaction.fromHex(txHex);
      try {
        setDecodedTxid(tx.getId());
      } catch {}
      const outs = tx.outs.map((o, i) => {
        const scriptHex = Buffer.from(o.script).toString("hex");
        const addr = addressFromScript(o.script, net);
        const isTarget =
          targetAddr && addr && addr.trim() === targetAddr.trim();
        return { i, value: o.value, scriptHex, address: addr, isTarget };
      });
      setDecodedOuts(outs);

      if (outs.length === 1) {
        handleSelectUtxo(outs[0]);
      }
    } catch (e) {
      setTxDecodeErr(String(e?.message || e));
    }
  }

  async function fetchRawTx(txid) {
    try {
      const res = await fetch(`/api/tx/${txid}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const { rawTx } = await res.json();
      setTxHex(rawTx);
      handleDecodeTx(rawTx);
    } catch (e) {
      setTxDecodeErr(String(e?.message || e));
    }
  }

  function handleTxIdChange(e) {
    const txid = e.target.value;
    setFundTxId(txid);
    if (txid.length === 64) {
      fetchRawTx(txid);
    }
  }

  async function handleBuildClaimPsbt() {
    try {
      setClaimBuildErr("");
      setClaimPsbtB64("");
      setClaimPsbtUR("");
      if (!claimParsed) throw new Error("Decode a claim-bundle first");
      if (!fundTxId || typeof fundTxId !== "string")
        throw new Error("Funding txid required");
      let hash = fundTxId.trim();
      // If user pasted raw tx hex here by mistake, derive txid
      if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
        try {
          const tx = bitcoin.Transaction.fromHex(hash);
          hash = tx.getId();
        } catch {
          throw new Error(
            "Funding txid must be 64 hex chars (txid). If you pasted raw tx hex, use the helper above to decode and copy the txid.",
          );
        }
      }
      const index = Number(fundVout) >>> 0;
      if (!prevoutScriptHex || prevoutScriptHex.length < 8)
        throw new Error("Prevout scriptHex required");
      const script = Buffer.from(prevoutScriptHex.trim(), "hex");
      const value = Number(prevoutValue) >>> 0;
      if (!(value > 0)) throw new Error("Prevout value (sats) must be > 0");
      if (!destAddress) throw new Error("Destination address required");
      const outVal = Number(destValue) >>> 0;
      if (outVal <= 0) throw new Error("Destination value must be > 0");
      const psbt = new bitcoin.Psbt({ network: bitcoin.networks.testnet });
      const tapLeafScript = [
        {
          leafVersion: claimParsed.leaf_ver >>> 0,
          script: Buffer.from(claimParsed.script),
          controlBlock: Buffer.from(claimParsed.control || []),
        },
      ];
      psbt.addInput({
        hash,
        index,
        witnessUtxo: { script, value },
        tapLeafScript,
      });
      // Fee and optional change
      const outCount = (changeAddress || "").trim() ? 2 : 1;
      const vsize = estimateVsize(outCount);
      const fee = Math.ceil(vsize * (Number(feeRate) || 1));
      if (!(changeAddress || "").trim()) {
        // One-output flow: user should have set dest = prevout - fee; still allow any value
        if (outVal > value)
          throw new Error("Destination value exceeds prevout");
        psbt.addOutput({ address: destAddress.trim(), value: outVal });
      } else {
        // Two-output flow with change
        if (!changeAddress || typeof changeAddress !== "string")
          throw new Error("Change address required or leave it blank");
        const changeVal = value - outVal - fee;
        if (changeVal < 0)
          throw new Error(
            "Destination + estimated fee exceed prevout. Lower destination or fee rate.",
          );
        const DUST = 546; // conservative threshold for small outputs
        if (changeVal < DUST)
          throw new Error(
            "Computed change is below dust threshold; reduce destination or remove change.",
          );
        psbt.addOutput({ address: destAddress.trim(), value: outVal });
        psbt.addOutput({ address: changeAddress.trim(), value: changeVal });
      }
      const b64 = psbt.toBase64();
      setClaimPsbtB64(b64);
      const ur = encodeUR("crypto-psbt", psbt.toBuffer(), 180);
      const parts = [];
      const seen = new Set();
      let guard = 0;
      while (guard < 200) {
        const p = ur.nextPart();
        if (!seen.has(p)) {
          parts.push(p);
          seen.add(p);
        }
        try {
          await decodeUR(parts);
          break; // full set
        } catch (e) {
          if (!String(e).includes("UR not complete")) break; // other error
        }
        guard++;
      }
      setClaimPsbtUR(parts.join("\n"));
    } catch (e) {
      setClaimBuildErr(String(e?.message || e));
    }
  }

  async function handleEncode() {
    setError("");
    setDecoded(null);
    setDebug(null);
    try {
      // UR 'bytes' expects a CBOR byte string; wrap message bytes as CBOR
      const payloadBytes = new TextEncoder().encode(message);
      const cborPayload = wrapCborByteString(payloadBytes);
      const enc = encodeUR("bytes", cborPayload, Number(fragmentLen) || 60);
      encoderRef.current = enc;
      // Generate a bounded number of parts without pre-decoding (faster, no spam)
      const est = enc.estimatedParts || 1;
      const cap = Math.min(Math.max(est, 1), 50); // never more than 50 upfront
      const collected = [];
      for (let i = 0; i < cap; i++) collected.push(enc.nextPart());
      setParts(collected);
      setStatus(
        `encoded ${collected.length} fragment${collected.length > 1 ? "s" : ""}`,
      );
    } catch (e) {
      console.error(e);
      setError(String(e?.message || e));
      setStatus("error");
    }
  }

  async function handleDecode() {
    setError("");
    setDecoded(null);
    try {
      if (!parts.length) throw new Error("No UR parts to decode");
      let localParts = [...parts];
      let out;
      const maxTries = 100; // safety cap to avoid infinite loop
      let tries = 0;
      while (true) {
        try {
          out = await decodeUR(localParts);
          break; // success
        } catch (e) {
          // If we have an encoder, ask for more parts and try again
          if (encoderRef.current && tries < maxTries) {
            localParts.push(encoderRef.current.nextPart());
            tries += 1;
            continue;
          }
          throw e; // no encoder or exceeded tries
        }
      }
      // Debug the raw decode result shape
      let ctor, keys;
      try {
        console.log("UR raw out:", out);
        ctor = out?.cbor?.constructor?.name;
        keys =
          out?.cbor && typeof out.cbor === "object"
            ? Object.keys(out.cbor)
            : null;
        console.log("UR out.cbor shape:", {
          typeof: typeof out?.cbor,
          isU8: out?.cbor instanceof Uint8Array,
          ctor,
          keys,
          value: out?.cbor,
        });
      } catch {}

      // Coerce out.cbor (Buffer or Uint8Array) to Uint8Array
      const toU8 = (x) => {
        if (x instanceof Uint8Array) return x;
        // Buffer in browsers is often a Uint8Array subclass; the check above should already catch it.
        if (x && typeof x === "object") {
          if (x.type === "Buffer" && Array.isArray(x.data))
            return Uint8Array.from(x.data);
          // Honor view offsets when constructing from underlying buffer
          if (
            x.buffer instanceof ArrayBuffer &&
            typeof x.byteLength === "number"
          ) {
            const offset = x.byteOffset || 0;
            const length = x.byteLength;
            return new Uint8Array(x.buffer, offset, length);
          }
          if (Array.isArray(x)) return Uint8Array.from(x);
        }
        try {
          return new Uint8Array(x);
        } catch {}
        throw new Error("Unsupported byte source for payload bytes");
      };
      // Fallback parser: extract a CBOR byte string (major type 2) payload slice from bytes
      const extractCborByteString = (bytes) => {
        if (!bytes || bytes.length === 0) return null;
        const first = bytes[0];
        if ((first & 0xe0) !== 0x40) return null; // not major type 2
        const addl = first & 0x1f;
        let offset = 1;
        let len;
        const dv = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
        if (addl < 24) {
          len = addl;
        } else if (addl === 24) {
          if (bytes.length < 2) return null;
          len = bytes[1];
          offset = 2;
        } else if (addl === 25) {
          if (bytes.length < 3) return null;
          len = dv.getUint16(1, false);
          offset = 3;
        } else if (addl === 26) {
          if (bytes.length < 5) return null;
          len = dv.getUint32(1, false);
          offset = 5;
        } else if (addl === 27) {
          if (bytes.length < 9) return null;
          const hi = dv.getUint32(1, false);
          const lo = dv.getUint32(5, false);
          len = hi * 2 ** 32 + lo;
          offset = 9;
        } else {
          // Indefinite-length not expected here
          return null;
        }
        if (offset + len > bytes.length) return null;
        return bytes.slice(offset, offset + len);
      };
      const cborBytes = toU8(out.cbor);
      console.log("toU8(cbor) length:", cborBytes.length);
      // Try CBOR decode first; fallback to treating as raw bytes if needed
      let decodedValue;
      try {
        decodedValue = cborDecode(cborBytes);
      } catch (_) {
        decodedValue = cborBytes;
      }
      let decodedCtor;
      try {
        decodedCtor = decodedValue?.constructor?.name;
        console.log(
          "CBOR decoded value type:",
          typeof decodedValue,
          decodedCtor,
        );
      } catch {}
      // Coerce the decoded value into bytes when possible (handles Buffer-like, views, arrays)
      let payload;
      try {
        payload = toU8(decodedValue);
      } catch (_) {
        if (decodedValue instanceof Uint8Array) {
          payload = decodedValue;
        } else if (Array.isArray(decodedValue)) {
          payload = Uint8Array.from(decodedValue);
        } else if (typeof decodedValue === "string") {
          payload = new TextEncoder().encode(decodedValue);
        } else {
          payload = new TextEncoder().encode(String(decodedValue));
        }
      }
      // Deep search for an inner Uint8Array if the direct coercion yields empty
      function findDeepU8(x, seen = new Set()) {
        if (!x || typeof x !== "object") return null;
        if (seen.has(x)) return null;
        seen.add(x);
        if (x instanceof Uint8Array) return x;
        if (x.type === "Buffer" && Array.isArray(x.data))
          return Uint8Array.from(x.data);
        // Array-like views
        if (
          x.buffer instanceof ArrayBuffer &&
          typeof x.byteLength === "number"
        ) {
          const offset = x.byteOffset || 0;
          const length = x.byteLength;
          return new Uint8Array(x.buffer, offset, length);
        }
        let best = null;
        const consider = (cand) => {
          if (!cand) return;
          if (cand instanceof Uint8Array) {
            if (!best || cand.length > best.length) best = cand;
          }
        };
        if (Array.isArray(x)) {
          for (const it of x) {
            const found = findDeepU8(it, seen);
            consider(found);
          }
        } else {
          for (const k of Object.keys(x)) {
            const found = findDeepU8(x[k], seen);
            consider(found);
          }
        }
        return best;
      }
      // If payload is empty but CBOR bytes exist, attempt deep extraction or raw CBOR byte-string extraction
      let usedFallback = false;
      let usedDeep = false;
      let usedIndexMap = false;
      if (payload.length === 0 && cborBytes.length > 0) {
        // 1) If decodedValue is an object of numeric keys to byte values, reconstruct bytes
        if (
          decodedValue &&
          typeof decodedValue === "object" &&
          !Array.isArray(decodedValue)
        ) {
          const keys = Object.keys(decodedValue);
          const allNumeric =
            keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
          if (allNumeric) {
            const maxKey = Math.max(...keys.map((k) => parseInt(k, 10)));
            const arr = new Uint8Array(maxKey + 1);
            for (const k of keys) {
              const idx = parseInt(k, 10);
              let v = decodedValue[k];
              if (typeof v !== "number") {
                // Attempt to coerce nested numbers
                try {
                  v = Number(v);
                } catch {}
              }
              arr[idx] = (v >>> 0) & 0xff;
            }
            if (arr.length > 0) {
              payload = arr;
              usedIndexMap = true;
            }
          }
        }
        // 2) Try deep search for an inner Uint8Array
        const deep = findDeepU8(decodedValue);
        if (deep && deep.length > 0 && payload.length === 0) {
          payload = deep;
          usedDeep = true;
        }
        // 3) Lastly, attempt to extract a CBOR byte string from the raw CBOR bytes
        if (payload.length === 0) {
          const maybe = extractCborByteString(cborBytes);
          if (maybe && maybe.length > 0) {
            payload = maybe;
            usedFallback = true;
          }
        }
      }
      const text = new TextDecoder().decode(payload);
      const length = payload.length;
      const cborLen = cborBytes.length;
      const head = cborBytes[0] ?? null;
      const major = head != null ? head >> 5 : null;
      const ai = head != null ? head & 0x1f : null;
      const dvKeys =
        decodedValue && typeof decodedValue === "object"
          ? Object.keys(decodedValue).slice(0, 10)
          : null;
      const debugObj = {
        parts: localParts.length,
        tries,
        outType: out.type,
        cborIsU8: out?.cbor instanceof Uint8Array,
        cborCtor: ctor,
        cborKeys: keys,
        cborLen,
        head,
        major,
        ai,
        decodedType: typeof decodedValue,
        decodedCtor,
        decodedKeys: dvKeys,
        payloadLen: length,
        usedFallback,
        usedDeep,
        usedIndexMap,
      };
      console.log("UR decode details", debugObj);
      setDebug(debugObj);
      if (tries > 0) {
        setParts(localParts);
      }
      setDecoded({ type: out.type, text, length, cborLen });
      setStatus("decoded");
    } catch (e) {
      console.error(e);
      setError(String(e?.message || e));
      setStatus("error");
    }
  }

  async function handleClaimDecode(claimOverride) {
    try {
      setClaimErr("");
      setClaimParsed(null);
      const claimData = claimOverride || claimInput;
      const lines = (claimData || "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (!lines.length) throw new Error("Paste one or more UR parts");
      const urParts = lines.filter((l) => l.toLowerCase().startsWith("ur:"));
      if (!urParts.length)
        throw new Error(
          "No UR parts detected (expected lines starting with 'ur:')",
        );
      setClaimParts(urParts);
      const out = await decodeUR(urParts);
      const urType = String(out?.type || "").toLowerCase();
      if (urType !== "claim-bundle") {
        throw new Error(
          `Wrong UR type: expected 'claim-bundle' but got '${out?.type || "unknown"}'`,
        );
      }
      const toU8 = (x) => {
        if (x instanceof Uint8Array) return x;
        if (x && typeof x === "object") {
          if (x.type === "Buffer" && Array.isArray(x.data))
            return Uint8Array.from(x.data);
          if (
            x.buffer instanceof ArrayBuffer &&
            typeof x.byteLength === "number"
          ) {
            const offset = x.byteOffset || 0;
            const length = x.byteLength;
            return new Uint8Array(x.buffer, offset, length);
          }
          if (Array.isArray(x)) return Uint8Array.from(x);
        }
        try {
          return new Uint8Array(x);
        } catch {}
        throw new Error("Unsupported CBOR byte source");
      };
      const cborBytes = toU8(out.cbor);
      const parsed = parseClaimBundle(cborBytes);
      setClaimParsed(parsed);
    } catch (e) {
      setClaimErr(String(e?.message || e));
    }
  }

  function handleReset() {
    setParts([]);
    setDecoded(null);
    setStatus("idle");
    setError("");
    encoderRef.current = null;
    setDebug(null);
  }

  return (
    <main className="space-y-6">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-600 text-white">
        RECEIVER
      </div>
      <h1 className="text-2xl font-semibold">Receiver</h1>
      <p className="text-zinc-500">
        Import Claim Bundle (UR), wait for funding confirmation, build claim tx,
        and broadcast.
      </p>

      <section className="rounded-lg border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Guided Mode</h2>
          <button
            onClick={() => setGuidedOpen((v) => !v)}
            className="text-sm px-2 py-1 rounded border"
          >
            {guidedOpen ? "Hide" : "Show"}
          </button>
        </div>
        {guidedOpen && (
          <div className="text-sm text-zinc-700 space-y-2">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Paste ALL Claim Bundle UR lines below and click{" "}
                <b>Decode Claim</b>.
              </li>
              <li>
                Fund the Taproot address shown on the Cold page (same network
                you used to generate the bundle; signet is fine).
              </li>
              <li>
                After funding, fetch prevout details for the output that paid
                your address:
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>
                    <span className="font-mono">txid</span> — the funding
                    transaction id
                  </li>
                  <li>
                    <span className="font-mono">vout</span> — the index of the
                    output that paid your address
                  </li>
                  <li>
                    <span className="font-mono">value</span> — output value in
                    sats
                  </li>
                  <li>
                    <span className="font-mono">scriptpubkey_hex</span> — paste
                    here as <b>Prevout script (hex)</b> (P2TR script, usually
                    starts with <span className="font-mono">5120…</span>)
                  </li>
                </ul>
                <div className="text-xs text-zinc-500">
                  Explorer links:{" "}
                  <a
                    className="text-blue-600 underline"
                    href="https://mempool.space/signet"
                    target="_blank"
                    rel="noreferrer"
                  >
                    mempool.space/signet
                  </a>{" "}
                  ·{" "}
                  <a
                    className="text-blue-600 underline"
                    href="https://mempool.space/testnet"
                    target="_blank"
                    rel="noreferrer"
                  >
                    /testnet
                  </a>
                </div>
              </li>
              <li>
                Fill the form in <b>Build Claim PSBT</b> and click the button.
                You’ll get base64 and a UR for signing.
              </li>
              <li>
                Use a signer to provide the preimage for{" "}
                <span className="font-mono">h</span> and a Schnorr signature
                with <span className="font-mono">R</span>, finalize, then
                broadcast.
              </li>
            </ol>
            <p className="text-xs text-zinc-500">
              Note: The PSBT network parameter uses testnet defaults; for signet
              addresses this is acceptable for PSBT construction. Broadcast
              should target a signet endpoint.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Funding Transaction</h2>
        <p className="text-sm text-zinc-500">
          Paste the transaction ID of the funding transaction.
        </p>
        <input
          className="w-full rounded border px-3 py-2 font-mono"
          placeholder="Enter transaction ID"
          value={fundTxId}
          onChange={handleTxIdChange}
        />
        {!!txDecodeErr && (
          <div className="text-sm text-red-600">{txDecodeErr}</div>
        )}
        {(decodedTxid || decodedOuts.length > 0) && (
          <div className="text-sm space-y-2">
            {decodedTxid && (
              <div>
                <div className="text-zinc-500">Computed TXID</div>
                <div className="font-mono break-all">{decodedTxid}</div>
              </div>
            )}
            {decodedOuts.length > 0 && (
              <div>
                <div className="text-zinc-500">
                  Outputs ({decodedOuts.length})
                </div>
                <div className="grid gap-2">
                  {decodedOuts.map((o) => (
                    <div
                      key={o.i}
                      className={`text-xs rounded border p-2 ${o.isTarget ? "bg-emerald-50 border-emerald-300" : "bg-zinc-50"}`}
                    >
                      <div>
                        <b>vout</b>: {o.i}{" "}
                        {o.isTarget && (
                          <span className="text-emerald-700">
                            (matches target)
                          </span>
                        )}
                      </div>
                      <div>
                        <b>value (sats)</b>: {o.value}
                      </div>
                      <div>
                        <b>address</b>:{" "}
                        <span className="font-mono">{o.address || "n/a"}</span>
                      </div>
                      <div>
                        <b>script (hex)</b>:{" "}
                        <span className="font-mono break-all">
                          {o.scriptHex}
                        </span>
                      </div>
                      <div className="mt-2">
                        <button
                          onClick={() => handleSelectUtxo(o)}
                          className="text-xs px-2 py-1 rounded bg-blue-600 text-white"
                        >
                          Use this output
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Claim Bundle</h2>
        <p className="text-sm text-zinc-500">
          Paste one or more UR parts (each on its own line). Then click Decode.
        </p>
        <textarea
          className="w-full rounded border px-3 py-2 font-mono min-h-[120px]"
          placeholder="ur:claim-bundle/... or ur:bytes/..."
          value={claimInput}
          onChange={(e) => setClaimInput(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleClaimDecode}
            className="px-3 py-2 rounded bg-emerald-600 text-white"
          >
            Decode Claim
          </button>
          {!!claimErr && <div className="text-sm text-red-600">{claimErr}</div>}
        </div>
        {claimParsed && (
          <div className="mt-2">
            <div className="text-sm text-zinc-500">Parsed Claim Bundle</div>
            <pre className="text-xs bg-zinc-50 border rounded p-2 overflow-x-auto">
              {JSON.stringify(claimParsed, null, 2)}
            </pre>
          </div>
        )}
      </section>

      {claimParsed && (
        <section className="rounded-lg border p-4 space-y-3">
          <h2 className="font-medium">Build Claim PSBT</h2>
          <p className="text-sm text-zinc-500">
            Provide the funding UTXO details and destination. This constructs a
            tapscript spend using the claim leaf/script and control block from
            the bundle.
          </p>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="space-y-1 md:col-span-2">
              <div className="text-sm text-zinc-500">Funding txid (hex)</div>
              <input
                className="w-full rounded border px-3 py-2 font-mono"
                value={fundTxId}
                onChange={(e) => setFundTxId(e.target.value)}
                readOnly={isFormFilled}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">vout</div>
              <input
                type="number"
                className="w-full rounded border px-3 py-2"
                value={fundVout}
                onChange={(e) => setFundVout(Number(e.target.value) || 0)}
                readOnly={isFormFilled}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">Prevout value (sats)</div>
              <input
                type="number"
                className="w-full rounded border px-3 py-2"
                value={prevoutValue}
                onChange={(e) => setPrevoutValue(Number(e.target.value) || 0)}
                readOnly={isFormFilled}
              />
            </label>
            <label className="space-y-1 md:col-span-2">
              <div className="text-sm text-zinc-500">
                Prevout script (hex) — P2TR output script
              </div>
              <input
                className="w-full rounded border px-3 py-2 font-mono"
                value={prevoutScriptHex}
                onChange={(e) => setPrevoutScriptHex(e.target.value)}
                placeholder="e.g., 5120..."
                readOnly={isFormFilled}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">Destination address</div>
              <input
                className="w-full rounded border px-3 py-2"
                value={destAddress}
                onChange={(e) => setDestAddress(e.target.value)}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">
                Destination value (sats)
              </div>
              <input
                type="number"
                className="w-full rounded border px-3 py-2"
                value={destValue}
                onChange={(e) => setDestValue(Number(e.target.value) || 0)}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">Fee rate (sat/vB)</div>
              <input
                type="number"
                className="w-full rounded border px-3 py-2"
                value={feeRate}
                onChange={(e) => setFeeRate(Number(e.target.value) || 1)}
              />
            </label>
            <label className="space-y-1">
              <div className="text-sm text-zinc-500">
                Change address (optional)
              </div>
              <input
                className="w-full rounded border px-3 py-2"
                value={changeAddress}
                onChange={(e) => setChangeAddress(e.target.value)}
                placeholder="Leave blank to send all (minus fee)"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleEstimate}
              type="button"
              className="px-3 py-2 rounded border"
            >
              Estimate Fee
            </button>
            <button
              onClick={handleBuildClaimPsbt}
              className="px-3 py-2 rounded bg-blue-600 text-white"
            >
              Build Claim PSBT
            </button>
            {!!claimBuildErr && (
              <div className="text-sm text-red-600">{claimBuildErr}</div>
            )}
          </div>
          {estNote && <div className="text-xs text-zinc-500">{estNote}</div>}
          {claimPsbtB64 && (
            <div className="text-sm space-y-1">
              <div className="text-zinc-500">Claim PSBT (base64)</div>
              <textarea
                className="w-full rounded border px-3 py-2 font-mono min-h-[80px]"
                readOnly
                value={claimPsbtB64}
              />
            </div>
          )}
          {claimPsbtUR && (
            <div className="text-sm space-y-1">
              <div className="text-zinc-500">Claim PSBT (UR part)</div>
              <textarea
                className="w-full rounded border px-3 py-2 font-mono min-h-[80px]"
                readOnly
                value={claimPsbtUR}
              />
              <div className="text-xs text-zinc-500">
                Transfer this to a signer that can provide a Schnorr signature
                for R and the preimage for h.
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border p-4 space-y-4">
        <h2 className="font-medium">UR Smoke Test</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Message to encode</div>
            <input
              className="w-full rounded border px-3 py-2"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <div className="text-sm text-zinc-500">Max fragment length</div>
            <input
              className="w-full rounded border px-3 py-2"
              type="number"
              min={10}
              max={500}
              value={fragmentLen}
              onChange={(e) => setFragmentLen(Number(e.target.value) || 60)}
            />
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleEncode}
            className="px-3 py-2 rounded bg-blue-600 text-white"
          >
            Encode
          </button>
          <button
            onClick={handleDecode}
            className="px-3 py-2 rounded bg-emerald-600 text-white"
            disabled={!parts.length}
          >
            Decode
          </button>
          <button onClick={handleReset} className="px-3 py-2 rounded border">
            Reset
          </button>
          {status && (
            <div className="text-sm text-zinc-500">Status: {status}</div>
          )}
        </div>

        {!!error && <div className="text-sm text-red-600">{error}</div>}

        <div className="space-y-2">
          <div className="text-sm text-zinc-500">UR Parts ({partCount})</div>
          <div className="grid gap-2">
            {parts.map((p, i) => (
              <div
                key={i}
                className="text-xs break-all rounded bg-zinc-50 border p-2"
              >
                {p}
              </div>
            ))}
          </div>
        </div>

        {decoded && (
          <div className="space-y-1">
            <div className="text-sm text-zinc-500">Decoded</div>
            <div className="text-sm">
              type: <span className="font-mono">{decoded.type}</span>
            </div>
            <div className="text-sm">
              cbor bytes length: {decoded.cborLen ?? "?"}
            </div>
            <div className="text-sm">
              payload bytes length: {decoded.length}
            </div>
            <div className="text-sm">
              as text: <span className="font-mono">{decoded.text}</span>
            </div>
          </div>
        )}

        {debug && (
          <details className="mt-3">
            <summary className="cursor-pointer select-none text-sm text-zinc-500">
              Debug
            </summary>
            <pre className="mt-2 text-xs bg-zinc-50 border rounded p-2 overflow-x-auto">
              {JSON.stringify(debug, null, 2)}
            </pre>
          </details>
        )}
      </section>
    </main>
  );
}

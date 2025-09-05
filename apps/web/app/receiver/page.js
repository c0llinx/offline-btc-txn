"use client";

import { useMemo, useRef, useState } from "react";
import { encode as cborEncode, decode as cborDecode } from "cbor-x";
import { encodeUR, decodeUR } from "@offline/core/src/ur.js";
import { parseClaimBundle } from "@offline/interop/src/parse-claim-bundle.js";

export default function Receiver() {
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
      setStatus(`encoded ${collected.length} fragment${collected.length > 1 ? "s" : ""}`);
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
        keys = out?.cbor && typeof out.cbor === "object" ? Object.keys(out.cbor) : null;
        console.log("UR out.cbor shape:", { typeof: typeof out?.cbor, isU8: out?.cbor instanceof Uint8Array, ctor, keys, value: out?.cbor });
      } catch {}

      // Coerce out.cbor (Buffer or Uint8Array) to Uint8Array
      const toU8 = (x) => {
        if (x instanceof Uint8Array) return x;
        // Buffer in browsers is often a Uint8Array subclass; the check above should already catch it.
        if (x && typeof x === "object") {
          if (x.type === "Buffer" && Array.isArray(x.data)) return Uint8Array.from(x.data);
          // Honor view offsets when constructing from underlying buffer
          if (x.buffer instanceof ArrayBuffer && typeof x.byteLength === "number") {
            const offset = x.byteOffset || 0;
            const length = x.byteLength;
            return new Uint8Array(x.buffer, offset, length);
          }
          if (Array.isArray(x)) return Uint8Array.from(x);
        }
        try { return new Uint8Array(x); } catch {}
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
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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
        console.log("CBOR decoded value type:", typeof decodedValue, decodedCtor);
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
        if (x.type === "Buffer" && Array.isArray(x.data)) return Uint8Array.from(x.data);
        // Array-like views
        if (x.buffer instanceof ArrayBuffer && typeof x.byteLength === "number") {
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
        if (decodedValue && typeof decodedValue === "object" && !Array.isArray(decodedValue)) {
          const keys = Object.keys(decodedValue);
          const allNumeric = keys.length > 0 && keys.every(k => /^\d+$/.test(k));
          if (allNumeric) {
            const maxKey = Math.max(...keys.map(k => parseInt(k, 10)));
            const arr = new Uint8Array(maxKey + 1);
            for (const k of keys) {
              const idx = parseInt(k, 10);
              let v = decodedValue[k];
              if (typeof v !== "number") {
                // Attempt to coerce nested numbers
                try { v = Number(v); } catch {}
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
      const major = head != null ? (head >> 5) : null;
      const ai = head != null ? (head & 0x1f) : null;
      const dvKeys = decodedValue && typeof decodedValue === "object" ? Object.keys(decodedValue).slice(0, 10) : null;
      const debugObj = { parts: localParts.length, tries, outType: out.type, cborIsU8: out?.cbor instanceof Uint8Array, cborCtor: ctor, cborKeys: keys, cborLen, head, major, ai, decodedType: typeof decodedValue, decodedCtor, decodedKeys: dvKeys, payloadLen: length, usedFallback, usedDeep, usedIndexMap };
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
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-600 text-white">RECEIVER</div>
      <h1 className="text-2xl font-semibold">Receiver</h1>
      <p className="text-zinc-500">Import Claim Bundle (UR), wait for funding confirmation, build claim tx, and broadcast.</p>

      <section className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Claim Bundle</h2>
        <p className="text-sm text-zinc-500">Paste one or more UR parts (each on its own line). Then click Decode.</p>
        <textarea
          className="w-full rounded border px-3 py-2 font-mono min-h-[120px]"
          placeholder="ur:claim-bundle/... or ur:bytes/..."
          value={claimInput}
          onChange={e => setClaimInput(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <button onClick={handleClaimDecode} className="px-3 py-2 rounded bg-emerald-600 text-white">Decode Claim</button>
          {!!claimErr && <div className="text-sm text-red-600">{claimErr}</div>}
        </div>
        {claimParsed && (
          <div className="mt-2">
            <div className="text-sm text-zinc-500">Parsed Claim Bundle</div>
            <pre className="text-xs bg-zinc-50 border rounded p-2 overflow-x-auto">{JSON.stringify(claimParsed, null, 2)}</pre>
          </div>
        )}
      </section>

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
          <button onClick={handleEncode} className="px-3 py-2 rounded bg-blue-600 text-white">Encode</button>
          <button onClick={handleDecode} className="px-3 py-2 rounded bg-emerald-600 text-white" disabled={!parts.length}>Decode</button>
          <button onClick={handleReset} className="px-3 py-2 rounded border">Reset</button>
          {status && <div className="text-sm text-zinc-500">Status: {status}</div>}
        </div>

        {!!error && (
          <div className="text-sm text-red-600">{error}</div>
        )}

        <div className="space-y-2">
          <div className="text-sm text-zinc-500">UR Parts ({partCount})</div>
          <div className="grid gap-2">
            {parts.map((p, i) => (
              <div key={i} className="text-xs break-all rounded bg-zinc-50 border p-2">{p}</div>
            ))}
          </div>
        </div>

        {decoded && (
          <div className="space-y-1">
            <div className="text-sm text-zinc-500">Decoded</div>
            <div className="text-sm">type: <span className="font-mono">{decoded.type}</span></div>
            <div className="text-sm">cbor bytes length: {decoded.cborLen ?? "?"}</div>
            <div className="text-sm">payload bytes length: {decoded.length}</div>
            <div className="text-sm">as text: <span className="font-mono">{decoded.text}</span></div>
          </div>
        )}

        {debug && (
          <details className="mt-3">
            <summary className="cursor-pointer select-none text-sm text-zinc-500">Debug</summary>
            <pre className="mt-2 text-xs bg-zinc-50 border rounded p-2 overflow-x-auto">{JSON.stringify(debug, null, 2)}</pre>
          </details>
        )}
      </section>
    </main>
  );
}

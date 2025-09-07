import { UR, UREncoder, URDecoder } from '@ngraveio/bc-ur';

// Encode CBOR bytes as UR v2 multipart QR stream.
// Returns a small wrapper with a nextPart() function that yields 'ur:...' strings.
export function encodeUR(type, payloadBytes, maxFragmentLength = 800) {
  // Create a UR from raw CBOR bytes using the v1.1.13 API
  // Some builds ignore the optional type in fromBuffer; construct explicitly
  const ur = new UR(payloadBytes, type);
  const encoder = new UREncoder(ur, maxFragmentLength);

  // Pre-compute an estimated number of parts (pure fragments count)
  // Note: This is an estimate for UI purposes; fountain encoding may emit more parts over time.
  let estimatedParts;
  if (typeof encoder.fragmentsLength === 'number') {
    estimatedParts = encoder.fragmentsLength;
  }

  return {
    nextPart: () => encoder.nextPart(),
    // bc-ur fountain encoders are open-ended; expose a conservative isComplete
    isComplete: () => false,
    estimatedParts,
  };
}

// Decode an array of UR part strings back into type and CBOR bytes
export async function decodeUR(parts) {
  const decoder = new URDecoder();
  for (const p of parts) decoder.receivePart(p);
  if (!decoder.isComplete()) throw new Error('UR not complete');
  if (!decoder.isSuccess()) throw new Error('UR decode failed');
  const ur = decoder.resultUR();
  // Prefer inner payload via helper; fallback to raw field if helper is absent
  // OR if it produced an empty/undefined result (defensive for browser builds).
  const prefer = (typeof ur.decodeCBOR === 'function') ? ur.decodeCBOR() : undefined;
  const fallback = ur.cbor;
  const getLen = (x) => {
    if (!x) return 0;
    if (x instanceof Uint8Array) return x.byteLength;
    if (typeof ArrayBuffer !== 'undefined' && x instanceof ArrayBuffer) return x.byteLength;
    if (x && typeof x === 'object') {
      if (x.type === 'Buffer' && Array.isArray(x.data)) return x.data.length;
      if (x.buffer instanceof ArrayBuffer && typeof x.byteLength === 'number') return x.byteLength;
      if (Array.isArray(x)) return x.length;
    }
    try { return new Uint8Array(x).byteLength; } catch {}
    return 0;
  };
  const raw = getLen(prefer) > 0 ? prefer : fallback;
  // Normalize to Uint8Array across environments
  const toU8 = (x) => {
    if (x instanceof Uint8Array) return x;
    if (typeof x === 'string') return new TextEncoder().encode(x);
    if (x && typeof x === 'object') {
      if (x.type === 'Buffer' && Array.isArray(x.data)) return Uint8Array.from(x.data);
      if (typeof x.toJSON === 'function') {
        try {
          const j = x.toJSON();
          if (j && j.type === 'Buffer' && Array.isArray(j.data)) return Uint8Array.from(j.data);
        } catch {}
      }
      if (x.buffer instanceof ArrayBuffer && typeof x.byteLength === 'number') {
        const offset = x.byteOffset || 0;
        const length = x.byteLength;
        return new Uint8Array(x.buffer, offset, length);
      }
      if (Array.isArray(x)) return Uint8Array.from(x);
      // Handle an object that looks like {"0": 104, "1": 101, ...}
      try {
        const keys = Object.keys(x);
        if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
          const maxKey = Math.max(...keys.map(k => parseInt(k, 10)));
          const arr = new Uint8Array(maxKey + 1);
          for (const k of keys) {
            const idx = parseInt(k, 10);
            let v = x[k];
            if (typeof v !== 'number') { try { v = Number(v); } catch {} }
            arr[idx] = (v >>> 0) & 0xff;
          }
          return arr;
        }
      } catch {}
      if (typeof x.length === 'number' && x.length >= 0) {
        try {
          const arr = new Uint8Array(x.length >>> 0);
          for (let i = 0; i < arr.length; i++) arr[i] = (x[i] ?? 0) & 0xff;
          return arr;
        } catch {}
      }
    }
    try { return new Uint8Array(x); } catch {}
    throw new Error('Unable to normalize CBOR bytes to Uint8Array');
  };
  const cbor = toU8(raw);
  return { type: ur.type, cbor };
}

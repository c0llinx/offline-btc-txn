function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
  if (typeof value === 'string') {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value);
    return Uint8Array.from(Buffer.from(value, 'utf8'));
  }
  if (value && typeof value === 'object') {
    if (value.type === 'Buffer' && Array.isArray(value.data)) return Uint8Array.from(value.data);
    if (typeof value.toJSON === 'function') {
      try {
        const json = value.toJSON();
        if (json && json.type === 'Buffer' && Array.isArray(json.data)) return Uint8Array.from(json.data);
      } catch {
        // ignore
      }
    }
    if (Array.isArray(value)) return Uint8Array.from(value);
  }
  try {
    return Uint8Array.from(value);
  } catch {
    throw new Error('Unable to convert payload to Uint8Array');
  }
}

function toBase64(bytes) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return buffer.toString('base64');
}

function fromBase64(base64) {
  const buffer = Buffer.from(base64, 'base64');
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export function encodeUR(type, payloadBytes) {
  const payload = toUint8Array(payloadBytes);
  const base64 = toBase64(payload);
  const part = `ur:${type}/${base64}`;
  return {
    nextPart: () => part,
    isComplete: () => true,
    estimatedParts: 1,
  };
}

export async function decodeUR(parts) {
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('UR not complete');
  }
  const latest = String(parts[parts.length - 1] || '').trim();
  const match = latest.match(/^ur:([a-z0-9-]+)\/([a-zA-Z0-9+/=:-]+)$/);
  if (!match) {
    throw new Error('Invalid UR fragment');
  }
  const [, type, data] = match;

  try {
    const cbor = fromBase64(data);
    return { type, cbor };
  } catch (error) {
    throw new Error(`Failed to decode UR: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

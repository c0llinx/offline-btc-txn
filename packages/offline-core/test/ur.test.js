import { test, expect } from 'vitest';
import { encode as cborEncode, decode as cborDecode } from 'cbor-x';
import { encodeUR, decodeUR } from '../src/index.js';

function collectParts(encoder, count) {
  const parts = [];
  for (let i = 0; i < count; i++) {
    parts.push(encoder.nextPart());
  }
  return parts;
}

test('UR roundtrip (single-part)', async () => {
  const payload = { hello: 'world' };
  const cbor = cborEncode(payload);
  const enc = encodeUR('bytes', cbor, 1000); // large fragment to force single part
  const parts = collectParts(enc, enc.estimatedParts || 1);
  const out = await decodeUR(parts);
  expect(out.type).toBe('bytes');
  // bc-ur v1.1.13 returns Buffer-like CBOR bytes and we expose both raw cbor and decoded via library
  expect(cborDecode(out.cbor)).toEqual(payload);
});

test('UR roundtrip (multi-part)', async () => {
  const payload = { a: 'b'.repeat(200) }; // larger payload to force multiple fragments
  const cbor = cborEncode(payload);
  const enc = encodeUR('bytes', cbor, 60); // small fragment size to ensure multipart
  const expected = enc.estimatedParts || 3;
  const parts = collectParts(enc, expected);
  const out = await decodeUR(parts);
  expect(out.type).toBe('bytes');
  expect(cborDecode(out.cbor)).toEqual(payload);
});

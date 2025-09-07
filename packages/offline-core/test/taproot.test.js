import { test, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { randomBytes } from 'crypto';
import { buildClaimScript, buildRefundScript, buildClaimRefundTaproot, NETWORKS } from '../src/index.js';

bitcoin.initEccLib(ecc);

function xOnlyFromScalar() {
  let d, p;
  for (let i = 0; i < 64; i++) {
    d = randomBytes(32);
    p = ecc.pointFromScalar(d, true);
    if (p) return p.slice(1, 33);
  }
  throw new Error('Failed to derive x-only pubkey');
}

function compressedFromScalar() {
  let d, p;
  for (let i = 0; i < 64; i++) {
    d = randomBytes(32);
    p = ecc.pointFromScalar(d, true);
    if (p) return p;
  }
  throw new Error('Failed to derive compressed pubkey');
}

test('buildClaimScript matches OP_SHA256 <h> OP_EQUALVERIFY <R> OP_CHECKSIG', () => {
  const h32 = randomBytes(32);
  const R = xOnlyFromScalar();
  const script = buildClaimScript(R, h32);
  const chunks = bitcoin.script.decompile(script);
  const OPS = bitcoin.opcodes;
  expect(chunks).toHaveLength(5);
  expect(chunks[0]).toBe(OPS.OP_SHA256);
  expect(Buffer.isBuffer(chunks[1])).toBe(true);
  expect(chunks[1].equals(h32)).toBe(true);
  expect(chunks[2]).toBe(OPS.OP_EQUALVERIFY);
  expect(Buffer.isBuffer(chunks[3])).toBe(true);
  expect(chunks[3].length).toBe(32);
  expect(chunks[3].equals(R)).toBe(true);
  expect(chunks[4]).toBe(OPS.OP_CHECKSIG);
});

test('buildRefundScript matches <H_exp> OP_CHECKLOCKTIMEVERIFY OP_DROP <S> OP_CHECKSIG', () => {
  const H_exp = 500000;
  const S = xOnlyFromScalar();
  const script = buildRefundScript(H_exp, S);
  const chunks = bitcoin.script.decompile(script);
  const OPS = bitcoin.opcodes;
  expect(chunks).toHaveLength(5);
  expect(Buffer.isBuffer(chunks[0])).toBe(true);
  const num = bitcoin.script.number.decode(chunks[0]);
  expect(num).toBe(H_exp);
  expect(chunks[1]).toBe(OPS.OP_CHECKLOCKTIMEVERIFY);
  expect(chunks[2]).toBe(OPS.OP_DROP);
  expect(Buffer.isBuffer(chunks[3])).toBe(true);
  expect(chunks[3].length).toBe(32);
  expect(chunks[4]).toBe(OPS.OP_CHECKSIG);
});

test('buildClaimRefundTaproot returns valid p2tr output and address', () => {
  const R = xOnlyFromScalar();
  const S = xOnlyFromScalar();
  const h32 = randomBytes(32);
  const H_exp = 500000;
  const res = buildClaimRefundTaproot({ R_xonly: R, S_xonly: S, h32, H_exp, network: NETWORKS.signet });
  expect(res.address).toBeTruthy();
  expect(Buffer.isBuffer(res.output)).toBe(true);
  expect(res.output.length).toBeGreaterThan(0);
  expect(res.leaves).toBeDefined();
  expect(Buffer.isBuffer(res.leaves.claim)).toBe(true);
  expect(Buffer.isBuffer(res.leaves.refund)).toBe(true);
});

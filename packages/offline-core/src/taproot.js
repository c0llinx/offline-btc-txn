import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

export const NETWORKS = {
  signet: bitcoin.networks.testnet,
  testnet: bitcoin.networks.testnet,
  mainnet: bitcoin.networks.bitcoin,
};

function random32() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    const a = new Uint8Array(32);
    globalThis.crypto.getRandomValues(a);
    return a;
  }
  const a = new Uint8Array(32);
  for (let i = 0; i < 32; i++) a[i] = (Math.floor(Math.random() * 256)) & 0xff; // non-crypto fallback
  return a;
}

export function generateBurnedInternalKey() {
  for (let i = 0; i < 128; i++) {
    const d = random32();
    const p = ecc.pointFromScalar(d, true);
    if (p) {
      const xonly = p.slice(1, 33);
      return Buffer.from(xonly);
    }
  }
  throw new Error('Failed to derive internal key');
}

export function buildClaimScript(R_xonly, h32) {
  const OPS = bitcoin.opcodes;
  const R = Buffer.from(R_xonly);
  const h = Buffer.from(h32);
  return bitcoin.script.compile([
    OPS.OP_SHA256,
    h,
    OPS.OP_EQUALVERIFY,
    R,
    OPS.OP_CHECKSIG,
  ]);
}

export function buildRefundScript(H_exp, S_xonly) {
  const OPS = bitcoin.opcodes;
  const cltv = bitcoin.script.number.encode(H_exp);
  const S = Buffer.from(S_xonly);
  return bitcoin.script.compile([
    cltv,
    OPS.OP_CHECKLOCKTIMEVERIFY,
    OPS.OP_DROP,
    S,
    OPS.OP_CHECKSIG,
  ]);
}

export function buildClaimRefundTaproot({ R_xonly, S_xonly, h32, H_exp, network = NETWORKS.signet }) {
  const internalPubkey = generateBurnedInternalKey();
  const claim = buildClaimScript(R_xonly, h32);
  const refund = buildRefundScript(H_exp, S_xonly);
  const scriptTree = [
    { output: claim },
    { output: refund },
  ];
  const p2tr = bitcoin.payments.p2tr({
    internalPubkey,
    scriptTree,
    network,
  });
  if (!p2tr.address || !p2tr.output) throw new Error('p2tr build failed');
  return {
    address: p2tr.address,
    output: p2tr.output,
    internalPubkey,
    leaves: { claim, refund },
    scriptTree,
  };
}

import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { randomBytes } from 'crypto';

bitcoin.initEccLib(ecc);

export const NETWORKS = {
  signet: bitcoin.networks.testnet,
  testnet: bitcoin.networks.testnet,
  mainnet: bitcoin.networks.bitcoin,
};

export function generateBurnedInternalKey() {
  let d;
  for (let i = 0; i < 8; i++) {
    d = randomBytes(32);
    const p = ecc.pointFromScalar(d, true);
    if (p) {
      // x-only coordinate
      const xonly = p.slice(1, 33);
      // Ensure Buffer type for bitcoinjs-lib type checks
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

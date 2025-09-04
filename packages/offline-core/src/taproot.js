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
      return p.slice(1, 33);
    }
  }
  throw new Error('Failed to derive internal key');
}

export function buildClaimScript(R_xonly, h32) {
  const OPS = bitcoin.opcodes;
  return bitcoin.script.compile([
    OPS.OP_SHA256,
    h32,
    OPS.OP_EQUALVERIFY,
    R_xonly,
    OPS.OP_CHECKSIG,
  ]);
}

export function buildRefundScript(H_exp, S_xonly) {
  const OPS = bitcoin.opcodes;
  const cltv = bitcoin.script.number.encode(H_exp);
  return bitcoin.script.compile([
    cltv,
    OPS.OP_CHECKLOCKTIMEVERIFY,
    OPS.OP_DROP,
    S_xonly,
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

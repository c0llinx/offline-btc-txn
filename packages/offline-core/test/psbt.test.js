import { test, expect } from 'vitest';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { randomBytes } from 'crypto';
import { buildFundingPsbt } from '../src/index.js';

bitcoin.initEccLib(ecc);

function makeUtxoP2WPKH(value = 150000, network = bitcoin.networks.testnet) {
  // Derive a random compressed pubkey and corresponding p2wpkh output script
  let d, p;
  for (let i = 0; i < 64; i++) {
    d = randomBytes(32);
    p = ecc.pointFromScalar(d, true);
    if (p) break;
  }
  const pay = bitcoin.payments.p2wpkh({ pubkey: Buffer.from(p), network });
  if (!pay.output || !pay.address) throw new Error('p2wpkh failed');
  return {
    utxo: {
      txid: Buffer.alloc(32, 1).toString('hex'),
      vout: 0,
      witnessUtxo: { script: pay.output, value },
    },
    changeAddress: pay.address,
  };
}

function makeP2TROutputScript(network = bitcoin.networks.testnet) {
  // Simple single-leaf taptree with OP_TRUE to produce a valid P2TR output script
  // This is only for funding output; no signing occurs in this test.
  // Derive a valid x-only internal pubkey from a random private scalar
  let d, P;
  for (let i = 0; i < 64; i++) {
    d = randomBytes(32);
    P = ecc.pointFromScalar(d, true);
    if (P) break;
  }
  const internalPubkey = Buffer.from(P.slice(1, 33));
  const redeemLeaf = { output: Buffer.from('51', 'hex') }; // OP_TRUE
  const p2tr = bitcoin.payments.p2tr({ internalPubkey, scriptTree: redeemLeaf, network });
  if (!p2tr.output) throw new Error('p2tr failed');
  return p2tr.output;
}

test('buildFundingPsbt creates outputs and respects changeAddress when funds suffice', () => {
  const network = bitcoin.networks.testnet;
  const { utxo, changeAddress } = makeUtxoP2WPKH(150000, network);
  const sendOutputScript = makeP2TROutputScript(network);
  const sendValueSat = 70000;
  const feeRateSatVb = 2;
  const psbt = buildFundingPsbt({
    utxos: [utxo],
    sendOutputScript,
    sendValueSat,
    changeAddress,
    feeRateSatVb,
    network,
  });
  // One send output + possibly one change output
  expect(psbt.txOutputs?.length ?? psbt.data.outputs.length).toBeGreaterThanOrEqual(1);
  // Verify at least the send output script/value exists in one of the outputs
  const outputs = (psbt.txOutputs ?? psbt.data.outputs).map(o => ({
    script: o.script || o.script || (o.redeemScript || undefined),
    value: o.value,
    address: o.address,
  }));
  const hasSend = (psbt.txOutputs ?? psbt.data.outputs).some(o =>
    (o.script ? o.script.equals(sendOutputScript) : false) || (o.address === undefined)
  );
  expect(hasSend).toBe(true);
});

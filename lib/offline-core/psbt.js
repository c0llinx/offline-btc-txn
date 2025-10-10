import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';

bitcoin.initEccLib(ecc);

export function buildFundingPsbt({
  utxos,
  sendOutputScript,
  sendValueSat,
  changeAddress,
  feeRateSatVb = 2,
  network = bitcoin.networks.testnet,
}) {
  const psbt = new bitcoin.Psbt({ network });
  let inputValue = 0;

  for (const utxo of utxos) {
    if (!utxo.witnessUtxo) throw new Error('utxo.witnessUtxo required');
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: utxo.witnessUtxo,
      ...(utxo.tapInternalKey ? { tapInternalKey: utxo.tapInternalKey } : {}),
    });
    inputValue += utxo.witnessUtxo.value;
  }

  const estimatedBytes = 120 + utxos.length * 68 + 2 * 34; // rough estimate
  const fee = Math.ceil(estimatedBytes * feeRateSatVb);
  const change = inputValue - sendValueSat - fee;
  if (change < 0) throw new Error('Insufficient funds');

  psbt.addOutput({ script: sendOutputScript, value: sendValueSat });
  if (change > 546 && changeAddress) {
    psbt.addOutput({ address: changeAddress, value: change });
  }

  return psbt;
}

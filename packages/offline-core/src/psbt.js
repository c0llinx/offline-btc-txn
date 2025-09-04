import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

bitcoin.initEccLib(ecc);

export function buildFundingPsbt({ utxos, sendOutputScript, sendValueSat, changeAddress, feeRateSatVb = 2, network = bitcoin.networks.testnet }) {
  const psbt = new bitcoin.Psbt({ network });
  let inputValue = 0;
  for (const u of utxos) {
    if (!u.witnessUtxo) throw new Error('utxo.witnessUtxo required');
    psbt.addInput({
      hash: u.txid,
      index: u.vout,
      witnessUtxo: u.witnessUtxo,
      ...(u.tapInternalKey ? { tapInternalKey: u.tapInternalKey } : {}),
    });
    inputValue += u.witnessUtxo.value;
  }
  const estBytes = 120 + utxos.length * 68 + 2 * 34; // rough estimate
  const fee = Math.ceil(estBytes * feeRateSatVb);
  const change = inputValue - sendValueSat - fee;
  if (change < 0) throw new Error('Insufficient funds');
  psbt.addOutput({ script: sendOutputScript, value: sendValueSat });
  if (change > 546 && changeAddress) {
    psbt.addOutput({ address: changeAddress, value: change });
  }
  return psbt;
}

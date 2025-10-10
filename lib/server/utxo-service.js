import { MempoolService } from './mempool.js';

export class UTXOService {
  constructor(network = 'testnet4') {
    this.mempoolService = new MempoolService(network);
  }

  async getUTXOsForAddress(address) {
    return this.mempoolService.getAddressUTXOs(address);
  }

  async getUTXOsForAmount(address, amount) {
    const utxos = await this.mempoolService.getAddressUTXOs(address);
    const sorted = [...utxos].sort((a, b) => a.value - b.value);

    const selected = [];
    let total = 0;
    for (const utxo of sorted) {
      selected.push(utxo);
      total += utxo.value;
      if (total >= amount) break;
    }

    if (total < amount) throw new Error('Insufficient funds');
    return selected;
  }
}

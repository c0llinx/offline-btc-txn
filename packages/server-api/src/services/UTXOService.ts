import { MempoolService } from './mempool.ts';

class UTXOService {
  private mempoolService: MempoolService;

  constructor(network: 'mainnet' | 'testnet' = 'testnet') {
    this.mempoolService = new MempoolService(network);
  }

  async getUTXOsForAddress(address: string) {
    return this.mempoolService.getAddressUTXOs(address);
  }

  async getUTXOsForAmount(address: string, amount: number) {
    const utxos = await this.mempoolService.getAddressUTXOs(address);
    console.log(`utxos are ${utxos}`)

    // Sort UTXOs by value in ascending order
    const sortedUtxos = utxos.sort((a, b) => a.value - b.value);

    let selectedUtxos = [];
    let currentAmount = 0;

    for (const utxo of sortedUtxos) {
      selectedUtxos.push(utxo);
      currentAmount += utxo.value;
      if (currentAmount >= amount) {
        break;
      }
    }

    if (currentAmount < amount) {
      throw new Error('Insufficient funds');
    }

    return selectedUtxos;
  }
}

export { UTXOService };

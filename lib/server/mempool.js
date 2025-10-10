import axios from 'axios';

const NETWORK_BASE = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet4/api',
  testnet4: 'https://mempool.space/testnet4/api',
  signet: 'https://mempool.space/testnet4/api',
};

export class MempoolService {
  constructor(network = 'mainnet') {
    const key = (network || 'mainnet').toLowerCase();
    if (key === 'mainnet') {
      this.network = 'mainnet';
    } else if (key === 'testnet4' || key === 'signet' || key === 'testnet') {
      this.network = 'testnet4';
    } else {
      this.network = 'mainnet';
    }
    this.baseURL = NETWORK_BASE[this.network];
    this.requestDelayMs = 1000;
  }

  async getAddressUTXOs(address) {
    await this.delay(this.requestDelayMs);
    try {
      const { data } = await axios.get(`${this.baseURL}/address/${address}/utxo`, {
        timeout: 10_000,
        headers: { 'User-Agent': 'Offline-BTC-Web/1.0.0' },
      });

      const utxosWithScripts = await Promise.all(
        data.map(async (utxo) => {
          const tx = await axios.get(`${this.baseURL}/tx/${utxo.txid}`);
          const scriptPubKey = tx.data.vout[utxo.vout]?.scriptpubkey;
          if (!scriptPubKey) {
            throw new Error(`Could not fetch scriptPubKey for ${utxo.txid}:${utxo.vout}`);
          }
          return {
            txid: utxo.txid,
            vout: utxo.vout,
            value: utxo.value,
            scriptHex: scriptPubKey,
            address,
            confirmations: utxo.status?.confirmed ? utxo.status.block_height : 0,
          };
        }),
      );

      return utxosWithScripts;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch UTXOs for address ${address}`);
    }
  }

  async getRawTransaction(txid) {
    await this.delay(this.requestDelayMs);
    try {
      const { data } = await axios.get(`${this.baseURL}/tx/${txid}/hex`, {
        timeout: 10_000,
        headers: { 'User-Agent': 'Offline-BTC-Web/1.0.0' },
      });
      return data;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch raw transaction for ${txid}`);
    }
  }

  getMempoolURL(txid) {
    if (this.network === 'testnet4') {
      return `https://mempool.space/testnet4/tx/${txid}`;
    }
    return `https://mempool.space/tx/${txid}`;
  }

  validateTestnetAddress(address) {
    if (address.startsWith('tb1p') && address.length === 62) return true;
    if (address.startsWith('tb1q') && address.length === 42) return true;
    if (address.startsWith('2') && address.length >= 34 && address.length <= 35) return true;
    if ((address.startsWith('m') || address.startsWith('n')) && address.length >= 34 && address.length <= 35) {
      return true;
    }
    return false;
  }

  async delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  handleAPIError(error, message) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        const status = error.response.status;
        if (status === 404) return new Error(`${message}: Not found (404)`);
        if (status === 429) return new Error(`${message}: Rate limited (429)`);
        if (status >= 500) return new Error(`${message}: Server error (${status})`);
        return new Error(`${message}: API error (${status})`);
      }
      if (error.request) {
        return new Error(`${message}: Network error - ${error.message}`);
      }
    }
    return new Error(`${message}: ${error?.message || 'Unknown error'}`);
  }
}

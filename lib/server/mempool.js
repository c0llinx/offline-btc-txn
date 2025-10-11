import axios from 'axios';

const NETWORK_BASE = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet/api',
  testnet4: 'https://mempool.space/testnet4/api',
  signet: 'https://mempool.space/signet/api',
};

const NETWORK_FALLBACKS = {
  testnet4: ['testnet4', 'testnet'],
  testnet: ['testnet', 'testnet4'],
  mainnet: ['mainnet'],
  signet: ['signet'],
};

export class MempoolService {
  constructor(network = 'testnet4') {
    const key = (network || 'testnet4').toLowerCase();
    this.network = NETWORK_BASE[key] ? key : 'testnet4';
    this.activeNetwork = this.network;
    this.requestDelayMs = 1000;
  }

  async getAddressUTXOs(address) {
    const results = [];
    let lastError = null;
    const networksToTry = NETWORK_FALLBACKS[this.network] || ['testnet4'];

    for (const net of networksToTry) {
      try {
        const enriched = await this.fetchUtxosForNetwork(address, net);
        if (enriched.length > 0) {
          results.push(...enriched);
          this.activeNetwork = net;
          // continue attempting remaining networks to capture cross-network coins
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (results.length === 0 && lastError) {
      throw lastError;
    }
    const unique = new Map();
    for (const utxo of results) {
      const key = `${utxo.txid}:${utxo.vout}`;
      if (!unique.has(key)) {
        unique.set(key, utxo);
      } else {
        const existing = unique.get(key);
        if ((utxo.confirmations || 0) > (existing.confirmations || 0)) {
          unique.set(key, utxo);
        }
      }
    }
    return Array.from(unique.values());
  }

  async fetchUtxosForNetwork(address, networkKey) {
    const baseURL = NETWORK_BASE[networkKey];
    if (!baseURL) return [];
    try {
      await this.delay(this.requestDelayMs);
      const { data } = await axios.get(`${baseURL}/address/${address}/utxo`, {
        timeout: 10_000,
        headers: { 'User-Agent': 'Offline-BTC-Web/1.0.0' },
      });

      const utxosWithScripts = await Promise.all(
        data.map(async (utxo) => {
          const tx = await axios.get(`${baseURL}/tx/${utxo.txid}`, {
            timeout: 10_000,
            headers: { 'User-Agent': 'Offline-BTC-Web/1.0.0' },
          });
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
            network: networkKey,
          };
        }),
      );

      return utxosWithScripts;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch UTXOs for address ${address}`);
    }
  }

  async getRawTransaction(txid) {
    const networksToTry = NETWORK_FALLBACKS[this.network] || ['testnet4'];
    let lastError = null;
    for (const net of networksToTry) {
      const baseURL = NETWORK_BASE[net];
      if (!baseURL) continue;
      await this.delay(this.requestDelayMs);
      try {
        const { data } = await axios.get(`${baseURL}/tx/${txid}/hex`, {
          timeout: 10_000,
          headers: { 'User-Agent': 'Offline-BTC-Web/1.0.0' },
        });
        this.activeNetwork = net;
        return data;
      } catch (error) {
        lastError = this.handleAPIError(error, `Failed to fetch raw transaction for ${txid}`);
      }
    }
    if (lastError) throw lastError;
    throw new Error(`Failed to fetch raw transaction for ${txid}`);
  }

  getMempoolURL(txid) {
    const net = this.activeNetwork || this.network;
    if (net === 'testnet4') return `https://mempool.space/testnet4/tx/${txid}`;
    if (net === 'testnet') return `https://mempool.space/testnet/tx/${txid}`;
    if (net === 'signet') return `https://mempool.space/signet/tx/${txid}`;
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

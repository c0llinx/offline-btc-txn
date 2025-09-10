import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import * as bitcoin from 'bitcoinjs-lib';
import {
  UTXO,
  TransactionStatus,
  AddressInfo,
  FeeEstimate,
  ErrorResponse,
} from '../../shared/types.js';
import { BitcoinNetwork, NetworkConfig } from '../bitcoin/networks';

export class MempoolAPI {
  private static lastRequestAt: number = 0;
  private readonly baseURL: string;
  private readonly requestDelay: number = 1000;
  static apiConfig: AxiosRequestConfig = {
    timeout: 10000,
    headers: {
      'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0',
      'Content-Type': 'application/json',
    },
  };

  constructor(network: BitcoinNetwork) {
    const config = NetworkConfig.create(network);
    this.baseURL = config.apiEndpoints[1];
  }

  /**
   * Fetches UTXOs for a given Bitcoin address and enriches them with scriptPubKey information.
   * @param {string} address The Bitcoin address to query.
   * @returns {Promise<UTXO[]>} A promise that resolves to an array of UTXOs.
   * @throws {Error} Throws an error if the initial API request fails.
   */
  async getAddressUTXOs(address: string): Promise<UTXO[]> {
    try {
      await this.delay(this.requestDelay);

      const utxoResponse = await axios.get(
        `${this.baseURL}/address/${address}/utxo`,
        MempoolAPI.apiConfig
      );
      const utxos = utxoResponse.data;

      // Concurrently fetch transaction details for each UTXO to get the scriptPubKey.
      const utxosWithScripts = await Promise.all(
        utxos.map(async (utxo: any) => {
          try {
            // Introduce a small delay between concurrent requests to mitigate rate limiting.
            await this.delay(500);

            const txResponse = await axios.get(
              `${this.baseURL}/tx/${utxo.txid}`,
              MempoolAPI.apiConfig
            );
            const scriptPubKey = txResponse.data.vout[utxo.vout].scriptpubkey;

            return {
              ...utxo,
              scriptPubKey,
              confirmations: utxo.status?.confirmed
                ? utxo.status.block_height
                : 0,
            };
          } catch (error) {
            console.warn(
              `Failed to fetch scriptPubKey for UTXO ${utxo.txid}:${utxo.vout}. Falling back to P2TR script.`,
              error
            );
            const fallbackScript = this.generateP2TRScriptPubKey(address);

            return {
              ...utxo,
              scriptPubKey: fallbackScript,
              confirmations: utxo.status?.confirmed
                ? utxo.status.block_height
                : 0,
            };
          }
        })
      );

      return utxosWithScripts;
    } catch (error) {
      throw this.handleAPIError(
        error,
        `Failed to fetch UTXOs for address: ${address}`
      );
    }
  }

  /**
   * Get detailed address information including total received and spent amounts.
   * @param {string} address The Bitcoin address to query.
   * @returns {Promise<AddressInfo>} A promise that resolves to an object with address details.
   * @throws {Error} Throws a detailed error if the API request fails.
   */
  async getAddressInfo(address: string): Promise<AddressInfo> {
    try {
      await this.delay(this.requestDelay);
      const response = await axios.get(
        `${this.baseURL}/address/${address}`,
        MempoolAPI.apiConfig
      );
      return response.data;
    } catch (error) {
      throw this.handleAPIError(
        error,
        `Failed to fetch address info for ${address}`
      );
    }
  }

  /**
   * Get transaction status and details.
   * @param {string} txid The transaction ID to query.
   * @returns {Promise<TransactionStatus>} A promise that resolves to an object with transaction details and confirmation status.
   * @throws {Error} Throws a detailed error if the API request fails.
   */
  async getTransactionStatus(txid: string): Promise<TransactionStatus> {
    try {
      await this.delay(this.requestDelay);
      const response = await axios.get(
        `${this.baseURL}/tx/${txid}`,
        MempoolAPI.apiConfig
      );
      return response.data;
    } catch (error) {
      throw this.handleAPIError(
        error,
        `Failed to fetch transaction status for ${txid}`
      );
    }
  }

  /**
   * Get raw transaction hex.
   * @param {string} txid The transaction ID to query.
   * @returns {Promise<string>} A promise that resolves to the raw transaction hex string.
   * @throws {Error} Throws a detailed error if the API request fails.
   */
  async getRawTransaction(txid: string): Promise<string> {
    try {
      await this.delay(this.requestDelay);
      const response = await axios.get(
        `${this.baseURL}/tx/${txid}/hex`,
        MempoolAPI.apiConfig
      );
      return response.data;
    } catch (error) {
      throw this.handleAPIError(
        error,
        `Failed to fetch raw transaction for ${txid}`
      );
    }
  }

  /**
   * Broadcast a signed raw transaction to the network.
   * @param {string} rawTx The raw transaction hex string to broadcast.
   * @returns {Promise<string>} A promise that resolves to the transaction ID (txid) of the broadcasted transaction.
   * @throws {Error} Throws a detailed error if the broadcast fails.
   */
  async broadcastTransaction(rawTx: string): Promise<string> {
    try {
      await this.delay(this.requestDelay);
      const response = await axios.post(`${this.baseURL}/tx`, rawTx, {
        ...MempoolAPI.apiConfig,
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': MempoolAPI.apiConfig.headers['User-Agent'],
        },
        timeout: 15000,
      });
      return response.data;
    } catch (error) {
      throw this.handleAPIError(error, 'Failed to broadcast transaction');
    }
  }

  /**
   * Get current fee estimates.
   * @returns {Promise<FeeEstimate>} A promise that resolves to an object with recommended fees in satoshis/vB. Returns default values on failure.
   */
  async getFeeEstimates(): Promise<FeeEstimate> {
    try {
      await this.delay(this.requestDelay);
      const response = await axios.get(
        `${this.baseURL}/v1/fees/recommended`,
        MempoolAPI.apiConfig
      );
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch fee estimates, using defaults:', error);
      return {
        fastestFee: 20,
        halfHourFee: 15,
        hourFee: 10,
        economyFee: 5,
        minimumFee: 1,
      };
    }
  }

  /**
   * Check if an address has a sufficient confirmed or unconfirmed balance to meet a required amount.
   * @param {string} address The Bitcoin address to check.
   * @param {number} requiredAmount The minimum balance in satoshis required.
   * @returns {Promise<{ hasBalance: boolean; availableBalance: number; confirmedBalance: number; unconfirmedBalance: number; }>} An object containing balance information.
   * @throws {Error} Throws a detailed error if the balance check fails.
   */
  async checkAddressBalance(
    address: string,
    requiredAmount: number
  ): Promise<{
    hasBalance: boolean;
    availableBalance: number;
    confirmedBalance: number;
    unconfirmedBalance: number;
  }> {
    try {
      // Concurrently fetch address info and UTXOs for efficiency.
      const [addressInfo, utxos] = await Promise.all([
        this.getAddressInfo(address),
        this.getAddressUTXOs(address),
      ]);

      const confirmed = utxos.filter((utxo) => utxo.confirmations > 0);
      const unconfirmed = utxos.filter((utxo) => utxo.confirmations === 0);

      const availableBalance =
        confirmed.reduce((sum, utxo) => sum + utxo.value, 0) +
        unconfirmed.reduce((sum, utxo) => sum + utxo.value, 0);

      return {
        hasBalance: availableBalance >= requiredAmount,
        availableBalance,
        confirmedBalance: confirmed.reduce((sum, utxo) => sum + utxo.value, 0),
        unconfirmedBalance: unconfirmed.reduce(
          (sum, utxo) => sum + utxo.value,
          0
        ),
      };
    } catch (error) {
      throw this.handleAPIError(
        error,
        `Failed to check balance for address ${address}`
      );
    }
  }

  /**
   * Polls the API to wait for a transaction to be confirmed on the blockchain.
   * @param {string} txid The transaction ID to monitor.
   * @param {number} maxAttempts The maximum number of times to check for confirmation. Defaults to 60.
   * @param {number} intervalMs The time in milliseconds to wait between each attempt. Defaults to 30000ms (30s).
   * @returns {Promise<TransactionStatus>} A promise that resolves with the confirmed transaction status.
   * @throws {Error} Throws an error if the transaction is not confirmed after `maxAttempts`.
   */
  async waitForConfirmation(
    txid: string,
    maxAttempts: number = 60,
    intervalMs: number = 30000
  ): Promise<TransactionStatus> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const status = await this.getTransactionStatus(txid);
        if (status.status.confirmed) {
          return status;
        }
        console.log(
          `Attempt ${attempt + 1}/${maxAttempts}: Transaction ${txid} not yet confirmed.`
        );
      } catch (error) {
        console.warn(`Attempt ${attempt + 1} failed for txid ${txid}:`, error);
      }
      await this.delay(intervalMs);
    }
    throw new Error(
      `Transaction ${txid} not confirmed after ${maxAttempts} attempts.`
    );
  }

  /**
   * Get the mempool.space URL for a given transaction.
   * @param {string} txid The transaction ID.
   * @returns {string} The full URL to the transaction on mempool.space.
   */
  getMempoolURL(txid: string): string {
    return `${this.baseURL.replace('/api', '')}/tx/${txid}`;
  }

  /**
   * Get the mempool.space URL for a given address.
   * @param {string} address The Bitcoin address.
   * @returns {string} The full URL to the address on mempool.space.
   */
  getAddressURL(address: string): string {
    return `${this.baseURL.replace('/api', '')}/address/${address}`;
  }

  /**
   * Check the health and connectivity of the network API.
   * @returns {Promise<{ isHealthy: boolean; blockHeight: number; difficulty: number; mempoolSize: number; }>} A promise that resolves to an object with network health stats. Returns a default "unhealthy" state on failure.
   */
  async checkNetworkHealth(): Promise<{
    isHealthy: boolean;
    blockHeight: number;
    difficulty: number;
    mempoolSize: number;
  }> {
    try {
      const [blockTip, mempoolStats] = await Promise.all([
        axios.get(`${this.baseURL}/blocks/tip/height`, MempoolAPI.apiConfig),
        axios.get(`${this.baseURL}/mempool`, MempoolAPI.apiConfig),
      ]);

      return {
        isHealthy: true,
        blockHeight: blockTip.data,
        difficulty: 0,
        mempoolSize: mempoolStats.data.count,
      };
    } catch (error) {
      console.error('Network health check failed:', error);
      return {
        isHealthy: false,
        blockHeight: 0,
        difficulty: 0,
        mempoolSize: 0,
      };
    }
  }

  /**
   * Validates a Bitcoin testnet address format based on common patterns (P2PKH, P2SH, P2WPKH, P2TR).
   * @param {string} address The address string to validate.
   * @returns {boolean} True if the address has a valid format, false otherwise.
   */
  validateTestnetAddress(address: string): boolean {
    const isP2TR = address.startsWith('tb1p') && address.length === 62;
    const isP2W = address.startsWith('tb1q') && address.length === 42;
    const isP2SH =
      address.startsWith('2') && address.length >= 34 && address.length <= 35;
    const isP2PKH =
      (address.startsWith('m') || address.startsWith('n')) &&
      address.length >= 34 &&
      address.length <= 35;

    return isP2TR || isP2W || isP2SH || isP2PKH;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private generateP2TRScriptPubKey(address: string): string {
    if (address.startsWith('tb1p') && address.length === 62) {
      try {
        const decoded = bitcoin.address.fromBech32(address);
        const witnessProgram = decoded.data.toString('hex');
        return `5120${witnessProgram}`;
      } catch (e) {
        console.error('Failed to decode P2TR address:', e);
        return '';
      }
    }
    return '';
  }

  private handleAPIError(error: unknown, message: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        const status = axiosError.response.status;
        const data = axiosError.response.data;
        if (status === 404) {
          return new Error(`${message}: Not found (404)`);
        } else if (status === 429) {
          return new Error(
            `${message}: Rate limited (429). Please wait and try again.`
          );
        } else if (status >= 500) {
          return new Error(`${message}: Server error (${status}) - ${data}`);
        }
        return new Error(`${message}: API error (${status}) - ${data}`);
      } else if (axiosError.request) {
        return new Error(`${message}: Network error - ${axiosError.message}`);
      }
    }
    return new Error(
      `${message}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}


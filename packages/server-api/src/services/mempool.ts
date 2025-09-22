import axios, { AxiosError } from 'axios';
import { UTXO, TransactionStatus, AddressInfo, FeeEstimate } from '../../../../src/shared/types';

export type Network = 'mainnet' | 'testnet';

export class MempoolService {
  private readonly baseURL: string;
  private readonly requestDelay = 1000; // 1 second between requests to avoid rate limiting

  constructor(network: Network = 'mainnet') {
    this.baseURL = `https://mempool.space/${network === 'testnet' ? 'testnet/' : ''}api`;
  }

  /**
   * Fetch UTXOs for a given address
   */
  async getAddressUTXOs(address: string): Promise<UTXO[]> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.get(`${this.baseURL}/address/${address}/utxo`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        }
      });

      // Fetch scriptPubKey for each UTXO by getting transaction details
      const utxosWithScripts = await Promise.all(
        response.data.map(async (utxo: any) => {
          try {
            // Fetch the transaction to get the scriptPubKey
            const txResponse = await axios.get(`${this.baseURL}/tx/${utxo.txid}`);
            const scriptPubKey = txResponse.data.vout[utxo.vout].scriptpubkey;
            
            return {
              txid: utxo.txid,
              vout: utxo.vout,
              value: utxo.value,
              scriptPubKey: scriptPubKey,
              address: address,
              confirmations: utxo.status?.confirmed ? utxo.status.block_height : 0
            };
          } catch (error) {
            console.error(`Failed to fetch scriptPubKey for UTXO ${utxo.txid}:${utxo.vout}:`, error);
            throw new Error(`Could not fetch scriptPubKey for UTXO ${utxo.txid}:${utxo.vout}`);
          }
        })
      );
      
      return utxosWithScripts;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch UTXOs for address ${address}`);
    }
  }

  /**
   * Get detailed address information
   */
  async getAddressInfo(address: string): Promise<AddressInfo> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.get(`${this.baseURL}/address/${address}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        }
      });

      return response.data;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch address info for ${address}`);
    }
  }

  /**
   * Get transaction status and details
   */
  async getTransactionStatus(txid: string): Promise<TransactionStatus> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.get(`${this.baseURL}/tx/${txid}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        }
      });

      return response.data;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch transaction status for ${txid}`);
    }
  }

  /**
   * Get raw transaction hex
   */
  async getRawTransaction(txid: string): Promise<string> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.get(`${this.baseURL}/tx/${txid}/hex`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        }
      });

      return response.data;
    } catch (error) {
      throw this.handleAPIError(error, `Failed to fetch raw transaction for ${txid}`);
    }
  }

  /**
   * Broadcast transaction to the network
   */
  async broadcastTransaction(rawTx: string): Promise<string> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.post(`${this.baseURL}/tx`, rawTx, {
        headers: {
          'Content-Type': 'text/plain',
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        },
        timeout: 15000
      });

      return response.data; // Returns the txid
    } catch (error) {
      throw this.handleAPIError(error, 'Failed to broadcast transaction');
    }
  }

  /**
   * Get current fee estimates
   */
  async getFeeEstimates(): Promise<FeeEstimate> {
    try {
      await this.delay(this.requestDelay);
      
      const response = await axios.get(`${this.baseURL}/v1/fees/recommended`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Bitcoin-Taproot-Calculator/1.0.0'
        }
      });

      return response.data;
    } catch (error) {
      // Return default fees if API fails
      console.warn('Failed to fetch fee estimates, using defaults:', error);
      return {
        fastestFee: 20,
        halfHourFee: 15,
        hourFee: 10,
        economyFee: 5,
        minimumFee: 1
      };
    }
  }

  /**
   * Check if address has sufficient balance
   */
  async checkAddressBalance(address: string, requiredAmount: number): Promise<{
    hasBalance: boolean;
    availableBalance: number;
    confirmedBalance: number;
    unconfirmedBalance: number;
  }> {
    try {
      const addressInfo = await this.getAddressInfo(address);
      const utxos = await this.getAddressUTXOs(address);

      const confirmed = utxos
        .filter(utxo => utxo.confirmations !== undefined && utxo.confirmations > 0);

      const unconfirmed = utxos
        .filter(utxo => utxo.confirmations === undefined || utxo.confirmations === 0);

      const availableBalance = confirmed.reduce((sum, utxo) => sum + utxo.value, 0) + unconfirmed.reduce((sum, utxo) => sum + utxo.value, 0);

      return {
        hasBalance: availableBalance >= requiredAmount,
        availableBalance,
        confirmedBalance: confirmed.reduce((sum, utxo) => sum + utxo.value, 0),
        unconfirmedBalance: unconfirmed.reduce((sum, utxo) => sum + utxo.value, 0)
      };
    } catch (error) {
      throw this.handleAPIError(error, `Failed to check balance for address ${address}`);
    }
  }

  /**
   * Wait for transaction confirmation
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

        console.log(`Attempt ${attempt + 1}/${maxAttempts}: Transaction ${txid} not yet confirmed`);
        
        if (attempt < maxAttempts - 1) {
          await this.delay(intervalMs);
        }
      } catch (error) {
        console.warn(`Attempt ${attempt + 1} failed:`, error);
        
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        
        await this.delay(intervalMs);
      }
    }

    throw new Error(`Transaction ${txid} not confirmed after ${maxAttempts} attempts`);
  }

  /**
   * Get mempool.space URL for a transaction
   */
  getMempoolURL(txid: string): string {
    return `https://mempool.space/testnet/tx/${txid}`;
  }

  /**
   * Get mempool.space URL for an address
   */
  getAddressURL(address: string): string {
    return `https://mempool.space/testnet/address/${address}`;
  }

  /**
   * Check network health and connectivity
   */
  async checkNetworkHealth(): Promise<{
    isHealthy: boolean;
    blockHeight: number;
    difficulty: number;
    mempoolSize: number;
  }> {
    try {
      const [blockTip, mempoolStats] = await Promise.all([
        axios.get(`${this.baseURL}/blocks/tip/height`),
        axios.get(`${this.baseURL}/mempool`)
      ]);

      return {
        isHealthy: true,
        blockHeight: blockTip.data,
        difficulty: 0, // Not readily available from mempool.space
        mempoolSize: mempoolStats.data.count
      };
    } catch (error) {
      return {
        isHealthy: false,
        blockHeight: 0,
        difficulty: 0,
        mempoolSize: 0
      };
    }
  }

  /**
   * Validate Bitcoin testnet address format
   */
  validateTestnetAddress(address: string): boolean {
    // Basic validation for testnet addresses
    if (address.startsWith('tb1p') && address.length === 62) {
      // Testnet Taproot (P2TR)
      return true;
    }
    if (address.startsWith('tb1q') && address.length === 42) {
      // Testnet Segwit v0 (P2WPKH/P2WSH)
      return true;
    }
    if (address.startsWith('2') && (address.length >= 34 && address.length <= 35)) {
      // Testnet P2SH
      return true;
    }
    if ((address.startsWith('m') || address.startsWith('n')) && (address.length >= 34 && address.length <= 35)) {
      // Testnet P2PKH
      return true;
    }
    
    return false;
  }

  // Private helper methods
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private handleAPIError(error: unknown, message: string): Error {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      
      if (axiosError.response) {
        // Server responded with error status
        const status = axiosError.response.status;
        const data = axiosError.response.data;
        
        if (status === 404) {
          return new Error(`${message}: Not found (404)`);
        } else if (status === 429) {
          return new Error(`${message}: Rate limited (429). Please wait and try again.`);
        } else if (status >= 500) {
          return new Error(`${message}: Server error (${status})`);
        } else {
          return new Error(`${message}: API error (${status}) - ${data}`);
        }
      } else if (axiosError.request) {
        // Network error
        return new Error(`${message}: Network error - ${axiosError.message}`);
      }
    }

    return new Error(`${message}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
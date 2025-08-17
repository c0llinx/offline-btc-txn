export interface CalculationRequest {
  num1: number;
  num2: number;
  operation: Operation;
}

export interface CalculationResult {
  operation: string;
  num1: number;
  num2: number;
  result: number;
  taprootAddress: string;
  scriptHash: string;
  privateKey: string;
  publicKey: string;
  txid: string;
  fee: number;
  rawTx: string;
  utxosUsed: UTXO[];
  broadcastStatus: 'success' | 'failed' | 'pending';
  confirmationStatus: 'unconfirmed' | 'confirmed' | 'failed';
}

export interface TaprootScript {
  script: Buffer;
  leafVersion: number;
  scriptHash: string;
}

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  scriptPubKey: string;
  address: string;
  confirmations: number;
}

export interface TransactionStatus {
  txid: string;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  fee: number;
  vsize: number;
  weight: number;
}

export interface AddressInfo {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

export type Operation = 'add' | 'subtract' | 'multiply' | 'divide';

export interface FeeEstimate {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

export interface KeyPair {
  privateKey: string;
  publicKey: string;
  address: string;
}

export interface TapscriptCalculation {
  script: string;
  scriptAsm: string;
  expectedResult: number;
  isValid: boolean;
}

export interface ErrorResponse {
  error: string;
  code: string;
  details?: any;
}
export interface CalculationRequest {
  num1: number;
  num2: number;
  operation: Operation;
}

export interface CalculationResult {
  result: number;
  txid?: string;
  fee?: number;
  rawTx?: string;
  taprootAddress?: string;
  privateKey?: string;
  publicKey?: string;
  scriptHash?: string;
  broadcastStatus?: string;
  confirmationStatus?: string;
}

export type Operation = 'add' | 'subtract' | 'multiply' | 'divide';

export interface UTXO {
  txid: string;
  vout: number;
  value: number; // in satoshis
  scriptPubKey: string;
  confirmations?: number; // Optional: number of confirmations
}


/**
 * Represents a key pair, including the private key in WIF format and the corresponding public key.
 */
export interface KeyPair {
  privateKeyWIF: string;
  publicKey: Buffer;
}

/**
 * Data required to create the initial offline transaction.
 */
export interface SenderData {
  senderKeyPair: KeyPair;
  receiverPublicKey: Buffer;
  amount: number; // in satoshis
  utxos: UTXO[];
  refundTimeLock: number; // in blocks
}

/**
 * The output of the sender's offline transaction creation process.
 * This data is used to generate the two QR codes.
 */
export interface OfflineTxoData {
  psbt: string; // The partially signed transaction, ready for broadcast (QR Code A)
  preimage: string; // The secret for the receiver (QR Code B)
  taprootAddress: string;
  txid: string;
  vout: number;
  senderPublicKey?: string; // Optional sender public key for HTLC
  refundTimeLock?: number; // Optional refund timelock for HTLC
  value?: number; // Optional value for HTLC
}

/**
 * Data required for the receiver to claim the funds.
 */
export interface ReceiverClaimData {
  receiverKeyPair: KeyPair;
  preimage: Buffer;
  transaction: { // The broadcasted transaction details
    txid: string;
    vout: number;
    value: number;
  };
  senderPublicKey: Buffer;
  refundTimeLock: number;
}

/**
 * Data required for the sender to reclaim the funds after the timeout.
 */
export interface SenderRefundData {
  senderKeyPair: KeyPair;
  transaction: { // The original broadcasted transaction details
    txid: string;
    vout: number;
    value: number;
  };
  receiverPublicKey: Buffer;
  refundTimeLock: number;
}

/**
 * The final signed transaction, ready to be broadcast.
 */
export interface SignedTransaction {
  psbt: string;
  txid: string;
  rawTx: string;
}

/**
 * Represents a taproot script.
 */
export interface TaprootScript {
  script: Buffer;
  leafVersion: number;
  scriptHash: string;
}

/**
 * Represents a transaction status.
 */
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

/**
 * Represents an address info.
 */
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

/**
 * Represents a fee estimate.
 */
export interface FeeEstimate {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

/**
 * Represents an error response.
 */
export interface ErrorResponse {
  error: string;
  code: string;
  details?: any;
}
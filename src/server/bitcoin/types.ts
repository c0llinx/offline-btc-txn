export type Satoshi = number & { _brand: 'Satoshi' };

// Constants for better maintainability
export const BITCOIN_CONSTANTS = {
  SATOSHIS_PER_BTC: 100_000_000,
  DEFAULT_MIN_CONFIRMATIONS: 1,
} as const;

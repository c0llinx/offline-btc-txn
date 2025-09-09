import { Satoshi } from './types';

export interface UTXO {
  txid: string;
  /**
   * vout is the output index of this utxo within
   * the transaction
   **/
  vout: number;
  amount: Satoshi;
  /**
   * address refers to the bitcoin address that owns
   * or controls the UTXOs
   **/
  address: string;
  /**
   * confirmations contains the number of blocks that have
   * been mined since this transaction was included
   **/
  confirmations: number;
  scriptPubKey: string;
  derivationPath?: string;
}

/**
 * balance keeps track of the balance of a wallet
 * NOTE: balance is immutable by design. updating the balance of a wallet
 * requires creating a new balance instance from UTXOs
 * */
export class Balance {
  private readonly _total: number = 0;
  private readonly _confirmed: number = 0;
  private readonly _unconfirmed: number = 0;
  private readonly _utxoCount: number = 0;
  constructor(
    confirmed: number = 0,
    unconfirmed: number = 0,
    utxoCount: number
  ) {
    this._confirmed = Math.max(0, confirmed);
    this._unconfirmed = Math.max(0, unconfirmed);
    this._total = this._confirmed + this._unconfirmed;
    this._utxoCount = Math.max(0, utxoCount);
  }

  get total(): number {
    return this._total;
  }

  get confirmed(): number {
    return this._confirmed;
  }

  get unconfirmed(): number {
    return this._unconfirmed;
  }

  get utxCount(): number {
    return this._utxoCount;
  }

  /**
   * Creates a Balance from an array of UTXOs
   * @param utxos Array of UTXOs to calculate balance from
   * @param minConfirmations Minimum confirmations to consider confirmed (default: 1)
   * @returns New Balance instance
   */
  static fromUtxos(utxos: UTXO[], minConfirmations: number = 1): Balance {
    if (!Array.isArray(utxos)) {
      throw new Error('UTXOs must be an array');
    }

    const confirmed = utxos
      .filter((utxo) => utxo.confirmations >= minConfirmations)
      .reduce((sum, utxo) => sum + utxo.amount, 0);

    const unconfirmed = utxos
      .filter((utxo) => utxo.confirmations < minConfirmations)
      .reduce((sum, utxo) => sum + utxo.amount, 0);

    return new Balance(confirmed, unconfirmed, utxos.length);
  }

  /**
   * Converts total balance from satoshis to BTC
   * @returns Total balance in BTC
   */
  totalBtc(): number {
    return this.satoshisToBtc(this._total);
  }

  /**
   * Converts confirmed balance from satoshis to BTC
   * @returns Confirmed balance in BTC
   */
  confirmedBtc(): number {
    return this.satoshisToBtc(this._confirmed);
  }

  /**
   * Converts unconfirmed balance from satoshis to BTC
   * @returns Unconfirmed balance in BTC
   */
  unconfirmedBtc(): number {
    return this.satoshisToBtc(this._unconfirmed);
  }

  /**
   * Converts satoshis to BTC
   * @param satoshis Amount in satoshis
   * @returns Amount in BTC
   */
  private satoshisToBtc(satoshis: number): number {
    return satoshis / 100_000_000;
  }

  /**
   * Returns a string representation of the balance
   * @returns Formatted balance string
   */
  toString(): string {
    return `Balance: ${this.totalBtc().toFixed(8)} BTC (${this._confirmed / 100_000_000} confirmed + ${this._unconfirmed / 100_000_000} unconfirmed) [${this._utxoCount} UTXOs]`;
  }

  /**
   * Returns JSON representation of the balance
   * @returns Object with balance details
   */
  toJSON(): {
    total: number;
    confirmed: number;
    unconfirmed: number;
    utxoCount: number;
    totalBtc: number;
    confirmedBtc: number;
    unconfirmedBtc: number;
  } {
    return {
      total: this._total,
      confirmed: this._confirmed,
      unconfirmed: this._unconfirmed,
      utxoCount: this._utxoCount,
      totalBtc: this.totalBtc(),
      confirmedBtc: this.confirmedBtc(),
      unconfirmedBtc: this.unconfirmedBtc(),
    };
  }

  /**
   * Checks if the balance has sufficient confirmed funds
   * @param amount Required amount in satoshis
   * @returns True if sufficient confirmed balance exists
   */
  hasConfirmedFunds(amount: number): boolean {
    return this._confirmed >= amount;
  }

  /**
   * Checks if the balance has sufficient total funds (confirmed + unconfirmed)
   * @param amount Required amount in satoshis
   * @returns True if sufficient total balance exists
   */
  hasTotalFunds(amount: number): boolean {
    return this._total >= amount;
  }
}

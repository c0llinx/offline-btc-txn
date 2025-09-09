import { BitcoinNetwork, NetworkConfig } from './networks';
import { Balance, UTXO } from './utxo';
import { HDWallet } from './keys';
import { generateMnemonic } from 'bip39';

/** AddressInfo contains information about a bitcoin address
 * within a HD wallet.
 *
 * This interface tracks the position and usage status of address
 * generated from a master key using BIP44 derivaionn paths
 * */
export interface AddressInfo {
  /**
   * Account number in the HD wallet hierarchy (BIP44)
   *
   * Represents different "accounts" within the same wallet.
   * - Account 0: Primary account (most common)
   * - Account 1+: Additional accounts for organization
   *
   * Derivation: m/44'/coin_type'/account'
   *
   * @example
   * 0 // Primary Bitcoin account
   * 1 // Secondary Bitcoin account
   * 2 // Business Bitcoin account
   */
  account: number;

  /**
   * Chain type for address purpose (BIP44)
   *
   * Indicates whether this is an external (receiving) or internal (change) address:
   * - 0: External chain (receiving addresses - shown to others)
   * - 1: Internal chain (change addresses - used internally by wallet)
   *
   * Derivation: m/44'/coin_type'/account'/change
   *
   * @example
   * 0 // External/receiving address (for receiving payments)
   * 1 // Internal/change address (for transaction change)
   */
  change: number;

  /**
   * Address index within the chain
   *
   * Sequential number identifying this specific address withinits chain.
   * Typically starts at 0 and increments for each new address generated.
   *
   * Derivation: m/44'/coin_type'/account'/change/index
   *
   * @example
   * 0  // First address in the chain
   * 1  // Second address in the chain
   * 25 // 26th address in the chain
   */
  index: number;

  //Complete BIP44 derivation path for this address
  derivationPath: string;

  // Whether this address has been used in any transactions either as
  // a receiver or sender
  used: boolean;
}

export class OfflineBitcoinWallet {
  networkConfig: NetworkConfig;
  hdWallet: HDWallet;
  addressGenerator: any;
  utxos: UTXO[] = [];
  nextReceivingIndex = 0;
  nextChangeIndex = 0;
  usedAddresses: { [address: string]: AddressInfo } = {};

  constructor(network: BitcoinNetwork, passphrase: string) {
    this.networkConfig = NetworkConfig.create(network);
    let mnemonic = generateMnemonic();
    this.hdWallet = HDWallet.fromMnemonic(network, mnemonic);
  }

  static from_mnemonic(
    network: BitcoinNetwork,
    mnemonic: string
  ): OfflineBitcoinWallet {}
}

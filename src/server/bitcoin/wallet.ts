import { BitcoinNetwork, MapToBitcoinNetwork, NetworkConfig } from './networks';
import { Balance, UTXO } from './utxo';
import { HDWallet } from './keys';
import { TaprootAddressGenerator } from '../taproot/address';
import { generateMnemonic, validateMnemonic } from 'bip39';

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
  addressGenerator: TaprootAddressGenerator;
  utxos: UTXO[] = [];
  nextReceivingIndex = 0;
  nextChangeIndex = 0;
  usedAddresses: { [address: string]: AddressInfo } = {};

  private constructor(network: BitcoinNetwork, hdWallet: HDWallet) {
    this.networkConfig = NetworkConfig.create(network);
    this.hdWallet = hdWallet;
    this.addressGenerator = new TaprootAddressGenerator(network);
  }

  /**
   * Creates a new wallet from a newly generated mnemonic.
   * @returns A tuple containing the new wallet instance and the mnemonic phrase.
   */
  static async new(
    network: BitcoinNetwork
  ): Promise<[OfflineBitcoinWallet, string]> {
    const mnemonic = generateMnemonic();
    const wallet = await OfflineBitcoinWallet.fromMnemonic(mnemonic, network);
    return [wallet, mnemonic];
  }

  /**
   * Recovers a wallet from an existing mnemonic.
   * @param mnemonic The 12 or 24-word seed phrase.
   * @param network The network to use (Mainnet, Testnet).
   * @returns The recovered wallet instance.
   */
  static async fromMnemonic(
    mnemonic: string,
    network: BitcoinNetwork
  ): Promise<OfflineBitcoinWallet> {
    if (!validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic provided');
    }
    const hdWallet = HDWallet.fromMnemonic(network, mnemonic);
    return new OfflineBitcoinWallet(network, hdWallet);
  }

  public get network(): BitcoinNetwork {
    return this.networkConfig.network;
  }

  public generateNewReceivingAddress(
    account: number,
    change: number,
    index: number = this.nextReceivingIndex
  ): string {
    const pubKey = this.hdWallet.generateMasterExtendedPublicKey();
    const derivationPath = this.hdWallet.getDerivationPath(
      account,
      change,
      index
    );
    const address = this.addressGenerator.generateAddress(
      this.hdWallet,
      0,
      this.nextChangeIndex,
      this.nextReceivingIndex
    );

    const addressInfo: AddressInfo = {
      account,
      change,
      index,
      derivationPath,
      used: false,
    };

    this.usedAddresses[address] = addressInfo;
    this.nextReceivingIndex += 1;

    return address;
  }

  public getAllAddresses(): string[] {
    return Object.keys(this.usedAddresses);
  }

  public addUtxos(newUtxos: UTXO[]): void {
    for (const newUtxo of newUtxos) {
      const exists = this.utxos.some(
        (existing) =>
          existing.txid === newUtxo.txid && existing.vout === newUtxo.vout
      );
      if (!exists) {
        this.utxos.push(newUtxo);
      }
    }
  }

  public removeUtxo(txid: string, vout: number): void {
    this.utxos = this.utxos.filter(
      (utxo) => !(utxo.txid === txid && utxo.vout === vout)
    );
  }

  public getBalance(): Balance {
    return Balance.fromUtxos(this.utxos);
  }

  public getUtxosForAddress(address: string): UTXO[] {
    return this.utxos.filter((utxo) => utxo.address === address);
  }

  public getAllUtxos(): UTXO[] {
    return this.utxos;
  }

  public markAddressUsed(address: string): void {
    if (this.usedAddresses[address]) {
      this.usedAddresses[address].used = true;
    }
  }

  public getFaucetUrls(): string[] {
    return this.networkConfig.faceutUrls;
  }

  public getApiEndpoints(): string[] {
    return this.networkConfig.apiEndpoints;
  }

  public exportData(): string {
    const data = {
      network: this.networkConfig.network,
      next_receiving_index: this.nextReceivingIndex,
      next_change_index: this.nextChangeIndex,
      used_addresses: this.usedAddresses,
      utxos: this.utxos,
    };
    return JSON.stringify(data, null, 2);
  }
}

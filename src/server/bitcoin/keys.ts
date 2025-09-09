import BIP32Factory from 'bip32';
import { BitcoinNetwork, MapToBitcoinNetwork } from './networks.ts';
import { generateMnemonic, mnemonicToSeedSync, validateMnemonic } from 'bip39';
import * as ecc from 'tiny-secp256k1';

export class HDWallet {
  network: BitcoinNetwork;
  /**
   * xpriv is the master extended private key
   * */
  private xpriv: string = '';

  private constructor(network: BitcoinNetwork) {
    this.network = network;
  }

  static fromMnemonic(network: BitcoinNetwork, mnemonic: string): HDWallet {
    if (!validateMnemonic(mnemonic)) {
      throw new Error('invalid mnemonic provided');
    }
    let hdWallet = new HDWallet(network);
    hdWallet.generateMasterExtendedPrivateKey(mnemonic);
    return hdWallet;
  }

  private generateMasterExtendedPrivateKey(
    mnemonic: string,
    passphrase: string = ''
  ): void {
    let seed = mnemonicToSeedSync(mnemonic, passphrase);
    let bip32Factory = BIP32Factory(ecc);
    let masterKey = bip32Factory.fromSeed(
      seed,
      MapToBitcoinNetwork(this.network)
    );
    this.xpriv = masterKey.toBase58();
  }

  private generateMasterExtendedPublicKey(): string {
    let bip32Factory = BIP32Factory(ecc);
    const masterKey = bip32Factory.fromBase58(this.xpriv);
    const pubKey = masterKey.neutered().toBase58();
    return pubKey;
  }

  getDerivationPath(account: number, change: number, index: number): string {
    const coinType = this.network === BitcoinNetwork.Mainnet ? 0 : 1;
    return `m/86'/${coinType}'/${account}'/${change}/${index}`;
  }
}

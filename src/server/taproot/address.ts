import { BitcoinNetwork, MapToBitcoinNetwork } from '../bitcoin/networks';
import { HDWallet } from '../bitcoin/keys';
import { initEccLib, payments } from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import BIP32Factory from 'bip32';

export class TaprootAddressGenerator {
  constructor(public network: BitcoinNetwork) {
    initEccLib(ecc);
  }

  generateAddress(
    hdWallet: HDWallet,
    account: number,
    change: number,
    index: number
  ): string {
    let bip32Factory = BIP32Factory(ecc);
    const derivationPath = hdWallet.getDerivationPath(account, change, index);
    const masterPubKey = bip32Factory.fromBase58(
      hdWallet.generateMasterExtendedPublicKey()
    );

    const childPubKey = masterPubKey.derivePath(derivationPath);
    let p2tr = payments.p2tr({
      pubkey: Buffer.from(childPubKey.publicKey.subarray(1, 33)),
      network: MapToBitcoinNetwork(this.network),
    });
    if (!p2tr.address) {
      throw new Error('Failed to derive Taproot address');
    }
    return p2tr.address;
  }
}

import { Satoshi } from './types';
import { networks, Network } from 'bitcoinjs-lib';

export enum BitcoinNetwork {
  Mainnet = 'mainnet',
  Testnet = 'testnet',
  Signet = 'signet',
  Regtest = 'regtest',
}

export function MapToBitcoinNetwork(network: BitcoinNetwork): Network {
  const networkMap = new Map<BitcoinNetwork, Network>([
    [BitcoinNetwork.Mainnet, networks.bitcoin],
    [BitcoinNetwork.Testnet, networks.testnet],
    [BitcoinNetwork.Regtest, networks.regtest],
    [BitcoinNetwork.Signet, networks.regtest],
  ]);
  const mappedNetwork = networkMap.get(network);
  if (mappedNetwork === undefined) {
    throw new Error(`Unsupported Bitcoin network: ${network}`);
  }
  return mappedNetwork;
}

export class NetworkConfig {
  // NOTE: this constructor uses the parameter properties
  // syntax to declaring and initializing the class properties
  constructor(
    public network: BitcoinNetwork,
    public defaultFeeRate: Satoshi,
    public apiEndpoints: string[],
    public faceutUrls: string[]
  ) {}

  // create generates the configuration for the network
  static create(network: BitcoinNetwork): NetworkConfig {
    switch (network) {
      case BitcoinNetwork.Mainnet:
        return new NetworkConfig(
          network,
          10 as Satoshi,
          ['https://blockstream.info/api', 'https://mempool.space/api'],
          []
        );

      case BitcoinNetwork.Testnet:
        return new NetworkConfig(
          network,
          1 as Satoshi,
          [
            'https://blockstream.info/testnet/api',
            'https://mempool.space/testnet/api',
          ],
          ['https://testnet-faucet.mempool.co', 'https://bitcoinfaucet.uo1.net']
        );

      case BitcoinNetwork.Signet:
        return new NetworkConfig(
          network,
          1 as Satoshi,
          ['https://mempool.space/signet/api'],
          ['https://signetfaucet.com']
        );

      case BitcoinNetwork.Regtest:
        return new NetworkConfig(
          network,
          1 as Satoshi,
          ['http://localhost:18443'],
          []
        );

      default:
        throw new Error(`network ${network} not supported`);
    }
  }
}

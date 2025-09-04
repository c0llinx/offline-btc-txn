import { RealBitcoinCalculator } from './bitcoin.js';

/**
 * Lightweight placeholder implementation of the offline funding / claim / refund
 * workflow so that the API and dev environment compile. Full logic will be added
 * incrementally – for now each method only returns TODO stubs while maintaining
 * the expected shapes used by `server.ts`.
 */
export class OfflineWorkflowService {
  private wallet = new RealBitcoinCalculator();

  /**
   * Sender creates the initial funding PSBT to a Taproot address.
   */
  async createFundingPSBT(
    senderWif: string,
    receiverPubKeyHex: string,
    amount: number,
    refundLocktime: number
  ) {
    // TODO: implement real logic using this.wallet
    // Returning minimal shape consumed by front-end.
    return {
      psbt: 'TODO',
      preimage: 'TODO',
      taprootAddress: 'TODO',
      txid: 'TODO',
      vout: 0
    };
  }

  /**
   * Receiver claims the funds with preimage before timelock.
   */
  async createClaimPSBT(
    receiverWif: string,
    preimageHex: string,
    txid: string,
    vout: number,
    value: number,
    senderPublicKeyHex: string,
    refundTimeLock: number
  ) {
    return {
      psbt: 'TODO',
      txid: 'TODO',
      rawTx: 'TODO'
    };
  }

  /**
   * Sender refunds the funds after timelock.
   */
  async createRefundPSBT(
    senderWif: string,
    txid: string,
    vout: number,
    value: number,
    receiverPublicKeyHex: string,
    refundTimeLock: number
  ) {
    return {
      psbt: 'TODO',
      txid: 'TODO',
      rawTx: 'TODO'
    };
  }
}

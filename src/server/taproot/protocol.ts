/*
 * This file acts as a stateless library that defines the smart contract
 * logic for offline payment. It would be the single source of truth for
 * how the TapScript and addresses are constructed. The sender and
 * receiver would use this module to ensure they are working with the
 * same smart contract
 */

import * as bitcoin from 'bitcoinjs-lib';

/**
 * Creates the two spending path scripts that forms the core of the conditional payment contract
 * - Claim Path: Allows the receiver to spend the funds by providing a secret (preimage)
 * - Refund Path: Allows the sender to reclaim the funds after a specified timelock
 * @param senderPublicKey The x-only public key of the sender
 * @param receiverPublickey The public key of the receiver
 * @param preimageHash The HASH160 of the secret preimage
 * @param refundTimeLock The block height from which the refund path becomes available
 * @returns an object containing the compiled claim and refund scripts
 */
export function createSpendingScripts(
  senderPublicKey: Buffer,
  receiverPublickey: Buffer,
  preImageHash: Buffer,
  refundTimeLock: number
): { claimScript: Buffer; refundScript: Buffer } {
  /*
   *The receiver must provide a witness (unlocking script) containing: `[signature, preimage]`
   * 1.  `OP_HASH160`: Takes the `<preimage>` from the witness, hashes it, and puts the result on the stack.
   * 2.  `[preimageHash]`: The script pushes the known correct hash onto the stack.
   * 3.  `OP_EQUALVERIFY`: Compares the two hashes. If they're not equal, the script fails immediately. If they are equal, it clears them from the stack.
   * 4.  `[receiverPublicKey]`: The script pushes the receiver's public key onto the stack.
   * 5.  `OP_CHECKSIG`: Takes the `<receiverPublicKey>` and the `<signature>` from the witness. If the signature is a valid signature of the transaction for that public key, the script succeeds.
   */
  const claimScript = bitcoin.script.compile([
    bitcoin.opcodes.OP_HASH160,
    preImageHash,
    bitcoin.opcodes.OP_EQUALVERIFY,
    receiverPublickey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);

  /*
   * The sender must provide a witness containing just their `[signature]`. A critical precondition is that
   * the transaction's `nLockTime` field must be set to a value >= `refundTimeLock`.
   *
   * 1.  `[refundTimeLock]`: The script pushes the required lock time (as a block height) onto the stack.
   * 2.  `OP_CHECKLOCKTIMEVERIFY` (CLTV): This opcode checks the transaction's `nLockTime`. If it's less than `refundTimeLock`, the script fails. This enforces the time delay.
   * 3.  `OP_DROP`: The `refundTimeLock` value is no longer needed, so this removes it from the stack.
   * 4.  `[senderPublicKey]`: The script pushes the sender's public key onto the stack.
   * 5.  `OP_CHECKSIG`: Verifies the sender's `<signature>` from the witness against their public key. If valid, the script succeeds.
   */
  const refundScript = bitcoin.script.compile([
    bitcoin.script.number.encode(refundTimeLock),
    bitcoin.opcodes.OP_CHECKLOCKTIMEVERIFY,
    bitcoin.opcodes.OP_DROP,
    senderPublicKey,
    bitcoin.opcodes.OP_CHECKSIG,
  ]);

  return { claimScript, refundScript };
}

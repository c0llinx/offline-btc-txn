import * as bitcoin from 'bitcoinjs-lib';

/**
 * Finalizes all inputs in the PSBT and extracts the fully signed transaction.
 *
 * Before finalizing, it is recommended to validate signatures to avoid errors.
 *
 * @param psbt The PSBT object to finalize
 * @returns The fully signed bitcoinjs-lib Transaction object
 * @throws Throws if finalization or extraction fails
 */
export function finalizePsbt(psbt: bitcoin.Psbt): bitcoin.Transaction {
  // Validate signatures of all inputs before finalizing (optional but recommended)
  if (!psbt.validateSignaturesOfAllInputs()) {
    throw new Error('PSBT has invalid signatures');
  }

  // Finalize all inputs - adds final scripts/witnesses
  psbt.finalizeAllInputs();

  // Extract the finalized transaction object
  const tx = psbt.extractTransaction();

  return tx;
}

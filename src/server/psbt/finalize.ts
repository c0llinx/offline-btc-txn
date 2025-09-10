import * as bitcoin from 'bitcoinjs-lib';

/**
 * Finalizes all inputs in the PSBT and extracts the fully signed transaction.
 *
 * Before finalizing, it is recommended to validate signatures to avoid errors.
 *
 * @param psbt The PSBT object to finalize
 * @returns The fully signed bitcoinjs-lib Transaction object
 * @throws Throws if finalization or extraction fails
 * NOTE: we are not validating signatures here because it is not a multi signature
 * transaction
 */
export function finalizePsbt(psbt: bitcoin.Psbt): bitcoin.Transaction {
  // Finalize all inputs - adds final scripts/witnesses
  psbt.finalizeAllInputs();

  // Extract the finalized transaction object
  const tx = psbt.extractTransaction();

  return tx;
}

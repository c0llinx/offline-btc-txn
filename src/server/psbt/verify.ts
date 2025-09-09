import * as bitcoin from 'bitcoinjs-lib';

/**
 * Verifies that all inputs of the PSBT are signed and the signatures are valid.
 *
 * This can be run offline to check if a PSBT is correctly signed before broadcasting.
 *
 * @param psbt The PSBT object to verify
 * @returns True if all inputs have valid signatures, false otherwise
 */
export function verifyPsbtSignatures(psbt: bitcoin.Psbt): boolean {
  for (let i = 0; i < psbt.inputCount; i++) {
    if (!psbt.validateSignaturesOfInput(i)) {
      return false;
    }
  }
  return true;
}

/**
 * Checks if the PSBT is fully signed and ready to be finalized.
 *
 * @param psbt The PSBT object
 * @returns True if all inputs are signed and finalized or ready, false otherwise
 */
export function isPsbtFinalized(psbt: bitcoin.Psbt): boolean {
  for (let i = 0; i < psbt.inputCount; i++) {
    if (!psbt.inputHasUTXO(i)) {
      // Cannot finalize without UTXO info
      return false;
    }
    if (!psbt.inputHasFinalizedScript(i)) {
      // If any inputs are not finalized, PSBT is not yet finalized
      return false;
    }
  }
  return true;
}
